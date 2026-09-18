import type { NodePath, PluginObj, PluginPass } from '@babel/core'
import * as t from '@babel/types'
import jsxSyntaxPlugin from '@babel/plugin-syntax-jsx'
import { addNamed } from '@babel/helper-module-imports'
import { compileRunOnce } from './run-once.js'
import { jsxTextValue } from './jsx-text.js'
import type { ModuleMetadata } from './module-contracts.js'

type IntrinsicNamespace = 'html' | 'svg'
const SVG_ONLY_INTRINSICS = new Set([
  'animate', 'animateMotion', 'animateTransform', 'circle', 'clipPath', 'defs',
  'desc', 'ellipse', 'feBlend', 'feColorMatrix', 'feComponentTransfer',
  'feComposite', 'feConvolveMatrix', 'feDiffuseLighting', 'feDisplacementMap',
  'feDistantLight', 'feDropShadow', 'feFlood', 'feFuncA', 'feFuncB', 'feFuncG',
  'feFuncR', 'feGaussianBlur', 'feImage', 'feMerge', 'feMergeNode',
  'feMorphology', 'feOffset', 'fePointLight', 'feSpecularLighting', 'feSpotLight',
  'feTile', 'feTurbulence', 'filter', 'foreignObject', 'g', 'image', 'line',
  'linearGradient', 'marker', 'mask', 'metadata', 'mpath', 'path', 'pattern',
  'polygon', 'polyline', 'radialGradient', 'rect', 'stop', 'switch', 'symbol',
  'text', 'textPath', 'tspan', 'use', 'view',
])

function annotateIntrinsicNamespaces(program: NodePath<t.Program>): void {
  program.traverse({
    JSXElement(path) {
      const opening = path.node.openingElement
      if (!t.isJSXIdentifier(opening.name)) return
      const name = opening.name.name
      const parent = path.findParent(parent => parent.isJSXElement()) as NodePath<t.JSXElement> | null
      const inherited = (parent?.node.openingElement.extra as any)?.rrjsChildNamespace as IntrinsicNamespace | undefined
      if (/^[A-Z]/.test(name)) {
        if (inherited === 'svg') {
          throw path.buildCodeFrameError('SVG component children require cross-component namespace compilation')
        }
        return
      }
      const namespace: IntrinsicNamespace = name === 'svg' ? 'svg' : inherited ?? 'html'
      if (namespace === 'html' && SVG_ONLY_INTRINSICS.has(name)) {
        throw path.buildCodeFrameError(`SVG intrinsic <${name}> requires an <svg> ancestor in the same compiled module`)
      }
      opening.extra = {
        ...(opening.extra ?? {}),
        rrjsNamespace: namespace,
        rrjsChildNamespace: namespace === 'svg' && name === 'foreignObject' ? 'html' : namespace,
      }
    },
  })
}

function rewriteRunOnceReactDomImports(program: NodePath<t.Program>, importSource: string): void {
  for (const statement of program.get('body')) {
    if (!statement.isImportDeclaration() || statement.node.source.value !== 'react-dom') continue
    for (const specifier of statement.get('specifiers')) {
      if (!specifier.isImportSpecifier()) {
        throw specifier.buildCodeFrameError('Strict portal compilation requires a named createPortal import from react-dom')
      }
      const imported = specifier.node.imported
      const name = t.isIdentifier(imported) ? imported.name : imported.value
      if (name !== 'createPortal') {
        throw specifier.buildCodeFrameError(`Unsupported react-dom import ${name}; only named createPortal is supported`)
      }
    }
    statement.node.source = t.stringLiteral(importSource)
  }
}

export {
  defineModuleContracts,
  resolveModuleMetadata,
} from './module-contracts.js'
export type {
  ImportedComponentContract,
  ImportedModuleContract,
  ModuleContractManifest,
  ModuleMetadata,
} from './module-contracts.js'

