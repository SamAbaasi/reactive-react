import type { NodePath } from '@babel/core'
import * as t from '@babel/types'
import type { ImportedComponentContract, ModuleMetadata } from './module-contracts.js'
type Binding = NonNullable<ReturnType<NodePath['scope']['getBinding']>>

// This pass accepts a deliberately checked subset. It never introduces a
// component render loop, React fallback, or old/new tree comparison.
export function compileRunOnce(
  program: NodePath<t.Program>,
  derive: () => t.Identifier,
  choose: () => t.Identifier,
  rendererHelper: (name: 'operationList' | 'listAppend' | 'listPrepend' | 'listClear' | 'listTruncate' | 'listSplice' | 'listReverse' | 'listFilter' | 'listSort' | 'listMap' | 'listMove') => t.Identifier,
  moduleMetadata?: ModuleMetadata,
): void {
  const reactive = new Map<Binding, NodePath<t.Function>>()
  const generated = new Set<t.Node>()
  const deferredRemovals: NodePath[] = []
  const components = new Set<NodePath<t.Function>>()
  const stateSetters = new Map<Binding, Binding>()
  const operationStates = new Set<Binding>()
  const mapUpdaters = new Map<Binding, t.Expression[]>()
  const importedOperationEdges: Array<{ scope: NodePath['scope']; state: string; prop: string; key: string; origin: NodePath }> = []

  const recordMapUpdater = (state: Binding, mapper: t.Expression): void => {
    const updaters = mapUpdaters.get(state) ?? []
    updaters.push(t.cloneNode(mapper, true))
    mapUpdaters.set(state, updaters)
  }

  const mapperPreservesProperty = (mapper: t.Expression, property: string): boolean => {
    if (!t.isArrowFunctionExpression(mapper) && !t.isFunctionExpression(mapper)) return false
    const item = mapper.params[0]
    if (!t.isIdentifier(item)) return false
    const preserves = (value: t.Node | null | undefined): boolean => {
      if (t.isIdentifier(value, { name: item.name })) return true
      if (t.isConditionalExpression(value)) return preserves(value.consequent) && preserves(value.alternate)
      if (!t.isObjectExpression(value)) return false
      let lastIdentityWrite = -1
      let lastPropertyWrite = -1
      let unknownSpreadAfterIdentity = false
      value.properties.forEach((entry, index) => {
        if (t.isSpreadElement(entry)) {
          if (t.isIdentifier(entry.argument, { name: item.name })) lastIdentityWrite = index
          else if (lastIdentityWrite >= 0) unknownSpreadAfterIdentity = true
          return
        }
        if (!t.isObjectProperty(entry) || entry.computed) return
        const name = t.isIdentifier(entry.key) ? entry.key.name
          : t.isStringLiteral(entry.key) ? entry.key.value : undefined
        if (name === property) lastPropertyWrite = index
      })
      return lastIdentityWrite >= 0 && lastPropertyWrite < lastIdentityWrite && !unknownSpreadAfterIdentity
    }
    if (!t.isBlockStatement(mapper.body)) return preserves(mapper.body)
    const returns: t.ReturnStatement[] = []
    t.traverseFast(mapper.body, node => { if (t.isReturnStatement(node)) returns.push(node) })
    return returns.length > 0 && returns.every(statement => preserves(statement.argument))
  }

  // Ordinary React source often writes `function C(props)` and reads
  // `props.title` rather than destructuring in the parameter list. Both forms
  // carry the same information, so normalise the identifier form into the
  // destructured one before any analysis runs. Everything downstream then sees
  // the single shape it already supports, with no new reactive machinery.
  //
  // Only provably simple uses are rewritten. If `props` escapes -- spread,
  // passed as a value, computed access, or written to -- the parameter is left
  // alone so the existing diagnostics still reject it rather than this pass
  // silently guessing.
  program.traverse({
    Function(path) {
      const params = path.get('params')
      const first = params[0]
      if (!first?.isIdentifier()) return
      if (params.length > 2) return
      // Only component functions. A capitalised binding name is the boundary
      // React itself uses, and it keeps list mappers such as
      // `item => <li>{item.text}</li>` out of this rewrite -- their parameter
      // is data, not a props object.
      const declared = path.isFunctionDeclaration() ? path.node.id?.name
        : path.parentPath?.isVariableDeclarator() && t.isIdentifier(path.parentPath.node.id)
          ? path.parentPath.node.id.name : undefined
      if (!declared || !/^[A-Z]/.test(declared)) return
      let hasJsx = false
      path.traverse({ JSXElement() { hasJsx = true }, JSXFragment() { hasJsx = true } })
      if (!hasJsx) return
      const binding = path.scope.getBinding(first.node.name)
      if (!binding || !binding.constant) return

      const reads: Array<NodePath<t.MemberExpression>> = []
      const keys = new Set<string>()
      for (const reference of binding.referencePaths) {
        const parent = reference.parentPath
        if (!parent?.isMemberExpression() || parent.node.object !== reference.node
          || parent.node.computed || !t.isIdentifier(parent.node.property)) return
        const grand = parent.parentPath
        if (grand?.isAssignmentExpression() && grand.node.left === parent.node) return
        if (grand?.isUpdateExpression() || grand?.isUnaryExpression({ operator: 'delete' })) return
        reads.push(parent)
        keys.add(parent.node.property.name)
      }
      if (binding.constantViolations.length || keys.size === 0) return

      const locals = new Map<string, t.Identifier>()
      for (const key of keys) {
        const free = !path.scope.hasBinding(key) && !path.scope.parent?.hasBinding(key)
        locals.set(key, t.identifier(free ? key : path.scope.generateUid(key)))
      }
      first.replaceWith(t.objectPattern([...locals].map(([key, local]) =>
        t.objectProperty(t.identifier(key), t.cloneNode(local, true), false, key === local.name))))
      for (const read of reads) {
        read.replaceWith(t.cloneNode(locals.get((read.node.property as t.Identifier).name)!, true))
      }
      path.scope.crawl()
    },
  })

  // `const rows = items.map(render); return <ul>{rows}</ul>` is the same list as
  // writing the map inline, just named. Naming it must not cost the direct list
  // operations, so inline the single JSX use and let the list machinery see the
  // shape it already compiles. The JSX ban on derived bindings stays: a mapper
  // inside a derive would rebuild every row when a dependency changed, which is
  // the reconciliation this compiler exists to avoid.
  //
  // Only the unambiguous case is inlined -- one reference, used as a JSX child,
  // in the return statement that directly follows the declaration -- so the map
  // still runs exactly where it used to.
  program.traverse({
    VariableDeclarator(path) {
      if (!t.isIdentifier(path.node.id)) return
      const init = path.get('init')
      if (!init.isCallExpression()) return
      const callee = init.get('callee')
      if (!callee.isMemberExpression() || callee.node.computed
        || !callee.get('property').isIdentifier({ name: 'map' })) return
      const declaration = path.parentPath
      if (!declaration.isVariableDeclaration({ kind: 'const' })
        || declaration.node.declarations.length !== 1) return

      const binding = path.scope.getBinding(path.node.id.name)
      if (!binding || !binding.constant || binding.referencePaths.length !== 1) return
      const reference = binding.referencePaths[0]
      const container = reference.parentPath
      if (!container?.isJSXExpressionContainer()
        || container.node.expression !== reference.node
        || !container.parentPath?.isJSXElement()) return

      // The map must still evaluate where it was written.
      const statement = reference.getStatementParent()
      if (!statement?.isReturnStatement()) return
      const siblings = declaration.getAllNextSiblings()
      if (siblings.length !== 1 || siblings[0].node !== statement.node) return

      reference.replaceWith(t.cloneNode(init.node, true))
      declaration.remove()
    },
  })

  // Import spelling can hide a hook from call-site name checks. Only direct
  // named supported hook calls have established state-binding semantics.
  program.traverse({
    ImportSpecifier(path) {
      const imported = path.node.imported
      const name = t.isIdentifier(imported) ? imported.name : imported.value
      if (!/^use[A-Z]/.test(name)) return
      const declaration = path.parentPath
      const supported = declaration.isImportDeclaration()
        && ['react', '@rrjs/react-compat'].includes(declaration.node.source.value)
        && ['useState', 'useRef', 'useEffect', 'useContext'].includes(name)
      const binding = path.scope.getBinding(path.node.local.name)
      const analyzed = isImportedReactiveHook(binding)
      for (const reference of binding?.referencePaths ?? []) {
        if (!supported && !analyzed) throw reference.buildCodeFrameError('runOnce: imported custom or unsupported hooks require module analysis')
        if (!reference.parentPath?.isCallExpression() || reference.key !== 'callee') {
          throw reference.buildCodeFrameError('runOnce: hook indirection requires binding analysis; call the named import directly')
        }
      }
    },
  })

  // Fold only a tail if-return followed by a return. No component statements
  // are moved into an update callback.
  program.traverse({
    Function(path) {
      if (!t.isBlockStatement(path.node.body)) return
      const statements = path.node.body.body
      while (statements.length >= 2) {
        const last = statements[statements.length - 1]
        const guard = statements[statements.length - 2]
        if (!t.isReturnStatement(last) || !t.isIfStatement(guard) || guard.alternate) break
        const branch = t.isBlockStatement(guard.consequent) && guard.consequent.body.length === 1
          ? guard.consequent.body[0] : guard.consequent
        if (!t.isReturnStatement(branch)) break
        statements.splice(-2, 2, t.returnStatement(t.conditionalExpression(guard.test,
          branch.argument ?? t.nullLiteral(), last.argument ?? t.nullLiteral())))
      }
    },
  })

  function hookName(call: NodePath<t.CallExpression>): string | undefined {
    const callee = call.get('callee')
    if (!callee.isIdentifier()) return undefined
    const binding = callee.scope.getBinding(callee.node.name)
    if (!binding) return callee.node.name // classic runtime supplied by the caller
    if (!binding.path.isImportSpecifier()) return undefined
    const declaration = binding.path.parentPath
    if (!declaration.isImportDeclaration() || !['react', '@rrjs/react-compat'].includes(declaration.node.source.value)) return undefined
    const imported = binding.path.node.imported
    return t.isIdentifier(imported) ? imported.name : imported.value
  }
  function importedIdentity(binding: Binding | undefined): { source: string; exported: string } | undefined {
    if (!binding?.path.isImportSpecifier()) return undefined
    const declaration = binding.path.parentPath
    if (!declaration.isImportDeclaration()) return undefined
    const imported = binding.path.node.imported
    return {
      source: declaration.node.source.value,
      exported: t.isIdentifier(imported) ? imported.name : imported.value,
    }
  }
  function importedComponentContract(binding: Binding | undefined): string[] | ImportedComponentContract | undefined {
    const identity = importedIdentity(binding)
    const exact = identity && moduleMetadata?.imports?.[identity.source]?.components?.[identity.exported]
    if (exact) return exact
    return binding ? moduleMetadata?.importedComponents?.[binding.identifier.name] : undefined
  }
  function isImportedReactiveHook(binding: Binding | undefined): boolean {
    const identity = importedIdentity(binding)
    if (identity && moduleMetadata?.imports?.[identity.source]?.hooks?.includes(identity.exported)) return true
    return Boolean(binding && moduleMetadata?.importedHooks?.includes(binding.identifier.name))
  }
  type ComponentUse = {
    opening: NodePath<t.JSXOpeningElement>
    component?: NodePath<t.Function>
    props: Map<string, Binding>
    declaredProps?: Set<string>
    forwardRef: boolean
  }
  const componentUses: ComponentUse[] = []
  const providerUses: NodePath<t.JSXOpeningElement>[] = []
  const componentProps = new Map<NodePath<t.Function>, Map<string, Binding>>()
  const componentDefaultProps = new Map<NodePath<t.Function>, Set<string>>()
  const propSources: Array<{
    childScope: Binding['scope']; childName: string
    parentScope: Binding['scope']; parentName: string
  }> = []
  program.traverse({
    JSXOpeningElement(path) {
      const name = path.node.name
      if (t.isJSXIdentifier(name) && /^[a-z]/.test(name.name)) return
      if (t.isJSXMemberExpression(name) && t.isJSXIdentifier(name.object)
        && t.isJSXIdentifier(name.property, { name: 'Provider' })) {
        const contextBinding = path.scope.getBinding(name.object.name)
        const init = contextBinding?.path.isVariableDeclarator() ? contextBinding.path.get('init') : undefined
        if (!init?.isCallExpression() || !t.isIdentifier(init.node.callee, { name: 'createContext' })) {
          throw path.buildCodeFrameError('runOnce: Provider must come from a direct local createContext call')
        }
        providerUses.push(path)
        return
      }
      if (!t.isJSXIdentifier(name)) throw path.buildCodeFrameError('runOnce: member components require wrapper compilation')
      const binding = path.scope.getBinding(name.name)
      let forwardRef = false
      let component = binding?.path.isFunctionDeclaration() ? binding.path
        : binding?.path.isVariableDeclarator()
          && (binding.path.get('init').isFunctionExpression() || binding.path.get('init').isArrowFunctionExpression())
          ? binding.path.get('init') as NodePath<t.Function> : undefined
      if (!component && binding?.path.isVariableDeclarator()) {
        const init = binding.path.get('init')
        if (init.isCallExpression() && t.isIdentifier(init.node.callee, { name: 'forwardRef' })) {
          const render = init.get('arguments.0')
          if (render?.isFunctionExpression() || render?.isArrowFunctionExpression()) {
            component = render
            forwardRef = true
          }
        }
      }
      if (!component) {
        const contract = importedComponentContract(binding)
        const declared = Array.isArray(contract) ? contract : contract?.props
        if (!binding?.path.isImportSpecifier() || !declared) {
          throw path.buildCodeFrameError('runOnce: only analyzed imported or direct local function components are supported in the current composition scope')
        }
        componentUses.push({ opening: path, props: new Map(), declaredProps: new Set(declared), forwardRef: false })
        return
      }
      const element = path.parentPath
      const params = component.get('params')
      if ((forwardRef ? params.length !== 2 : params.length !== 1) || !params[0].isObjectPattern()) {
        if (path.node.attributes.length) throw path.buildCodeFrameError('runOnce: component props currently require one destructured object parameter')
        componentUses.push({ opening: path, component, props: new Map(), forwardRef })
        components.add(component)
        return
      }
      let props = componentProps.get(component)
      if (!props) {
        props = new Map()
        const defaults = new Set<string>()
        for (const property of params[0].get('properties')) {
          if (!property.isObjectProperty() || property.node.computed
            || !(t.isIdentifier(property.node.key) || t.isStringLiteral(property.node.key))
            || !(t.isIdentifier(property.node.value) || (t.isAssignmentPattern(property.node.value)
              && t.isIdentifier(property.node.value.left)))) {
            throw params[0].buildCodeFrameError('runOnce: component props currently require direct destructured bindings')
          }
          const external = t.isIdentifier(property.node.key) ? property.node.key.name : property.node.key.value
          const local = (t.isIdentifier(property.node.value) ? property.node.value : property.node.value.left) as t.Identifier
          if (t.isAssignmentPattern(property.node.value)) {
            const fallback = property.node.value.right
            if (!(t.isStringLiteral(fallback) || t.isNumericLiteral(fallback)
              || t.isBooleanLiteral(fallback) || t.isNullLiteral(fallback))) {
              throw property.buildCodeFrameError('runOnce: default component props currently require a static scalar')
            }
            property.node.value.right = t.arrowFunctionExpression([], fallback)
            defaults.add(external)
          }
          const propBinding = component.scope.getBinding(local.name)
          if (!propBinding) throw property.buildCodeFrameError('runOnce: unable to resolve component prop binding')
          props.set(external, propBinding)
        }
        componentProps.set(component, props)
        componentDefaultProps.set(component, defaults)
      }
      componentUses.push({ opening: path, component, props, forwardRef })
      components.add(component)
    },
  })
  program.traverse({
    VariableDeclarator(path) {
      const init = path.get('init')
      if (!init.isCallExpression() || hookName(init) !== 'useState') return
      const fn = path.getFunctionParent()
      if (!fn) throw path.buildCodeFrameError('runOnce: useState must be inside a component')
      if (!t.isArrayPattern(path.node.id) || !t.isIdentifier(path.node.id.elements[0])) throw path.buildCodeFrameError('runOnce: useState requires a named state binding')
      const binding = path.scope.getBinding(path.node.id.elements[0].name)!
      if (!binding.constant) throw path.buildCodeFrameError('runOnce: state bindings cannot be reassigned')
      reactive.set(binding, fn)
      // `count()` is the older spelling, where state was a getter. Under these
      // semantics `count` is the value, so calling it is a call on whatever the
      // state holds -- for `useState(0)` that is a TypeError at the first click
      // rather than at build time. When the initial value is plainly not
      // callable, say so now instead of shipping that crash.
      const initial = init.node.arguments[0]
      const plainlyNotCallable = t.isNumericLiteral(initial) || t.isStringLiteral(initial)
        || t.isBooleanLiteral(initial) || t.isNullLiteral(initial)
        || t.isArrayExpression(initial) || t.isObjectExpression(initial)
        || t.isTemplateLiteral(initial)
      if (plainlyNotCallable) {
        for (const reference of binding.referencePaths) {
          const parent = reference.parentPath
          if (parent?.isCallExpression() && parent.node.callee === reference.node) {
            throw parent.buildCodeFrameError(`runOnce: state is a value here, so \`${binding.identifier.name}()\` calls it; read \`${binding.identifier.name}\` instead`)
          }
        }
      }
      const setter = path.node.id.elements[1]
      if (t.isIdentifier(setter)) {
        const setterBinding = path.scope.getBinding(setter.name)
        if (setterBinding) stateSetters.set(setterBinding, binding)
      }
      components.add(fn)
    },
  })
  program.traverse({
    VariableDeclarator(path) {
      const init = path.get('init')
      if (!t.isIdentifier(path.node.id) || !init.isCallExpression() || hookName(init) !== 'useContext') return
      const fn = path.getFunctionParent()
      if (!fn) throw path.buildCodeFrameError('runOnce: useContext must be inside a component')
      const binding = path.scope.getBinding(path.node.id.name)!
      if (!binding.constant) throw path.buildCodeFrameError('runOnce: context bindings cannot be reassigned')
      reactive.set(binding, fn)
      components.add(fn)
    },
  })
  program.traverse({
    VariableDeclarator(path) {
      if (!t.isIdentifier(path.node.id)) return
      const init = path.get('init')
      if (!init.isCallExpression() || !t.isIdentifier(init.node.callee)) return
      const imported = init.scope.getBinding(init.node.callee.name)
      if (!isImportedReactiveHook(imported)) return
      const fn = path.getFunctionParent()
      if (!fn) throw path.buildCodeFrameError('runOnce: analyzed imported hooks must be called inside a component')
      reactive.set(path.scope.getBinding(path.node.id.name)!, fn)
      components.add(fn)
    },
    FunctionDeclaration(path) {
      if (!path.node.id || !/^[A-Z]/.test(path.node.id.name)
        || !path.parentPath.isExportNamedDeclaration() || componentProps.has(path)) return
      const param = path.get('params.0')
      if (!param?.isObjectPattern()) return
      const props = new Map<string, Binding>()
      for (const property of param.get('properties')) {
        if (!property.isObjectProperty() || property.node.computed
          || !(t.isIdentifier(property.node.key) || t.isStringLiteral(property.node.key))
          || !t.isIdentifier(property.node.value)) {
          throw property.buildCodeFrameError('runOnce: analyzed exported component props require direct destructured bindings')
        }
        const external = t.isIdentifier(property.node.key) ? property.node.key.name : property.node.key.value
        const binding = path.scope.getBinding(property.node.value.name)
        if (!binding) throw property.buildCodeFrameError('runOnce: unable to resolve exported component prop binding')
        props.set(external, binding)
      }
      componentProps.set(path, props)
      for (const [name, binding] of props) {
        reactive.set(binding, path)
        if (moduleMetadata?.operationProps?.includes(name)) operationStates.add(binding)
      }
      components.add(path)
    },
  })
  for (const [component, props] of componentProps) {
    for (const binding of props.values()) reactive.set(binding, component)
  }
  const customHooks = new Map<Binding, Map<number, Binding>>()
  program.traverse({
    Function(path) {
      const name = path.isFunctionDeclaration() ? path.node.id?.name
        : path.parentPath.isVariableDeclarator() && t.isIdentifier(path.parentPath.node.id)
          ? path.parentPath.node.id.name : undefined
      if (!name || !/^use[A-Z]/.test(name) || !t.isBlockStatement(path.node.body)) return
      const returned = path.node.body.body.find(statement => t.isReturnStatement(statement))
      if (!returned || !t.isReturnStatement(returned) || !t.isArrayExpression(returned.argument)) return
      const values = new Map<number, Binding>()
      returned.argument.elements.forEach((element, index) => {
        if (!t.isIdentifier(element)) return
        const binding = path.scope.getBinding(element.name)
        if (binding && reactive.get(binding) === path) values.set(index, binding)
      })
      const ownBinding = path.isFunctionDeclaration() && path.node.id
        ? path.parentPath.scope.getBinding(path.node.id.name)
        : path.parentPath.isVariableDeclarator() && t.isIdentifier(path.parentPath.node.id)
          ? path.parentPath.scope.getBinding(path.parentPath.node.id.name) : undefined
      if (ownBinding && values.size) customHooks.set(ownBinding, values)
    },
  })
  program.traverse({
    VariableDeclarator(path) {
      const init = path.get('init')
      if (!init.isCallExpression() || !t.isIdentifier(init.node.callee)) return
      const hook = customHooks.get(init.scope.getBinding(init.node.callee.name)!)
      if (!hook) return
      const component = path.getFunctionParent()
      if (!component || !t.isArrayPattern(path.node.id)) throw path.buildCodeFrameError('runOnce: analyzed custom hooks require array destructuring inside a component')
      for (const index of hook.keys()) {
        const local = path.node.id.elements[index]
        if (!t.isIdentifier(local)) throw path.buildCodeFrameError('runOnce: custom-hook reactive returns require named array bindings')
        const binding = path.scope.getBinding(local.name)
        if (!binding) throw path.buildCodeFrameError('runOnce: unable to resolve custom-hook return binding')
        reactive.set(binding, component)
      }
      components.add(component)
    },
  })

  // Every accepted component prop is a getter in the target. This gives the
  // child a stable prop binding that can subscribe directly to the parent's
  // signal while both component bodies remain single-execution.
  for (const { opening, component, props, declaredProps, forwardRef } of componentUses) {
    const attributes = new Map<string, NodePath<t.JSXAttribute>>()
    for (const attribute of opening.get('attributes')) {
      if (attribute.isJSXSpreadAttribute()) throw opening.buildCodeFrameError('runOnce: component spread props require reactive prop compilation')
      if (!attribute.isJSXAttribute() || !t.isJSXIdentifier(attribute.node.name)) throw opening.buildCodeFrameError('runOnce: namespaced component props are unsupported')
      const name = attribute.node.name.name
      if (name === 'ref') {
        if (!forwardRef) throw opening.buildCodeFrameError('runOnce: component refs require a direct local forwardRef wrapper')
        continue
      }
      if (name === 'key') throw opening.buildCodeFrameError('runOnce: component keys require lifetime compilation')
      if (!props.has(name) && !declaredProps?.has(name)) throw attribute.buildCodeFrameError(`runOnce: component prop ${name} is not declared by the analyzed component`)
      attributes.set(name, attribute)
    }
    for (const name of props.keys()) {
      if (name === 'children') continue
      if (component && componentDefaultProps.get(component)?.has(name)) continue
      if (!attributes.has(name)) throw opening.buildCodeFrameError(`runOnce: component prop ${name} must be supplied until default/optional prop compilation is implemented`)
    }
    for (const [name, attribute] of attributes) {
      const value = attribute.node.value
      const expression = value == null ? t.booleanLiteral(true)
        : t.isStringLiteral(value) ? value
          : t.isJSXExpressionContainer(value) && !t.isJSXEmptyExpression(value.expression)
            ? value.expression as t.Expression : undefined
      if (!expression) throw attribute.buildCodeFrameError(`runOnce: unsupported value for component prop ${name}`)
      const staticValue = t.isStringLiteral(expression) || t.isNumericLiteral(expression)
        || t.isBooleanLiteral(expression) || t.isNullLiteral(expression)
      const parent = opening.getFunctionParent()
      const directBinding = t.isIdentifier(expression) ? opening.scope.getBinding(expression.name) : undefined
      const inlineFunction = t.isFunctionExpression(expression) || t.isArrowFunctionExpression(expression)
      const directFunction = Boolean(directBinding?.constant
        && (directBinding.path.isFunctionDeclaration()
          || (directBinding.path.isVariableDeclarator()
            && (directBinding.path.get('init').isFunctionExpression() || directBinding.path.get('init').isArrowFunctionExpression())))
        && directBinding.path.getFunctionParent() === parent)
      if (!staticValue && !inlineFunction && !directFunction
        && (!parent || !directBinding || reactive.get(directBinding) !== parent)) {
        throw attribute.buildCodeFrameError('runOnce: component props currently accept static scalars or direct reactive bindings')
      }
      const childBinding = props.get(name)
      if (directBinding && childBinding) {
        propSources.push({
          childScope: childBinding.scope,
          childName: childBinding.identifier.name,
          parentScope: directBinding.scope,
          parentName: directBinding.identifier.name,
        })
      }
      if (directBinding && t.isJSXIdentifier(opening.node.name)) {
        const contract = importedComponentContract(opening.scope.getBinding(opening.node.name.name))
        const operationKey = !Array.isArray(contract) ? contract?.operationKeys?.[name] : undefined
        if (operationKey) {
          operationStates.add(directBinding)
          importedOperationEdges.push({
            scope: directBinding.scope,
            state: directBinding.identifier.name,
            prop: name,
            key: operationKey,
            origin: attribute,
          })
        }
      }
      const getter = t.arrowFunctionExpression([], expression)
      generated.add(getter)
      attribute.node.value = t.jsxExpressionContainer(getter)
    }
    const element = opening.parentPath
    if (element.isJSXElement()) {
      const actualChildren = element.node.children.filter(child =>
        !t.isJSXText(child) || child.value.trim().length > 0)
      if (actualChildren.length) {
        if (!props.has('children') && !declaredProps?.has('children')) throw opening.buildCodeFrameError('runOnce: component children require a declared children prop')
        if (actualChildren.length !== 1 || t.isJSXSpreadChild(actualChildren[0])) {
          throw opening.buildCodeFrameError('runOnce: multiple and spread component children require child collection compilation')
        }
        const child = actualChildren[0]
        const expression = t.isJSXText(child) ? t.stringLiteral(child.value)
          : t.isJSXExpressionContainer(child) && !t.isJSXEmptyExpression(child.expression)
            ? child.expression as t.Expression
            : t.isJSXElement(child) || t.isJSXFragment(child) ? child : undefined
        if (!expression) throw opening.buildCodeFrameError('runOnce: unsupported component child')
        const factory = t.arrowFunctionExpression([], expression)
        factory.extra = { ...(factory.extra ?? {}), rrjsRegion: true }
        generated.add(factory)
        element.node.children = [t.jsxExpressionContainer(factory)]
      } else if (props.has('children') || declaredProps?.has('children')) {
        throw opening.buildCodeFrameError('runOnce: a destructured children prop must receive one child in the current scope')
      }
    }
  }
  for (const opening of providerUses) {
    const attributes = opening.get('attributes')
    if (attributes.length !== 1 || !attributes[0].isJSXAttribute()
      || !t.isJSXIdentifier(attributes[0].node.name, { name: 'value' })) {
      throw opening.buildCodeFrameError('runOnce: Context.Provider currently requires exactly one value prop')
    }
    const value = attributes[0].node.value
    const expression = t.isStringLiteral(value) ? value
      : t.isJSXExpressionContainer(value) && !t.isJSXEmptyExpression(value.expression)
        ? value.expression as t.Expression : undefined
    if (!expression) throw attributes[0].buildCodeFrameError('runOnce: unsupported Context.Provider value')
    const parent = opening.getFunctionParent()
    // The value is compiled into a getter, so it is re-read whenever anything
    // it depends on changes. That is sound for a scalar, for a binding this
    // component owns, and -- by the same argument applied to each entry -- for
    // an object or array literal built only out of those. `value={{ user }}`
    // is the ordinary React spelling, so accept it rather than forcing callers
    // to hoist a binding they never needed.
    const accepts = (node: t.Expression): boolean => {
      if (t.isStringLiteral(node) || t.isNumericLiteral(node)
        || t.isBooleanLiteral(node) || t.isNullLiteral(node)) return true
      if (t.isIdentifier(node)) {
        const binding = opening.scope.getBinding(node.name)
        if (!binding) return false
        const local = Boolean(parent && binding.constant
          && binding.path.isVariableDeclarator()
          && binding.path.getFunctionParent() === parent)
        return local || Boolean(parent && reactive.get(binding) === parent)
      }
      if (t.isObjectExpression(node)) {
        return node.properties.every(property => t.isObjectProperty(property)
          && !property.computed
          && (t.isIdentifier(property.key) || t.isStringLiteral(property.key))
          && t.isExpression(property.value) && accepts(property.value))
      }
      if (t.isArrayExpression(node)) {
        return node.elements.every(element =>
          element !== null && t.isExpression(element) && accepts(element))
      }
      return false
    }
    if (!accepts(expression)) {
      throw attributes[0].buildCodeFrameError('runOnce: provider values currently accept static scalars, bindings this component owns, and object or array literals of those')
    }
    const valueGetter = t.arrowFunctionExpression([], expression)
    generated.add(valueGetter)
    attributes[0].node.value = t.jsxExpressionContainer(valueGetter)
    const element = opening.parentPath
    if (!element.isJSXElement()) throw opening.buildCodeFrameError('runOnce: provider must be a JSX element')
    const actualChildren = element.node.children.filter(child => !t.isJSXText(child) || child.value.trim().length > 0)
    if (actualChildren.length !== 1 || t.isJSXSpreadChild(actualChildren[0])) {
      throw opening.buildCodeFrameError('runOnce: provider currently requires exactly one owned child')
    }
    const child = actualChildren[0]
    const childExpression = t.isJSXText(child) ? t.stringLiteral(child.value)
      : t.isJSXExpressionContainer(child) && !t.isJSXEmptyExpression(child.expression)
        ? child.expression as t.Expression
        : t.isJSXElement(child) || t.isJSXFragment(child) ? child : undefined
    if (!childExpression) throw opening.buildCodeFrameError('runOnce: unsupported provider child')
    const childFactory = t.arrowFunctionExpression([], childExpression)
    childFactory.extra = { ...(childFactory.extra ?? {}), rrjsRegion: true }
    generated.add(childFactory)
    element.node.children = [t.jsxExpressionContainer(childFactory)]
  }

  // Phase 3 starts with direct inline callbacks and literal empty dependency
  // lists. Reactive captures are snapshotted below at component execution, so
  // both effect setup and its cleanup observe the initial render values.
  const changingEffects = new Set<t.CallExpression>()
  const inferredEffects = new Set<t.CallExpression>()
  program.traverse({
    CallExpression(path) {
      if (hookName(path) !== 'useEffect') return
      const [callback, deps] = path.get('arguments')
      if (path.node.arguments.length > 2) {
        throw path.buildCodeFrameError('runOnce: useEffect takes a callback and an optional dependency array')
      }
      if (!callback || !(callback.isFunctionExpression() || callback.isArrowFunctionExpression())) {
        throw path.buildCodeFrameError('runOnce: useEffect requires an inline callback in the supported empty-dependency scope')
      }
      // No dependency argument is React's "after every render". There is no
      // second render here, so the closest honest reading is to re-run when
      // something the callback actually reads changes. The dependency list for
      // that is synthesised below, once every reactive binding is known.
      if (!deps) {
        inferredEffects.add(path.node)
        return
      }
      if (!deps.isArrayExpression()) {
        throw path.buildCodeFrameError('runOnce: useEffect requires a literal dependency array')
      }
      if (deps.node.elements.length > 0) changingEffects.add(path.node)
    },
  })

  // Find derived bindings transitively before replacing references. Binding
  // identity, rather than identifier spelling, preserves lexical shadowing.
  function helperKind(path: NodePath<t.CallExpression>): 'pure' | 'unsupported' {
    if (!t.isIdentifier(path.node.callee)) return 'unsupported'
    const binding = path.scope.getBinding(path.node.callee.name)
    if (!binding?.constant) return 'unsupported'
    const node = binding.path.isVariableDeclarator() ? binding.path.node.init : binding.path.node
    if (!node || (!t.isFunctionDeclaration(node) && !t.isArrowFunctionExpression(node) && !t.isFunctionExpression(node))) return 'unsupported'
    if (node.async || node.generator || !node.params.every(parameter => t.isIdentifier(parameter))) return 'unsupported'
    const parameters = new Set(node.params.map(parameter => (parameter as t.Identifier).name))
    const pure = (value: t.Node | null | undefined): boolean => {
      if (!value) return false
      if (t.isNumericLiteral(value) || t.isStringLiteral(value) || t.isBooleanLiteral(value) || t.isNullLiteral(value)) return true
      if (t.isIdentifier(value)) return parameters.has(value.name)
      if (t.isBinaryExpression(value) || t.isLogicalExpression(value)) return pure(value.left) && pure(value.right)
      if (t.isUnaryExpression(value)) return value.operator !== 'delete' && pure(value.argument)
      if (t.isConditionalExpression(value)) return pure(value.test) && pure(value.consequent) && pure(value.alternate)
      return false
    }
    const expression = t.isBlockStatement(node.body)
      ? node.body.body.length === 1 && t.isReturnStatement(node.body.body[0]) ? node.body.body[0].argument : null
      : node.body
    if (pure(expression)) return 'pure'
    return 'unsupported'
  }
  function supportedCall(path: NodePath<t.CallExpression>, _component: NodePath<t.Function>): boolean {
    const callee = path.get('callee')
    if (callee.isMemberExpression() && !callee.node.computed
      && callee.get('property').isIdentifier({ name: 'trim' })
      && path.node.arguments.length === 0) return true
    if (callee.isMemberExpression() && !callee.node.computed
      && callee.get('property').isIdentifier({ name: 'filter' })
      && path.node.arguments.length === 1) {
      const predicate = path.get('arguments.0')
      if (!predicate.isArrowFunctionExpression() && !predicate.isFunctionExpression()) return false
      let impure = predicate.node.async || predicate.node.generator
      predicate.traverse({
        Function(nested) { if (nested.node !== predicate.node) nested.skip() },
        CallExpression() { impure = true },
        NewExpression() { impure = true },
        AssignmentExpression() { impure = true },
        UpdateExpression() { impure = true },
        AwaitExpression() { impure = true },
      })
      return !impure
    }
    return helperKind(path) === 'pure'
  }

  // A map over a source-declared array has fixed membership. Preserve those
  // rows and expose only reactive object fields as lazy children; the renderer
  // already tracks function children without rebuilding their enclosing nodes.
  program.traverse({
    CallExpression(path) {
      const fn = path.getFunctionParent()
      const callee = path.get('callee')
      if (!fn || !components.has(fn) || !callee.isMemberExpression() || callee.node.computed
        || !callee.get('property').isIdentifier({ name: 'map' })) return
      const source = callee.get('object')
      if (!source.isArrayExpression()) return
      for (const element of source.get('elements')) {
        if (!element?.isObjectExpression()) continue
        for (const property of element.get('properties')) {
          if (!property.isObjectProperty() || property.node.computed) continue
          const value = property.get('value') as NodePath<t.Expression>
          let depends = value.isReferencedIdentifier()
            && reactive.has(value.scope.getBinding(value.node.name)!)
          value.traverse({
            ReferencedIdentifier(ref) {
              if (reactive.has(ref.scope.getBinding(ref.node.name)!)) depends = true
            },
          })
          if (!depends || value.isFunctionExpression() || value.isArrowFunctionExpression()) continue
          const getter = t.arrowFunctionExpression([], value.node)
          getter.extra = { rrjsReactiveGetter: true }
          generated.add(getter)
          value.replaceWith(getter)
        }
      }
    },
  })

  let added = true
  while (added) {
    added = false
    program.traverse({
      VariableDeclarator(path) {
        if (!t.isIdentifier(path.node.id) || !path.node.init) return
        const fn = path.getFunctionParent()
        if (!fn || !components.has(fn)) return
        const binding = path.scope.getBinding(path.node.id.name)!
        if (reactive.has(binding)) return
        const init = path.get('init') as NodePath<t.Expression>
        const initCallee = init.isCallExpression() ? init.get('callee') : undefined
        if (initCallee?.isMemberExpression() && !initCallee.node.computed
          && initCallee.get('property').isIdentifier({ name: 'map' })
          && initCallee.get('object').isArrayExpression()) return
        let depends = init.isReferencedIdentifier() && reactive.has(init.scope.getBinding(init.node.name)!)
        init.traverse({
          Function(nested) { if (generated.has(nested.node)) nested.skip() },
          ReferencedIdentifier(ref) { if (reactive.has(ref.scope.getBinding(ref.node.name)!)) depends = true },
        })
        if (!depends) return
        if (init.isFunctionExpression() || init.isArrowFunctionExpression()) return
        if (!binding.constant || !path.parentPath.isVariableDeclaration({ kind: 'const' })) throw path.buildCodeFrameError('runOnce: derived bindings must be const')
        let unsupported = false
        init.traverse({
          Function(nested) { nested.skip() },
          CallExpression(call) { if (!supportedCall(call, fn)) unsupported = true },
          NewExpression() { unsupported = true },
          AssignmentExpression() { unsupported = true },
          UpdateExpression() { unsupported = true },
          JSXElement() { unsupported = true },
          AwaitExpression() { unsupported = true },
        })
        if ((init.isCallExpression() && !supportedCall(init, fn)) || init.isNewExpression() || init.isJSXElement() || unsupported) throw init.buildCodeFrameError('runOnce: derived calls, mutations, and JSX need further compiler analysis')
        reactive.set(binding, fn)
        added = true
        const factory = t.arrowFunctionExpression([], init.node)
        generated.add(factory)
        init.replaceWith(t.callExpression(derive(), [factory]))
      },
    })
  }

  // Derived bindings (for example `done`) become known during the fixed-point
  // pass above, so complete the same fixed-row lowering for those fields now.
  program.traverse({
    CallExpression(path) {
      const fn = path.getFunctionParent()
      const callee = path.get('callee')
      if (!fn || !components.has(fn) || !callee.isMemberExpression() || callee.node.computed
        || !callee.get('property').isIdentifier({ name: 'map' })) return
      const source = callee.get('object')
      if (!source.isArrayExpression()) return
      for (const element of source.get('elements')) {
        if (!element?.isObjectExpression()) continue
        for (const property of element.get('properties')) {
          if (!property.isObjectProperty() || property.node.computed) continue
          const value = property.get('value') as NodePath<t.Expression>
          if (value.isFunctionExpression() || value.isArrowFunctionExpression()) continue
          let depends = value.isReferencedIdentifier()
            && reactive.has(value.scope.getBinding(value.node.name)!)
          value.traverse({ ReferencedIdentifier(ref) {
            if (reactive.has(ref.scope.getBinding(ref.node.name)!)) depends = true
          } })
          if (!depends) continue
          const getter = t.arrowFunctionExpression([], value.node)
          getter.extra = { rrjsReactiveGetter: true }
          generated.add(getter)
          value.replaceWith(getter)
        }
      }
    },
  })

  // Fixed source rows may carry reactive fields as generated getters. Restore
  // ordinary JavaScript value semantics inside the mapper by invoking exactly
  // those fields. Normalize every row to the same getter shape first so a
  // mapper cannot sometimes receive a value and sometimes a function.
  program.traverse({
    CallExpression(path) {
      const callee = path.get('callee')
      if (!callee.isMemberExpression() || callee.node.computed
        || !callee.get('property').isIdentifier({ name: 'map' })) return
      const source = callee.get('object')
      const callback = path.get('arguments.0')
      if (!source.isArrayExpression() || !callback?.isArrowFunctionExpression()) return
      const objects = source.get('elements').filter((element): element is NodePath<t.ObjectExpression> => Boolean(element?.isObjectExpression()))
      if (objects.length !== source.node.elements.length) {
        let reactiveElement = false
        source.traverse({ ReferencedIdentifier(ref) {
          if (reactive.has(ref.scope.getBinding(ref.node.name)!)) reactiveElement = true
        } })
        if (reactiveElement) throw source.buildCodeFrameError('runOnce: reactive primitive fixed-map elements require explicit value compilation')
        return
      }
      const keyOf = (property: NodePath<t.ObjectMember | t.SpreadElement>): string | undefined => {
        if (!property.isObjectProperty() || property.node.computed) return undefined
        return t.isIdentifier(property.node.key) ? property.node.key.name
          : t.isStringLiteral(property.node.key) ? property.node.key.value : undefined
      }
      const dynamic = new Set<string>()
      for (const object of objects) for (const property of object.get('properties')) {
        const key = keyOf(property)
        const value = property.isObjectProperty() ? property.get('value') : undefined
        if (key && value?.isArrowFunctionExpression() && value.node.extra?.rrjsReactiveGetter) dynamic.add(key)
      }
      if (!dynamic.size) return
      const parameter = callback.get('params.0')
      if (!parameter?.isIdentifier()) throw callback.buildCodeFrameError('runOnce: reactive fixed-map rows require an identifier parameter')
      for (const object of objects) {
        const fields = new Map(object.get('properties').map(property => [keyOf(property), property]))
        for (const key of dynamic) {
          const property = fields.get(key)
          if (!property?.isObjectProperty()) throw object.buildCodeFrameError('runOnce: reactive fixed-map rows require a consistent direct-property shape')
          const value = property.get('value') as NodePath<t.Expression>
          if (value.isArrowFunctionExpression() && value.node.extra?.rrjsReactiveGetter) continue
          const getter = t.arrowFunctionExpression([], value.node)
          getter.extra = { rrjsReactiveGetter: true }
          generated.add(getter)
          value.replaceWith(getter)
        }
      }
      const parameterBinding = callback.scope.getBinding(parameter.node.name)
        callback.traverse({
        MemberExpression(member) {
          const object = member.get('object')
          const property = member.get('property')
          if (!object.isIdentifier() || object.scope.getBinding(object.node.name) !== parameterBinding) return
          const key = !member.node.computed && property.isIdentifier() ? property.node.name
            : member.node.computed && property.isStringLiteral() ? property.node.value : undefined
          if (!key || !dynamic.has(key)) return
          const keyAttribute = member.findParent(parent => parent.isJSXAttribute()
            && t.isJSXIdentifier(parent.node.name, { name: 'key' }))
          if (keyAttribute) throw member.buildCodeFrameError('runOnce: reactive fixed-map keys are unsupported without reconciliation')
          if (member.parentPath.isCallExpression() && member.key === 'callee') return
          member.replaceWith(t.callExpression(member.node, []))
          member.skip()
        },
      })
    },
  })

  // Rebuild references after moving initializer nodes beneath generated
  // factories, including the direct-alias case `const doubled = count`.
  const identities = [...reactive].map(([binding, component]) => ({ scope: binding.scope, name: binding.identifier.name, component }))
  const operationIdentities = [...operationStates].map(binding => ({ scope: binding.scope, name: binding.identifier.name }))
  const setterIdentities = [...stateSetters].map(([setter, state]) => ({
    scope: setter.scope,
    setter: setter.identifier.name,
    stateScope: state.scope,
    state: state.identifier.name,
  }))
  program.scope.crawl()
  reactive.clear()
  for (const { scope, name, component } of identities) reactive.set(scope.getBinding(name)!, component)
  operationStates.clear()
  for (const { scope, name } of operationIdentities) {
    const binding = scope.getBinding(name)
    if (binding) operationStates.add(binding)
  }
  stateSetters.clear()
  for (const identity of setterIdentities) {
    const setter = identity.scope.getBinding(identity.setter)
    const state = identity.stateScope.getBinding(identity.state)
    if (setter && state) stateSetters.set(setter, state)
  }

  // Give every `useEffect(fn)` the dependency list its callback implies: each
  // reactive binding the callback reads, in first-read order. The existing
  // changing-dependency machinery then does the rest -- the list is read live,
  // and the callback sees a fresh snapshot per run.
  //
  // This is deliberately narrower than React, which re-runs such an effect on
  // every render including ones it has no stake in. Reading nothing reactive
  // therefore yields `[]` and the effect runs once, which is the only thing
  // that can be true when the body never runs a second time.
  program.traverse({
    CallExpression(path) {
      if (!inferredEffects.has(path.node)) return
      const effectCall = path.node
      const callback = path.get('arguments')[0] as NodePath<t.Function>
      const component = path.getFunctionParent()
      const dependencies: t.Expression[] = []
      const seen = new Set<Binding>()
      callback.traverse({
        ReferencedIdentifier(reference) {
          if (generated.has(reference.node)) return
          const binding = reference.scope.getBinding(reference.node.name)
          if (!binding || seen.has(binding)) return
          if (!component || reactive.get(binding) !== component) return
          seen.add(binding)
          // Emit the live read directly. The reference-rewriting pass has
          // already collected its work from an earlier scope crawl, so a bare
          // identifier added here would stay the getter itself -- an identity
          // that never changes, and an effect that never re-runs.
          dependencies.push(t.callExpression(t.identifier(binding.identifier.name), []))
        },
      })
      path.node.arguments.push(t.arrayExpression(dependencies))
      if (dependencies.length > 0) changingEffects.add(effectCall)
    },
  })

  const snapshots = new Map<NodePath<t.Function>, Map<Binding, t.Identifier>>()
  const snapshotFor = (origin: NodePath, binding: Binding): t.Identifier => {
    const component = reactive.get(binding)
    let callback: NodePath<t.Function> | undefined
    let ancestor = origin.parentPath
    while (ancestor && ancestor !== component) {
      if (ancestor.isFunction() && !generated.has(ancestor.node)) callback = ancestor
      ancestor = ancestor.parentPath
    }
    if (!callback) throw origin.buildCodeFrameError('runOnce: direct state snapshots require an event callback')
    const bindings = snapshots.get(callback) ?? new Map<Binding, t.Identifier>()
    let snapshot = bindings.get(binding)
    if (!snapshot) {
      snapshot = callback.scope.generateUidIdentifier(binding.identifier.name)
      bindings.set(binding, snapshot)
      snapshots.set(callback, bindings)
    }
    return t.cloneNode(snapshot)
  }

  // Preserve direct state-value list operations before event capture rewrites
  // their reads into snapshot locals.
  program.traverse({
    CallExpression(path) {
      const callee = path.get('callee')
      if (!callee.isIdentifier() || path.node.arguments.length !== 1) return
      const setter = callee.scope.getBinding(callee.node.name)
      const state = setter ? stateSetters.get(setter) : undefined
      if (!state) return
      const argument = path.get('arguments.0')
      const isStateReference = (node: t.Node | null | undefined): node is t.Identifier =>
        t.isIdentifier(node) && path.scope.getBinding(node.name) === state
      if (argument?.isIdentifier()) {
        const copied = argument.scope.getBinding(argument.node.name)
        const declaration = copied?.path.isVariableDeclarator() ? copied.path : undefined
        const declarationStatement = declaration?.parentPath
        const setterStatement = path.parentPath
        const block = setterStatement?.parentPath
        if (declaration && declarationStatement?.isVariableDeclaration()
          && setterStatement?.isExpressionStatement() && block?.isBlockStatement()) {
          const init = declaration.get('init')
          const statements = block.get('body')
          const declarationIndex = statements.findIndex(statement => statement.node === declarationStatement.node)
          const setterIndex = statements.findIndex(statement => statement.node === setterStatement.node)
          const removeStatement = statements[declarationIndex + 1]
          const insertStatement = statements[declarationIndex + 2]
          const removeDeclaration = removeStatement?.isVariableDeclaration()
            && removeStatement.node.declarations.length === 1 ? removeStatement.get('declarations.0') : undefined
          const removeInit = removeDeclaration?.isVariableDeclarator() ? removeDeclaration.get('init') : undefined
          const removedId = removeDeclaration?.isVariableDeclarator() && t.isArrayPattern(removeDeclaration.node.id)
            ? removeDeclaration.node.id.elements[0] : undefined
          const removeCall = removeInit?.isCallExpression() ? removeInit : undefined
          const insertCall = insertStatement?.isExpressionStatement() && insertStatement.get('expression').isCallExpression()
            ? insertStatement.get('expression') as NodePath<t.CallExpression> : undefined
          const matchesSplice = (call: NodePath<t.CallExpression> | undefined): boolean => {
            const callee = call?.get('callee')
            return Boolean(callee?.isMemberExpression() && !callee.node.computed
              && callee.get('property').isIdentifier({ name: 'splice' })
              && callee.get('object').isIdentifier({ name: argument.node.name })
              && callee.get('object').scope.getBinding(argument.node.name) === copied)
          }
          const sliceCallee = init.isCallExpression() ? init.get('callee') : undefined
          const copiedState = (init.isArrayExpression() && init.node.elements.length === 1
            && t.isSpreadElement(init.node.elements[0]) && isStateReference(init.node.elements[0].argument))
            || (init.isCallExpression() && init.node.arguments.length === 0
              && sliceCallee?.isMemberExpression() && !sliceCallee.node.computed
              && sliceCallee.get('property').isIdentifier({ name: 'slice' })
              && sliceCallee.get('object').isIdentifier()
              && isStateReference(sliceCallee.get('object').node))
          const from = removeCall?.get('arguments.0')
          const to = insertCall?.get('arguments.0')
          const guarded = from?.isIdentifier() && to?.isIdentifier() && statements.slice(0, declarationIndex).some(statement => {
            if (!statement.isIfStatement()) return false
            const consequent = statement.get('consequent')
            const exits = consequent.isReturnStatement() || (consequent.isBlockStatement()
              && consequent.get('body').some(entry => entry.isReturnStatement()))
            if (!exits) return false
            let fromLower = false, toLower = false, toUpper = false
            statement.get('test').traverse({
              BinaryExpression(binary) {
                const left = binary.get('left'), right = binary.get('right')
                if (binary.node.operator === '<' && left.isIdentifier({ name: from.node.name })
                  && left.scope.getBinding(left.node.name) === from.scope.getBinding(from.node.name)
                  && right.isNumericLiteral({ value: 0 })) fromLower = true
                if (binary.node.operator === '<' && left.isIdentifier({ name: to.node.name })
                  && left.scope.getBinding(left.node.name) === to.scope.getBinding(to.node.name)
                  && right.isNumericLiteral({ value: 0 })) toLower = true
                if (binary.node.operator === '>=' && left.isIdentifier({ name: to.node.name })
                  && left.scope.getBinding(left.node.name) === to.scope.getBinding(to.node.name)
                  && right.isMemberExpression() && !right.node.computed
                  && right.get('object').isIdentifier()
                  && isStateReference(right.get('object').node)
                  && right.get('property').isIdentifier({ name: 'length' })) toUpper = true
              },
            })
            return fromLower && toLower && toUpper
          })
          const movedBinding = t.isIdentifier(removedId) ? removeDeclaration?.scope.getBinding(removedId.name) : undefined
          if (copiedState
            && declarationStatement.node.declarations.length === 1
            && declarationIndex >= 0 && setterIndex === declarationIndex + 3
            && copied?.referencePaths.length === 3 && movedBinding?.referencePaths.length === 1
            && guarded
            && matchesSplice(removeCall) && removeCall!.node.arguments.length === 2
            && t.isNumericLiteral(removeCall!.node.arguments[1], { value: 1 })
            && t.isIdentifier(removedId)
            && matchesSplice(insertCall) && insertCall!.node.arguments.length === 3
            && t.isNumericLiteral(insertCall!.node.arguments[1], { value: 0 })
            && t.isIdentifier(insertCall!.node.arguments[2], { name: removedId.name })
            && t.isExpression(removeCall!.node.arguments[0]) && t.isExpression(insertCall!.node.arguments[0])) {
            operationStates.add(state)
            const move = t.callExpression(rendererHelper('listMove'), [
              snapshotFor(path, state),
              t.cloneNode(removeCall!.node.arguments[0] as t.Expression),
              t.cloneNode(insertCall!.node.arguments[0] as t.Expression),
            ])
            move.extra = { rrjsListOperation: true }
            path.node.arguments[0] = move
            deferredRemovals.push(declarationStatement, removeStatement, insertStatement)
            return
          }
        }
      }
      if (argument?.isArrayExpression()) {
        const [head, ...tail] = argument.node.elements
        if (t.isSpreadElement(head) && isStateReference(head.argument)
          && tail.length > 0 && tail.every((element): element is t.Expression => Boolean(element) && t.isExpression(element))) {
          operationStates.add(state)
          const operation = t.callExpression(rendererHelper('listAppend'), [
            snapshotFor(path, state),
            ...tail.map(element => t.cloneNode(element)),
          ])
          operation.extra = { rrjsListOperation: true }
          path.node.arguments[0] = operation
        } else if (t.isSpreadElement(head)) {
          throw argument.buildCodeFrameError('runOnce: array replacement from a non-state snapshot is unsupported without identity matching')
        }
      } else if (argument?.isCallExpression() && t.isMemberExpression(argument.node.callee)
        && !argument.node.callee.computed && isStateReference(argument.node.callee.object)
        && t.isIdentifier(argument.node.callee.property, { name: 'filter' })
        && argument.node.arguments.length === 1 && t.isExpression(argument.node.arguments[0])) {
        operationStates.add(state)
        const operation = t.callExpression(rendererHelper('listFilter'), [
          snapshotFor(path, state),
          t.cloneNode(argument.node.arguments[0]),
        ])
        operation.extra = { rrjsListOperation: true }
        path.node.arguments[0] = operation
      } else if (argument?.isCallExpression() && t.isMemberExpression(argument.node.callee)
        && !argument.node.callee.computed && isStateReference(argument.node.callee.object)
        && t.isIdentifier(argument.node.callee.property, { name: 'map' })
        && argument.node.arguments.length === 1 && t.isExpression(argument.node.arguments[0])) {
        operationStates.add(state)
        recordMapUpdater(state, argument.node.arguments[0])
        const operation = t.callExpression(rendererHelper('listMap'), [
          snapshotFor(path, state),
          t.cloneNode(argument.node.arguments[0]),
        ])
        operation.extra = { rrjsListOperation: true }
        path.node.arguments[0] = operation
      }
    },
  })
  const effectSnapshots = new Map<NodePath<t.Function>, Map<Binding, t.Identifier>>()
  const changingEffectSnapshots = new Map<NodePath<t.Function>, Map<Binding, t.Identifier>>()
  for (const [binding, component] of reactive) {
    for (const reference of [...binding.referencePaths]) {
      const componentName = component.isFunctionDeclaration() ? component.node.id?.name
        : component.parentPath.isVariableDeclarator() && t.isIdentifier(component.parentPath.node.id)
          ? component.parentPath.node.id.name : undefined
      const customReturn = /^use[A-Z]/.test(componentName ?? '')
        && reference.parentPath?.isArrayExpression()
        && reference.findParent(parent => parent.isReturnStatement()
          && parent.getFunctionParent() === component)
      if (customReturn) continue
      const changingDeps = reference.findParent(parent => parent.isArrayExpression()
        && parent.parentPath.isCallExpression() && changingEffects.has(parent.parentPath.node))
      if (changingDeps) {
        reference.replaceWith(t.callExpression(t.identifier(binding.identifier.name), []))
        continue
      }
      if (reference.parentPath?.isCallExpression() && reference.key === 'callee'
        && [...(componentProps.get(component)?.values() ?? [])].includes(binding)) {
        reference.replaceWith(t.callExpression(t.identifier(binding.identifier.name), []))
        continue
      }
      // Find the outermost callback below this component. Nested asynchronous
      // callbacks then close over its snapshot rather than reading future state.
      let callback: NodePath<t.Function> | undefined
      let ancestor = reference.parentPath
      let inGenerated = false
      while (ancestor && ancestor !== component) {
        if (generated.has(ancestor.node) || ancestor.node.extra?.rrjsReactiveGetter) inGenerated = true
        else if (ancestor.isFunction()) callback = ancestor
        ancestor = ancestor.parentPath
      }
      if (callback && !inGenerated) {
        const parent = callback.parentPath
        const args = parent.isCallExpression() ? parent.get('arguments') : []
        const effectCallback = parent.isCallExpression() && hookName(parent)
          === 'useEffect' && args[0] === callback && args[1]?.isArrayExpression()
          && args[1].node.elements.length === 0
        const changingEffectCallback = parent.isCallExpression()
          && changingEffects.has(parent.node) && args[0] === callback
        if (changingEffectCallback) {
          const bindings = changingEffectSnapshots.get(callback) ?? new Map<Binding, t.Identifier>()
          let snapshot = bindings.get(binding)
          if (!snapshot) {
            snapshot = callback.scope.generateUidIdentifier(binding.identifier.name)
            bindings.set(binding, snapshot)
            changingEffectSnapshots.set(callback, bindings)
          }
          reference.replaceWith(t.cloneNode(snapshot))
          continue
        }
        const listCallback = parent.isCallExpression() && (() => {
          const callee = parent.get('callee')
          if (!callee.isMemberExpression() || callee.node.computed
            || !callee.get('property').isIdentifier({ name: 'map' })) return false
          return (() => {
            const source = parent.get('callee.object')
            const identifier = source.isIdentifier() ? source
              : source.isCallExpression() && source.get('callee').isIdentifier()
                ? source.get('callee') as NodePath<t.Identifier> : undefined
            return Boolean(identifier && operationStates.has(identifier.scope.getBinding(identifier.node.name)!))
          })()
        })()
        if (listCallback) {
          reference.replaceWith(t.callExpression(t.identifier(binding.identifier.name), []))
          continue
        }
        if (effectCallback) {
          const bindings = effectSnapshots.get(callback) ?? new Map<Binding, t.Identifier>()
          let snapshot = bindings.get(binding)
          if (!snapshot) { snapshot = callback.scope.generateUidIdentifier(binding.identifier.name); bindings.set(binding, snapshot) }
          effectSnapshots.set(callback, bindings)
          reference.replaceWith(t.cloneNode(snapshot))
          continue
        }
        if (parent.isCallExpression()) throw callback.buildCodeFrameError('runOnce: reactive callback arguments require explicit effect/callback compilation')
        const bindings = snapshots.get(callback) ?? new Map<Binding, t.Identifier>()
        let snapshot = bindings.get(binding)
        if (!snapshot) { snapshot = callback.scope.generateUidIdentifier(binding.identifier.name); bindings.set(binding, snapshot) }
        snapshots.set(callback, bindings)
        reference.replaceWith(t.cloneNode(snapshot))
      } else {
        const jsx = reference.findParent(parent => parent.isJSXExpressionContainer())
        const rootReturn = reference.findParent(parent => parent.isReturnStatement() && parent.getFunctionParent() === component)
        const conditionalRoot = rootReturn?.isReturnStatement() && t.isConditionalExpression(rootReturn.node.argument)
        if (!inGenerated && !jsx && !conditionalRoot) throw reference.buildCodeFrameError('runOnce: state-dependent component control flow is not yet supported; use a JSX expression or const derivation')
        reference.replaceWith(t.callExpression(t.identifier(binding.identifier.name), []))
      }
    }
  }
  for (const [callback, bindings] of effectSnapshots) {
    const call = callback.parentPath
    const statement = call.findParent(parent => parent.isStatement())
    if (!statement) throw callback.buildCodeFrameError('runOnce: useEffect must be a component statement')
    // An effect callback may close over a state binding declared later in the
    // component. Register the callback in its original hook position, but fill
    // its snapshot after each captured binding has been initialized. Passive
    // work cannot run until after component construction and commit.
    const component = reactive.get(bindings.keys().next().value!)!
    const body = component.get('body')
    if (!body.isBlockStatement()) throw callback.buildCodeFrameError('runOnce: effect snapshots require a block component body')
    body.unshiftContainer('body', t.variableDeclaration('let', [...bindings].map(([, snapshot]) =>
      t.variableDeclarator(snapshot))))
    for (const [binding, snapshot] of bindings) {
      const declaration = binding.path.findParent(parent =>
        parent.isStatement() && parent.getFunctionParent() === component)
      if (!declaration) throw callback.buildCodeFrameError('runOnce: effect snapshot binding must be initialized by a component statement')
      declaration.insertAfter(t.expressionStatement(t.assignmentExpression('=',
        t.cloneNode(snapshot), t.callExpression(t.identifier(binding.identifier.name), []))))
    }
  }
  for (const [callback, bindings] of changingEffectSnapshots) {
    if (!t.isBlockStatement(callback.node.body)) {
      callback.node.body = t.blockStatement([t.returnStatement(callback.node.body as t.Expression)])
    }
    callback.node.body.body.unshift(t.variableDeclaration('const', [...bindings].map(([binding, snapshot]) =>
      t.variableDeclarator(snapshot, t.callExpression(t.identifier(binding.identifier.name), [])))))
  }
  for (const effectCall of changingEffects) {
    const deps = effectCall.arguments[1]
    if (t.isArrayExpression(deps)) effectCall.arguments[1] = t.arrowFunctionExpression([], deps)
  }
  for (const [callback, bindings] of snapshots) {
    const eventReference = (path: NodePath): boolean => {
      const container = path.parentPath
      const attribute = container?.parentPath
      return Boolean(container?.isJSXExpressionContainer() && attribute?.isJSXAttribute() && t.isJSXIdentifier(attribute.node.name) && /^on[A-Z]/.test(attribute.node.name.name))
    }
    const eventUse = (path: NodePath): boolean => eventReference(path)
      || Boolean(path.findParent(parent => parent.isFunction() && eventReference(parent)))
    let references: NodePath[] = []
    if (callback.isFunctionDeclaration() && callback.node.id) references = callback.parentPath.scope.getBinding(callback.node.id.name)?.referencePaths ?? []
    else if (callback.parentPath.isVariableDeclarator() && t.isIdentifier(callback.parentPath.node.id)) references = callback.parentPath.scope.getBinding(callback.parentPath.node.id.name)?.referencePaths ?? []
    if (!eventReference(callback) && (!references.length || references.some(reference => !eventUse(reference)))) throw callback.buildCodeFrameError('runOnce: state-capturing functions must be DOM event handlers; escaping callbacks need snapshot compilation')
    if (!t.isBlockStatement(callback.node.body)) callback.node.body = t.blockStatement([t.returnStatement(callback.node.body as t.Expression)])
    callback.node.body.body.unshift(t.variableDeclaration('const', [...bindings].map(([binding, snapshot]) => t.variableDeclarator(snapshot, t.callExpression(t.identifier(binding.identifier.name), [])))))
  }

  // Build a lazy selector per region. Arm factories execute only on a real
  // selection change; nested bindings own their own subscriptions.
  // A portal call is also structural: selecting it constructs an externally
  // placed subtree whose lifetime is represented by its source-tree anchor.
  // Mark only an unbound classic-harness helper or an import whose binding is
  // the named renderer/react-dom export; a same-spelled local is ordinary code.
  program.traverse({
    CallExpression(path) {
      const callee = path.get('callee')
      if (!callee.isIdentifier({ name: 'createPortal' })) return
      const binding = callee.scope.getBinding(callee.node.name)
      if (binding) {
        if (!binding.path.isImportSpecifier()) return
        const imported = binding.path.node.imported
        const importedName = t.isIdentifier(imported) ? imported.name : imported.value
        const declaration = binding.path.parentPath
        if (importedName !== 'createPortal' || !declaration.isImportDeclaration()
          || !['react-dom', '@rrjs/renderer'].includes(declaration.node.source.value)) return
      }
      if (path.node.arguments.length < 2 || !t.isExpression(path.node.arguments[1])) {
        throw path.buildCodeFrameError('runOnce: createPortal requires a child and a stable target identifier')
      }
      const target = path.get('arguments.1')
      if (!target.isIdentifier()) {
        throw target.buildCodeFrameError('runOnce: createPortal target must be a stable identifier')
      }
      const targetBinding = target.scope.getBinding(target.node.name)
      if (targetBinding && (reactive.has(targetBinding) || !targetBinding.constant)) {
        throw target.buildCodeFrameError('runOnce: changing createPortal targets are unsupported')
      }
      if (path.node.arguments.length > 2 && !t.isNullLiteral(path.node.arguments[2])) {
        throw path.get('arguments.2').buildCodeFrameError('runOnce: createPortal keys are unsupported')
      }
      path.node.extra = { ...(path.node.extra ?? {}), rrjsRegion: true }
    },
  })
  const structural = (node: t.Node): boolean => {
    if (t.isJSXElement(node) || t.isJSXFragment(node) || node.extra?.rrjsRegion) return true
    if (t.isConditionalExpression(node)) return structural(node.consequent) || structural(node.alternate)
    if (t.isLogicalExpression(node)) return structural(node.left) || structural(node.right)
    return false
  }
  const children = (node: t.JSXElement | t.JSXFragment) => node.children.filter(child =>
    !t.isJSXText(child) || child.value.trim().length > 0 || !/[\r\n]/.test(child.value))
  const childExpr = (child: ReturnType<typeof children>[number] | undefined): t.Expression => !child ? t.nullLiteral()
    : t.isJSXText(child) ? t.stringLiteral(child.value)
    : t.isJSXExpressionContainer(child) ? t.isJSXEmptyExpression(child.expression) ? t.nullLiteral() : child.expression
    : t.isJSXSpreadChild(child) ? child.expression : child
  function gateByLazyAncestors(origin: NodePath, test: t.Expression): t.Expression {
    const component = origin.getFunctionParent()
    let gated = test
    let cursor: NodePath | null = origin
    while (cursor?.parentPath && cursor.parentPath !== component) {
      const parent: NodePath = cursor.parentPath
      if (parent.isConditionalExpression()) {
        if (cursor.key === 'consequent') {
          gated = t.conditionalExpression(t.cloneNode(parent.node.test), gated, t.booleanLiteral(false))
        } else if (cursor.key === 'alternate') {
          gated = t.conditionalExpression(t.cloneNode(parent.node.test), t.booleanLiteral(false), gated)
        }
      } else if (parent.isLogicalExpression() && cursor.key === 'right') {
        if (parent.node.operator === '&&') {
          gated = t.conditionalExpression(t.cloneNode(parent.node.left), gated, t.booleanLiteral(false))
        } else if (parent.node.operator === '||') {
          gated = t.conditionalExpression(t.cloneNode(parent.node.left), t.booleanLiteral(false), gated)
        }
      }
      cursor = parent
    }
    return gated
  }
  function cacheCondition(origin: NodePath, test: t.Expression): t.Expression {
    const component = origin.getFunctionParent()
    const statement = origin.findParent(parent => parent.isStatement() && parent.getFunctionParent() === component)
    if (!component || !components.has(component) || !statement) {
      throw origin.buildCodeFrameError('runOnce: common branch conditions require a component statement')
    }
    const binding = component.scope.generateUidIdentifier('condition')
    const factory = t.arrowFunctionExpression([], gateByLazyAncestors(origin, test))
    statement.insertBefore(t.variableDeclaration('const', [
      t.variableDeclarator(t.cloneNode(binding), t.callExpression(derive(), [factory])),
    ]))
    return t.callExpression(t.cloneNode(binding), [])
  }
  function select(
    test: t.Expression,
    yes: t.Expression,
    no: t.Expression,
    origin: NodePath,
    passthrough?: 'yes' | 'no',
    cached = false,
  ): t.Expression {
    // Unkeyed fragment syntax has the same positional identity semantics as its
    // single child. Peel that transparent layer before merging common elements.
    if (t.isJSXFragment(yes) && t.isJSXFragment(no)) {
      const yesChildren = children(yes), noChildren = children(no)
      if (yesChildren.length === 1 && noChildren.length === 1) {
        return select(test, childExpr(yesChildren[0]), childExpr(noChildren[0]), origin, passthrough, cached)
      }
    }
    // Compile common native structure once. This comparison is at compile time;
    // the generated runtime has no old/new element-tree matching operation.
    if (t.isJSXElement(yes) && t.isJSXElement(no)
      && t.isJSXIdentifier(yes.openingElement.name) && t.isJSXIdentifier(no.openingElement.name)
      && yes.openingElement.name.name === no.openingElement.name.name) {
      const attrs = (node: t.JSXElement) => new Map(node.openingElement.attributes
        .filter((attr): attr is t.JSXAttribute => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name))
        .map(attr => [(attr.name as t.JSXIdentifier).name, attr]))
      const a = attrs(yes), b = attrs(no)
      const same = (left?: t.Node, right?: t.Node) => !left || !right ? left === right : t.isNodesEquivalent(left, right)
      if (same(a.get('key'), b.get('key'))) {
        if (yes.openingElement.attributes.some(attr => t.isJSXSpreadAttribute(attr)) || no.openingElement.attributes.some(attr => t.isJSXSpreadAttribute(attr))) {
          throw program.buildCodeFrameError('runOnce: common branch elements with spread props require further analysis')
        }
        const condition = cached ? test : cacheCondition(origin, test)
        const expression = (attr?: t.JSXAttribute): t.Expression => !attr ? t.unaryExpression('void', t.numericLiteral(0))
          : !attr.value ? t.booleanLiteral(true)
          : t.isJSXExpressionContainer(attr.value) ? attr.value.expression as t.Expression : attr.value
        const merged = t.cloneNode(yes)
        merged.openingElement.attributes = [...new Set([...a.keys(), ...b.keys()])].map(name => {
          if (same(a.get(name), b.get(name))) return t.cloneNode(a.get(name)!)
          if (/^on[A-Z]/.test(name) || name === 'ref') throw program.buildCodeFrameError('runOnce: changing event/ref props across common branch elements require commit compilation')
          return t.jsxAttribute(t.jsxIdentifier(name), t.jsxExpressionContainer(t.conditionalExpression(t.cloneNode(condition), expression(a.get(name)), expression(b.get(name)))))
        })
        const ac = children(yes), bc = children(no)
        merged.children = Array.from({length: Math.max(ac.length, bc.length)}, (_, index) => {
          const left = childExpr(ac[index]), right = childExpr(bc[index])
          return t.jsxExpressionContainer(structural(left) || structural(right)
            ? select(t.cloneNode(condition), left, right, origin, undefined, true) : t.conditionalExpression(t.cloneNode(condition), left, right))
        })
        return merged
      }
    }
    const arm = (node: t.Expression, side: 'yes' | 'no') => passthrough === side
      ? (() => {
          const condition = origin.scope.generateUidIdentifier('condition')
          return t.arrowFunctionExpression([condition], t.arrowFunctionExpression([], t.callExpression(t.cloneNode(condition), [])))
        })()
      : t.arrowFunctionExpression([],
      t.isJSXElement(node) || t.isJSXFragment(node) || node.extra?.rrjsRegion
        ? node : t.arrowFunctionExpression([], node))
    const call = t.callExpression(choose(), [t.arrowFunctionExpression([], test), arm(yes, 'yes'), arm(no, 'no')])
    call.extra = { rrjsRegion: true }
    return call
  }
  program.traverse({
    ConditionalExpression: { exit(path) {
      if (!structural(path.node)) return
      path.replaceWith(select(path.node.test, path.node.consequent, path.node.alternate, path))
      path.skip()
    } },
    LogicalExpression: { exit(path) {
      if (!structural(path.node) || path.node.operator === '??') return
      const {left, right, operator} = path.node
      path.replaceWith(operator === '&&'
        ? select(left, right, t.cloneNode(left), path, 'no')
        : select(left, t.cloneNode(left), right, path, 'yes'))
      path.skip()
    } },
  })

  // A direct local prop getter retains the parent's operation-bearing array
  // unchanged. Resolve bindings after scope rebuilding and propagate only that
  // exact identity edge; aliases, spreads and computed wrappers remain rejected.
  let propagated = true
  while (propagated) {
    propagated = false
    for (const edge of propSources) {
      const parent = edge.parentScope.getBinding(edge.parentName)
      const child = edge.childScope.getBinding(edge.childName)
      if (!parent || !child || operationStates.has(child)) continue
      operationStates.add(parent)
      operationStates.add(child)
      const parentMappers = mapUpdaters.get(parent)
      if (parentMappers) mapUpdaters.set(child, parentMappers)
      propagated = true
    }
  }

  // Phase 5 first slice: retain source-visible append provenance. The state
  // value remains an ordinary array; non-enumerable metadata carries the exact
  // operation to the owned list region.
  program.traverse({
    CallExpression: { exit(path) {
      const callee = path.get('callee')
      if (callee.isIdentifier()) {
        const setterBinding = callee.scope.getBinding(callee.node.name)
        if (setterBinding && stateSetters.has(setterBinding) && path.node.arguments.length === 1) {
          const stateBinding = stateSetters.get(setterBinding)!
          const updater = path.get('arguments.0')
          const operationHelpers = new Set(['listAppend', 'listPrepend', 'listClear', 'listTruncate', 'listSplice', 'listReverse', 'listFilter', 'listSort', 'listMap', 'listMove'])
          const generatedOperation = updater?.isCallExpression() && updater.get('callee').isIdentifier() && (() => {
            const helper = updater.get('callee') as NodePath<t.Identifier>
            if (operationHelpers.has(helper.node.name)) return true
            const helperBinding = helper.scope.getBinding(helper.node.name)
            const imported = helperBinding?.path.isImportSpecifier() ? helperBinding.path.node.imported : undefined
            return t.isIdentifier(imported) && operationHelpers.has(imported.name)
          })()
          let recognized = Boolean(updater?.node.extra?.rrjsListOperation || generatedOperation)
          const isSnapshot = (node: t.Node | null | undefined): boolean => {
            if (!t.isIdentifier(node)) return false
            const binding = path.scope.getBinding(node.name)
            if (binding === stateBinding) return true
            const init = binding?.path.isVariableDeclarator() ? binding.path.node.init : undefined
            return Boolean(binding && t.isCallExpression(init) && init.arguments.length === 0
              && t.isIdentifier(init.callee)
              && binding.path.scope.getBinding(init.callee.name) === stateBinding)
          }
          if (updater?.isArrayExpression() && updater.node.elements.length === 0) {
            recognized = true
            operationStates.add(stateBinding)
            path.node.arguments[0] = t.callExpression(rendererHelper('listClear'), [
              t.callExpression(t.identifier(stateBinding.identifier.name), []),
            ])
          }
          if (updater?.isArrayExpression()) {
            const [head, ...tail] = updater.node.elements
            if (t.isSpreadElement(head) && isSnapshot(head.argument)
              && tail.length > 0 && tail.every((element): element is t.Expression => Boolean(element) && t.isExpression(element))) {
              recognized = true
              operationStates.add(stateBinding)
              path.node.arguments[0] = t.callExpression(rendererHelper('listAppend'), [
                t.cloneNode(head.argument),
                ...tail.map(element => t.cloneNode(element)),
              ])
            }
          }
          if (updater?.isCallExpression() && t.isMemberExpression(updater.node.callee)
            && !updater.node.callee.computed && isSnapshot(updater.node.callee.object)
            && t.isIdentifier(updater.node.callee.property, { name: 'filter' })
            && updater.node.arguments.length === 1 && t.isExpression(updater.node.arguments[0])) {
            recognized = true
            operationStates.add(stateBinding)
            path.node.arguments[0] = t.callExpression(rendererHelper('listFilter'), [
              t.cloneNode(updater.node.callee.object),
              t.cloneNode(updater.node.arguments[0]),
            ])
          }
          if (updater?.isCallExpression() && t.isMemberExpression(updater.node.callee)
            && !updater.node.callee.computed && isSnapshot(updater.node.callee.object)
            && t.isIdentifier(updater.node.callee.property, { name: 'map' })
            && updater.node.arguments.length === 1 && t.isExpression(updater.node.arguments[0])) {
            recognized = true
            operationStates.add(stateBinding)
            recordMapUpdater(stateBinding, updater.node.arguments[0] as t.Expression)
            path.node.arguments[0] = t.callExpression(rendererHelper('listMap'), [
              t.cloneNode(updater.node.callee.object),
              t.cloneNode(updater.node.arguments[0]),
            ])
          }
          if (updater?.isArrowFunctionExpression() && updater.node.params.length === 1
            && t.isIdentifier(updater.node.params[0]) && t.isArrayExpression(updater.node.body)) {
            const elements = updater.node.body.elements
            const [head, ...tail] = elements
            const last = elements.at(-1)
            const prefix = elements.slice(0, -1)
            if (t.isSpreadElement(head) && t.isIdentifier(head.argument, { name: updater.node.params[0].name })
              && tail.length > 0 && tail.every((element): element is t.Expression => Boolean(element) && t.isExpression(element))) {
              recognized = true
              operationStates.add(stateBinding)
              updater.node.body = t.callExpression(rendererHelper('listAppend'), [
                t.cloneNode(updater.node.params[0]),
                ...tail.map(element => t.cloneNode(element)),
              ])
            } else if (t.isSpreadElement(last) && t.isIdentifier(last.argument, { name: updater.node.params[0].name })
              && prefix.length > 0 && prefix.every((element): element is t.Expression => Boolean(element) && t.isExpression(element))) {
              recognized = true
              operationStates.add(stateBinding)
              updater.node.body = t.callExpression(rendererHelper('listPrepend'), [
                t.cloneNode(updater.node.params[0]),
                ...prefix.map(element => t.cloneNode(element)),
              ])
            }
          }
          if (updater?.isArrowFunctionExpression() && updater.node.params.length === 1
            && t.isIdentifier(updater.node.params[0]) && t.isCallExpression(updater.node.body)
            && t.isMemberExpression(updater.node.body.callee) && !updater.node.body.callee.computed
            && t.isIdentifier(updater.node.body.callee.object, { name: updater.node.params[0].name })
            && t.isIdentifier(updater.node.body.callee.property, { name: 'slice' })
            && updater.node.body.arguments.length === 2
            && t.isNumericLiteral(updater.node.body.arguments[0], { value: 0 })
            && t.isUnaryExpression(updater.node.body.arguments[1], { operator: '-' })
            && t.isNumericLiteral(updater.node.body.arguments[1].argument, { value: 1 })) {
            recognized = true
            operationStates.add(stateBinding)
            updater.node.body = t.callExpression(rendererHelper('listTruncate'), [
              t.cloneNode(updater.node.params[0]),
              t.binaryExpression('-', t.memberExpression(t.cloneNode(updater.node.params[0]), t.identifier('length')), t.numericLiteral(1)),
            ])
          }
          if (updater?.isArrowFunctionExpression() && updater.node.params.length === 1
            && t.isIdentifier(updater.node.params[0]) && t.isCallExpression(updater.node.body)
            && t.isMemberExpression(updater.node.body.callee) && !updater.node.body.callee.computed
            && t.isIdentifier(updater.node.body.callee.object, { name: updater.node.params[0].name })
            && t.isIdentifier(updater.node.body.callee.property, { name: 'toSpliced' })
            && updater.node.body.arguments.length >= 2
            && updater.node.body.arguments.every(argument => t.isExpression(argument))) {
            recognized = true
            operationStates.add(stateBinding)
            updater.node.body = t.callExpression(rendererHelper('listSplice'), [
              t.cloneNode(updater.node.params[0]),
              ...updater.node.body.arguments.map(argument => t.cloneNode(argument as t.Expression)),
            ])
          }
          if (updater?.isArrowFunctionExpression() && updater.node.params.length === 1
            && t.isIdentifier(updater.node.params[0]) && t.isCallExpression(updater.node.body)
            && t.isMemberExpression(updater.node.body.callee) && !updater.node.body.callee.computed
            && t.isIdentifier(updater.node.body.callee.object, { name: updater.node.params[0].name })
            && t.isIdentifier(updater.node.body.callee.property, { name: 'toReversed' })
            && updater.node.body.arguments.length === 0) {
            recognized = true
            operationStates.add(stateBinding)
            updater.node.body = t.callExpression(rendererHelper('listReverse'), [t.cloneNode(updater.node.params[0])])
          }
          if (updater?.isArrowFunctionExpression() && updater.node.params.length === 1
            && t.isIdentifier(updater.node.params[0]) && t.isCallExpression(updater.node.body)
            && t.isMemberExpression(updater.node.body.callee) && !updater.node.body.callee.computed
            && t.isIdentifier(updater.node.body.callee.object, { name: updater.node.params[0].name })
            && t.isIdentifier(updater.node.body.callee.property, { name: 'filter' })
            && updater.node.body.arguments.length === 1 && t.isExpression(updater.node.body.arguments[0])) {
            recognized = true
            operationStates.add(stateBinding)
            updater.node.body = t.callExpression(rendererHelper('listFilter'), [
              t.cloneNode(updater.node.params[0]),
              t.cloneNode(updater.node.body.arguments[0]),
            ])
          }
          if (updater?.isArrowFunctionExpression() && updater.node.params.length === 1
            && t.isIdentifier(updater.node.params[0]) && t.isCallExpression(updater.node.body)
            && t.isMemberExpression(updater.node.body.callee) && !updater.node.body.callee.computed
            && t.isIdentifier(updater.node.body.callee.object, { name: updater.node.params[0].name })
            && t.isIdentifier(updater.node.body.callee.property, { name: 'toSorted' })
            && updater.node.body.arguments.length <= 1
            && updater.node.body.arguments.every(argument => t.isExpression(argument))) {
            recognized = true
            operationStates.add(stateBinding)
            updater.node.body = t.callExpression(rendererHelper('listSort'), [
              t.cloneNode(updater.node.params[0]),
              ...updater.node.body.arguments.map(argument => t.cloneNode(argument as t.Expression)),
            ])
          }
          if (!recognized && updater?.isArrayExpression()
            && updater.node.elements.some(element => t.isSpreadElement(element))) {
            throw updater.buildCodeFrameError('runOnce: array replacement from a non-state snapshot is unsupported without identity matching')
          }
          if (!recognized && operationStates.has(stateBinding)) {
            throw updater.buildCodeFrameError('runOnce: opaque list replacement is unsupported without direct operation provenance')
          }
        }
      }

      if (!callee.isMemberExpression() || callee.node.computed
        || !callee.get('property').isIdentifier({ name: 'map' }) || path.node.arguments.length !== 1) return
      const source = callee.get('object')
      const sourceIdentifier = source.isIdentifier() ? source
        : source.isCallExpression() && source.node.arguments.length === 0 && source.get('callee').isIdentifier()
          ? source.get('callee') as NodePath<t.Identifier> : undefined
      if (!sourceIdentifier) return
      const sourceBinding = sourceIdentifier.scope.getBinding(sourceIdentifier.node.name)
      if (!sourceBinding || !reactive.has(sourceBinding) || !operationStates.has(sourceBinding)) return
      const callback = path.get('arguments.0')
      if (!callback?.isArrowFunctionExpression() || callback.node.async
        || callback.node.params.length < 1 || callback.node.params.length > 2
        || !callback.node.params.every(parameter => t.isIdentifier(parameter))) return
      const returned = t.isJSXElement(callback.node.body) ? callback.node.body
        : t.isBlockStatement(callback.node.body)
          ? [...callback.node.body.body].reverse().find(statement => t.isReturnStatement(statement))?.argument
          : undefined
      if (!returned || !t.isJSXElement(returned)) return
      const key = returned.openingElement.attributes.find(attribute => t.isJSXAttribute(attribute)
        && t.isJSXIdentifier(attribute.name, { name: 'key' }))
      if (!key) return
      const mappedByState = mapUpdaters.get(sourceBinding) ?? (() => {
        for (const edge of propSources) {
          const child = edge.childScope.getBinding(edge.childName)
          const parent = edge.parentScope.getBinding(edge.parentName)
          if (child === sourceBinding && parent && mapUpdaters.has(parent)) return mapUpdaters.get(parent)
        }
        return undefined
      })()
      const item = callback.node.params[0]
      const keyValue = t.isJSXAttribute(key) && t.isJSXExpressionContainer(key.value)
        ? key.value.expression : undefined
      const property = t.isIdentifier(item) && t.isMemberExpression(keyValue)
        && !keyValue.computed && t.isIdentifier(keyValue.object, { name: item.name })
        && t.isIdentifier(keyValue.property) ? keyValue.property.name : undefined
      const owner = path.getFunctionParent()
      const propName = owner ? [...(componentProps.get(owner)?.entries() ?? [])]
        .find(([, binding]) => binding.identifier.name === sourceBinding.identifier.name
          && binding.scope === sourceBinding.scope)?.[0] : undefined
      const contractedKey = propName ? moduleMetadata?.operationKeyProps?.[propName] : undefined
      if (contractedKey && property !== contractedKey) {
        throw path.buildCodeFrameError(`runOnce: operation prop ${propName} must use direct JSX key ${contractedKey}`)
      }
      let stableKeyProperty: string | undefined = contractedKey
      if (mappedByState?.length) {
        if (!property || mappedByState.some(mapper => !mapperPreservesProperty(mapper, property))) {
          throw path.buildCodeFrameError('runOnce: listMap must statically preserve the direct-property JSX key')
        }
        stableKeyProperty = property
      }
      if (t.isIdentifier(callback.node.params[0]) && t.isBlockStatement(callback.node.body)) {
        const itemBinding = callback.scope.getBinding(callback.node.params[0].name)
        const callbackBody = callback.get('body')
        if (!callbackBody.isBlockStatement()) throw callback.buildCodeFrameError('runOnce: expected a list callback block')
        for (const statement of callbackBody.get('body')) {
          if (!statement.isVariableDeclaration()) continue
          for (const declaration of statement.get('declarations')) {
            const init = declaration.get('init')
            if (!init.isExpression()) continue
            const properties = new Set<string>()
            init.traverse({
              Identifier(reference) {
                if (!itemBinding || reference.scope.getBinding(reference.node.name) !== itemBinding) return
                const member = reference.parentPath
                if (member.isMemberExpression() && reference.key === 'object'
                  && !member.node.computed && t.isIdentifier(member.node.property)) {
                  properties.add(member.node.property.name)
                } else {
                  properties.add('*')
                }
              },
            })
            if (properties.size && (!stableKeyProperty
              || [...properties].some(property => property !== stableKeyProperty))) {
              throw declaration.buildCodeFrameError('runOnce: listMap callback locals derived from mutable item fields require row-owned reactive compilation')
            }
          }
        }
      }
      if (callback.node.params.length === 2 && t.isIdentifier(callback.node.params[1])) {
        const indexBinding = callback.scope.getBinding(callback.node.params[1].name)
        for (const reference of indexBinding?.referencePaths ?? []) {
          reference.replaceWith(t.callExpression(t.cloneNode(callback.node.params[1]), []))
        }
      }
      path.replaceWith(t.callExpression(rendererHelper('operationList'), [
        t.arrowFunctionExpression([], source.isCallExpression()
          ? t.cloneNode(source.node) : t.callExpression(t.cloneNode(sourceIdentifier.node), [])),
        t.cloneNode(callback.node),
      ]))
      path.skip()
    } },
  })

  for (const edge of importedOperationEdges) {
    const state = edge.scope.getBinding(edge.state)
    const mappers = state ? mapUpdaters.get(state) : undefined
    if (mappers?.some(mapper => !mapperPreservesProperty(mapper, edge.key))) {
      throw edge.origin.buildCodeFrameError(`runOnce: imported operation prop ${edge.prop} must preserve JSX key ${edge.key}`)
    }
  }

  // A rejected construct must not quietly route through the keyed reconciler.
  program.traverse({
    JSXOpeningElement(path) {
      if (!t.isJSXIdentifier(path.node.name, { name: 'input' })) return
      const attributes = path.get('attributes')
      const hasChange = attributes.some(attribute => attribute.isJSXAttribute()
        && t.isJSXIdentifier(attribute.node.name, { name: 'onChange' }))
      if (!hasChange) return
      const type = attributes.find(attribute => attribute.isJSXAttribute()
        && t.isJSXIdentifier(attribute.node.name, { name: 'type' }))
      if (!type?.isJSXAttribute() || type.node.value == null || t.isStringLiteral(type.node.value)) return
      if (t.isJSXExpressionContainer(type.node.value)
        && t.isStringLiteral(type.node.value.expression)) return
      throw type.buildCodeFrameError('runOnce: dynamic input type with onChange is unsupported because the native event mapping can change')
    },
    CallExpression(path) {
      const name = hookName(path)
      const callee = path.node.callee
      const hookSyntax = t.isIdentifier(callee) ? callee.name : t.isMemberExpression(callee) && t.isIdentifier(callee.property) ? callee.property.name : ''
      const localHookBinding = t.isIdentifier(callee) ? path.scope.getBinding(callee.name) : undefined
      const localHook = Boolean(localHookBinding
        && [...customHooks.keys()].some(binding => binding.path.node === localHookBinding.path.node))
      const analyzedHook = Boolean(t.isIdentifier(callee) && isImportedReactiveHook(localHookBinding))
      if (/^use[A-Z]/.test(hookSyntax) && !name && !localHook && !analyzedHook) throw path.buildCodeFrameError('runOnce: custom and namespace hook calls require additional compiler analysis; use named supported hooks')
      if (name && /^use[A-Z]/.test(name) && name !== 'useState' && name !== 'useRef' && name !== 'useEffect' && name !== 'useContext') throw path.buildCodeFrameError(`runOnce: ${name} is not supported by this compiler pass yet`)
      if (t.isMemberExpression(path.node.callee) && t.isIdentifier(path.node.callee.property, { name: 'map' })) {
        const object = path.get('callee.object')
        const binding = object.isIdentifier() ? object.scope.getBinding(object.node.name) : undefined
        // A const array literal that nothing mutates is fixed for as long as the
        // component exists, so its rows can be emitted once. Module scope shows
        // that trivially; a declaration inside the component qualifies too,
        // because the body runs once.
        //
        // An array that reads state, a derived value, a prop or context is a
        // reactive binding by the time this runs, and reactive bindings are read
        // live -- the call site is `xs().map(...)`. Its callee object is a call
        // rather than an identifier, so no binding is resolved here and the
        // array is refused instead of being emitted once and left stale. The
        // `refuses a fixed array whose contents read ...` cases in
        // apps/compat-audit/tests/runonce-constructs.test.ts pin that.
        const onlyMapped = (candidate: Binding): boolean => candidate.referencePaths.every(reference => {
          const member = reference.parentPath
          const call = member?.parentPath
          return Boolean(member?.isMemberExpression() && reference.key === 'object' && !member.node.computed
            && member.get('property').isIdentifier({ name: 'map' })
            && call?.isCallExpression() && member.key === 'callee')
        })
        const literal = binding?.constant && binding.path.isVariableDeclarator()
          && t.isArrayExpression(binding.path.node.init) ? binding.path.get('init') as NodePath<t.ArrayExpression> : undefined
        const ownedByThisComponent = Boolean(binding
          && binding.scope.getFunctionParent() === path.scope.getFunctionParent())
        const fixedArray = Boolean(literal && onlyMapped(binding!)
          && (binding!.scope.path.isProgram() || ownedByThisComponent))
        const staticArray = object.isArrayExpression() || fixedArray
        if (!staticArray) throw path.buildCodeFrameError('runOnce: lists require direct operation compilation; keyed reconciliation is disabled')
        path.node.extra = { ...(path.node.extra ?? {}), rrjsStaticMap: true }
      }
      if (t.isIdentifier(path.node.callee)) {
        const binding = path.scope.getBinding(path.node.callee.name)
        const imported = binding?.path.isImportSpecifier() ? binding.path.node.imported : undefined
        if ((!binding && path.node.callee.name === 'list') || (imported && t.isIdentifier(imported, { name: 'list' }))) throw path.buildCodeFrameError('runOnce: explicit keyed reconciler calls are disabled')
      }
    },
  })
  for (const path of deferredRemovals) if (!path.removed) path.remove()
}
