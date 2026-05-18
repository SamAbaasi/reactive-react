import type { PluginObj, PluginPass } from '@babel/core'
import * as t from '@babel/types'
import jsxSyntaxPlugin from '@babel/plugin-syntax-jsx'

// ─── The Plugin ──────────────────────────────────────────────────────────────
// Transforms JSX into h() calls.
// Dynamic expressions (signals, computeds, variables that may change)
// are wrapped in thunks so the renderer can subscribe them to signal changes.

export default function reactiveReactPlugin(): PluginObj<PluginPass> {
  return {
    name: 'babel-plugin-reactive-react',
    inherits: (jsxSyntaxPlugin as any).default ?? jsxSyntaxPlugin,

    visitor: {
      JSXElement(path) {
        const replacement = transformElement(path.node)
        path.replaceWith(replacement)
      },

      JSXFragment(path) {
        // Fragments: <>...</> → [child, child, ...]
        // We use an array because there's no h() call for fragments yet
        const children = filterChildren(path.node.children).map(transformChild)
        path.replaceWith(t.arrayExpression(children))
      },
    },
  }
}

// ─── Transform a JSX element into an h() call ────────────────────────────────



// ─── Transform the tag name ──────────────────────────────────────────────────
// <div>  → 'div'   (string — lowercase, native HTML element)
// <App>  → App     (identifier — a component function)

function transformTag(name: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName): t.Expression {
  if (t.isJSXIdentifier(name)) {
    // Lowercase = native element, uppercase = component
    if (/^[a-z]/.test(name.name)) {
      return t.stringLiteral(name.name)
    }
    return t.identifier(name.name)
  }

  // <Module.Component>  → Module.Component
  if (t.isJSXMemberExpression(name)) {
    return convertMemberExpression(name)
  }

  // <namespace:tag> — not supported
  throw new Error('JSXNamespacedName is not supported')
}

function convertMemberExpression(node: t.JSXMemberExpression): t.MemberExpression {
  const object = t.isJSXMemberExpression(node.object)
    ? convertMemberExpression(node.object)
    : t.identifier(node.object.name)
  return t.memberExpression(object, t.identifier(node.property.name))
}

// ─── Transform props/attributes ──────────────────────────────────────────────



function getAttributeName(name: t.JSXIdentifier | t.JSXNamespacedName): string {
  if (t.isJSXIdentifier(name)) return name.name
  throw new Error('Namespaced JSX attributes not supported')
}

function transformElement(element: t.JSXElement): t.CallExpression {
  const openingElement = element.openingElement
  const tag = transformTag(openingElement.name)
  const isNativeElement = t.isStringLiteral(tag)
  const props = transformProps(openingElement.attributes, isNativeElement)
  const children = filterChildren(element.children).map(transformChild)

  return t.callExpression(t.identifier('h'), [
    tag,
    props,
    ...children,
  ])
}

function transformProps(
  attrs: Array<t.JSXAttribute | t.JSXSpreadAttribute>,
  isNativeElement: boolean
): t.Expression {
  if (attrs.length === 0) return t.nullLiteral()

  const properties: Array<t.ObjectProperty | t.SpreadElement> = []

  for (const attr of attrs) {
    if (t.isJSXSpreadAttribute(attr)) {
      properties.push(t.spreadElement(attr.argument))
      continue
    }

    const name = getAttributeName(attr.name)
    const value = transformAttributeValue(name, attr.value, isNativeElement)
    properties.push(t.objectProperty(t.stringLiteral(name), value))
  }

  return t.objectExpression(properties)
}

function transformAttributeValue(
  name: string,
  value: t.JSXAttribute['value'],
  isNativeElement: boolean
): t.Expression {
  if (value === null || value === undefined) {
    return t.booleanLiteral(true)
  }

  if (t.isStringLiteral(value)) {
    return value
  }

  if (t.isJSXExpressionContainer(value)) {
    const expr = value.expression

    if (t.isJSXEmptyExpression(expr)) {
      return t.nullLiteral()
    }

    // ref is special: never wrap.
    if (name === 'ref') {
      return expr
    }

    // Event handlers: never wrap.
    if (isEventHandler(name)) {
      return expr
    }

    // Static literals: pass through.
    if (isStaticExpression(expr)) {
      return expr
    }

    // The critical distinction:
    // - On native HTML elements, dynamic prop values become reactive bindings.
    //   The renderer wraps them in an effect to keep the DOM attribute in sync.
    //   So we wrap them in thunks here.
    // - On user-defined components (uppercase tag), props are passed through.
    //   The component receives the plain value and uses it directly.
    //   Wrapping in a thunk would corrupt the prop type.
    if (!isNativeElement) {
      return expr
    }

    return wrapInThunk(expr)
  }

  if (t.isJSXElement(value) || t.isJSXFragment(value)) {
    return isNativeElement ? wrapInThunk(value as any) : (value as any)
  }

  return t.nullLiteral()
}

// ─── Transform a child of a JSX element ──────────────────────────────────────