// ─── The Plugin ──────────────────────────────────────────────────────────────
// Transforms JSX into h() calls.
// Dynamic expressions (signals, computeds, variables that may change)
// are wrapped in thunks so the renderer can subscribe them to signal changes.
//
// By default the plugin injects `import { h, list } from '@rrjs/renderer'`
// into any file that actually emitted those identifiers — the same job
// `@babel/plugin-transform-react-jsx` does under `runtime: 'automatic'`.
// Without that injection, every component file throws `h is not defined`
// (D16). `injectImports: false` is the classic runtime, for eval harnesses
// that already bind `h`/`list` as parameters.

export type PluginOptions = {
  /**
   * Compile the checked React-source subset without component re-execution or
   * list reconciliation. Default: true. Set false for the older path, which
   * wraps reactive reads instead and does not run component bodies once.
   */
  runOnce?: boolean
  /** Module to import `h` and `list` from. Default: `@rrjs/renderer`. */
  importSource?: string
  /**
   * When false, assume `h`/`list` are already in scope. Used by the audit
   * harness, which evals compiled output with `new Function('h', 'list', ...)`.
   * Default: true.
   */
  injectImports?: boolean
  /** Explicit module-graph facts supplied by an integrating build tool. */
  moduleMetadata?: ModuleMetadata
}

type Runtime = {
  h: () => t.Identifier
  list: () => t.Identifier
}

function makeRuntime(path: NodePath, state: PluginPass): Runtime {
  const opts = (state.opts ?? {}) as PluginOptions
  const inject = opts.injectImports !== false
  const source = opts.importSource ?? '@rrjs/renderer'

  if (!inject) {
    return {
      h: () => t.identifier('h'),
      list: () => t.identifier('list'),
    }
  }

  return {
    h: () => {
      let id = state.get('rrjs.h') as t.Identifier | undefined
      if (!id) {
        id = addNamed(path, 'h', source)
        state.set('rrjs.h', id)
      }
      return t.cloneNode(id)
    },
    list: () => {
      let id = state.get('rrjs.list') as t.Identifier | undefined
      if (!id) {
        id = addNamed(path, 'list', source)
        state.set('rrjs.list', id)
      }
      return t.cloneNode(id)
    },
  }
}

export default function reactiveReactPlugin(): PluginObj<PluginPass> {
  return {
    name: 'babel-plugin-reactive-react',
    inherits: (jsxSyntaxPlugin as any).default ?? jsxSyntaxPlugin,

    visitor: {
      Program(path, state) {
        const opts = state.opts as PluginOptions
        annotateIntrinsicNamespaces(path)
        if (opts?.runOnce === false) return
        rewriteRunOnceReactDomImports(path, opts.importSource ?? '@rrjs/renderer')
        let helper: t.Identifier | undefined
        let selector: t.Identifier | undefined
        compileRunOnce(path, () => {
          if (opts.injectImports === false) return t.identifier('derive')
          helper ??= addNamed(path, 'derive', '@rrjs/react-compat')
          return t.cloneNode(helper)
        }, () => {
          if (opts.injectImports === false) return t.identifier('choose')
          selector ??= addNamed(path, 'choose', opts.importSource ?? '@rrjs/renderer')
          return t.cloneNode(selector)
        }, (name) => {
          if (opts.injectImports === false) return t.identifier(name)
          const key = `rrjs.${name}`
          let id = state.get(key) as t.Identifier | undefined
          if (!id) {
            id = addNamed(path, name, opts.importSource ?? '@rrjs/renderer')
            state.set(key, id)
          }
          return t.cloneNode(id)
        }, opts.moduleMetadata)
      },
      JSXElement(path, state) {
        const rt = makeRuntime(path, state)
        path.replaceWith(transformElement(path.node, rt))
      },

      JSXFragment(path, state) {
        // Fragments: <>...</> → [child, child, ...]
        // We use an array because there's no h() call for fragments yet
        const rt = makeRuntime(path, state)
        const children = filterChildren(path.node.children).map(c => transformChild(c, rt))
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

function transformElement(element: t.JSXElement, rt: Runtime): t.CallExpression {
  const openingElement = element.openingElement
  const tag = transformTag(openingElement.name)
  const isNativeElement = t.isStringLiteral(tag)
  let props = transformProps(openingElement.attributes, isNativeElement)
  if (isNativeElement && (openingElement.extra as any)?.rrjsNamespace === 'svg') {
    const marker = t.objectProperty(t.stringLiteral('__rrjsNamespace'), t.stringLiteral('svg'))
    if (t.isObjectExpression(props)) props.properties.unshift(marker)
    else props = t.objectExpression([marker])
  }
  const children = filterChildren(element.children).map(c => transformChild(c, rt))

  return t.callExpression(rt.h(), [
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
  child: t.JSXText | t.JSXExpressionContainer | t.JSXSpreadChild | t.JSXElement | t.JSXFragment,
  rt: Runtime
): t.Expression {
  if (t.isJSXText(child)) {
    return t.stringLiteral(jsxTextValue(child))
  }

  if (t.isJSXExpressionContainer(child)) {
    const expr = child.expression

    if (expr.extra?.rrjsRegion) return expr as t.Expression

    if (t.isJSXEmptyExpression(expr)) {
      return t.nullLiteral()
    }

    if (isStaticExpression(expr)) {
      return expr
    }

    // The strict run-once pass marks maps whose source membership is a fixed
    // source array. Execute ordinary Array#map once instead of importing the
    // keyed reconciler used by the plugin's general mode.
    if (expr.extra?.rrjsStaticMap) return wrapInThunk(expr as t.Expression)

    // Try the list-as-JSX transform first.
    // If the expression matches items.map((item) => <X key={...} />),
    // rewrite it to a list() call for keyed reconciliation.
    const listCall = tryTransformMapToList(expr, rt)
    if (listCall) return listCall

    // Calls may read signals, including through helpers. Evaluate them inside
    // the child's reactive binding just like other dynamic expressions.
    return wrapInThunk(expr)
  }

  if (t.isJSXElement(child) || t.isJSXFragment(child)) {
    return t.isJSXElement(child)
      ? transformElement(child, rt)
      : t.arrayExpression(filterChildren(child.children).map(c => transformChild(c, rt)))
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

function tryTransformMapToList(expr: t.Expression, rt: Runtime): t.CallExpression | null {
  // Must be a method call to .map
  if (!t.isCallExpression(expr)) return null
  if (!t.isMemberExpression(expr.callee)) return null
  if (expr.callee.computed || !t.isIdentifier(expr.callee.property, { name: 'map' })) return null

  // Must have a single callback argument
  if (expr.arguments.length !== 1) return null
  const callback = expr.arguments[0]
  // Function expressions can depend on their own `this` or `arguments`.
  // Preserve their ordinary map execution until those semantics are modeled.
  if (!t.isArrowFunctionExpression(callback) || callback.async) return null

  // The keyed renderer currently supplies only a reactive item proxy. Keep
  // native map evaluation for callbacks that also need an index/source array.
  if (callback.params.length !== 1) return null
  const itemParam = callback.params[0]
  if (!t.isIdentifier(itemParam)) return null  // skip destructured params for safety

  // Callback body must return a JSX element with a `key` prop.
  // Support both expression-bodied and block-bodied arrows.
  let returnedJsx: t.JSXElement | null = null

  if (t.isJSXElement(callback.body)) {
    returnedJsx = callback.body
  } else if (t.isBlockStatement(callback.body)) {
    // Extracting only the return would discard declarations, side effects,
    // or branches. More complex callbacks use the reactive child path.
    if (callback.body.body.length !== 1) return null
    const stmt = callback.body.body[0]
    if (t.isReturnStatement(stmt) && t.isJSXElement(stmt.argument)) returnedJsx = stmt.argument
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
  const transformedRenderJsx = transformElement(returnedJsx, rt)

  return t.callExpression(rt.list(), [
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
  // Preserve intentional inline spaces between children. Whitespace containing
  // a line break is formatting indentation and does not produce a React child.
  return children.filter(child => !t.isJSXText(child) || jsxTextValue(child).length > 0)
}