function transformChild(
  child: t.JSXText | t.JSXExpressionContainer | t.JSXSpreadChild | t.JSXElement | t.JSXFragment
): t.Expression {
  if (t.isJSXText(child)) {
    return t.stringLiteral(child.value)
  }

  if (t.isJSXExpressionContainer(child)) {
    const expr = child.expression

    if (t.isJSXEmptyExpression(expr)) {
      return t.nullLiteral()
    }

    if (isStaticExpression(expr)) {
      return expr
    }

    // Try the list-as-JSX transform first.
    // If the expression matches items.map((item) => <X key={...} />),
    // rewrite it to a list() call for keyed reconciliation.
    const listCall = tryTransformMapToList(expr)
    if (listCall) return listCall

    // Call expressions (like h(...) or list(...)) return Nodes directly
    // and must NOT be wrapped in a thunk.
    if (t.isCallExpression(expr)) {
      return expr
    }

    return wrapInThunk(expr)
  }

  if (t.isJSXElement(child) || t.isJSXFragment(child)) {
    return t.isJSXElement(child)
      ? transformElement(child)
      : t.arrayExpression(filterChildren(child.children).map(transformChild))
  }

  if (t.isJSXSpreadChild(child)) {
    return child.expression
  }

  return t.nullLiteral()
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function wrapInThunk(expr: t.Expression): t.ArrowFunctionExpression {
  // expr → () => expr
  return t.arrowFunctionExpression([], expr)
}
// ─── List-as-JSX transform ──────────────────────────────────────────────────
// Detects {items.map((item) => <Foo key={item.id} ... />)} and rewrites it
// to list(() => items, (item) => item.id, (item) => h(Foo, ...)).
// This wires standard JSX iteration into the keyed list reconciler
// without requiring developers to call list() directly.

function tryTransformMapToList(expr: t.Expression): t.CallExpression | null {
  // Must be a method call to .map
  if (!t.isCallExpression(expr)) return null
  if (!t.isMemberExpression(expr.callee)) return null
  if (!t.isIdentifier(expr.callee.property, { name: 'map' })) return null

  // Must have a single callback argument
  if (expr.arguments.length !== 1) return null
  const callback = expr.arguments[0]
  if (!t.isArrowFunctionExpression(callback) && !t.isFunctionExpression(callback)) return null

  // Callback should have at least one parameter (the item)
  if (callback.params.length === 0) return null
  const itemParam = callback.params[0]
  if (!t.isIdentifier(itemParam)) return null  // skip destructured params for safety

  // Callback body must return a JSX element with a `key` prop.
  // Support both expression-bodied and block-bodied arrows.
  let returnedJsx: t.JSXElement | null = null

  if (t.isJSXElement(callback.body)) {
    returnedJsx = callback.body
  } else if (t.isBlockStatement(callback.body)) {
    // Find a top-level return statement
    for (const stmt of callback.body.body) {
      if (t.isReturnStatement(stmt) && t.isJSXElement(stmt.argument)) {
        returnedJsx = stmt.argument
        break
      }
    }
  }

  if (!returnedJsx) return null

  // Find the key attribute
  const keyAttr = returnedJsx.openingElement.attributes.find(
    (a): a is t.JSXAttribute =>
      t.isJSXAttribute(a) && t.isJSXIdentifier(a.name, { name: 'key' })
  )
  if (!keyAttr) return null
  if (!keyAttr.value || !t.isJSXExpressionContainer(keyAttr.value)) return null
  const keyExpr = keyAttr.value.expression
  if (t.isJSXEmptyExpression(keyExpr)) return null

  // We have all the pieces. Build:
  //   list(
  //     () => <source>,
  //     (item) => <keyExpr>,
  //     (item) => <transformed JSX>
  //   )
  const sourceExpression = expr.callee.object as t.Expression
  const transformedRenderJsx = transformElement(returnedJsx)

  return t.callExpression(t.identifier('list'), [
    // getItems: () => items
    t.arrowFunctionExpression([], sourceExpression),
    // getKey: (item) => item.id
    t.arrowFunctionExpression([t.identifier(itemParam.name)], keyExpr),
    // render: (item) => h(...)
    t.arrowFunctionExpression([t.identifier(itemParam.name)], transformedRenderJsx),
  ])
}
function isEventHandler(name: string): boolean {
  // onClick, onInput, onMouseDown, etc.
  return /^on[A-Z]/.test(name)
}

function isStaticExpression(expr: t.Expression): boolean {
  // These can never change between renders, so no thunk needed
  return (
    t.isStringLiteral(expr) ||
    t.isNumericLiteral(expr) ||
    t.isBooleanLiteral(expr) ||
    t.isNullLiteral(expr) ||
    t.isBigIntLiteral(expr)
  )
}

function filterChildren(
  children: Array<t.JSXText | t.JSXExpressionContainer | t.JSXSpreadChild | t.JSXElement | t.JSXFragment>
): typeof children {
  // Strip whitespace-only JSXText nodes (caused by JSX formatting)
  return children.filter(child => {
    if (t.isJSXText(child)) {
      // Trim and check if anything remains
      return child.value.trim().length > 0
    }
    return true
  })
}