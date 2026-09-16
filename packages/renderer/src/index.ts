import { effect, createSignal, untrack, emitRuntimeEvent } from '@rrjs/signals'
import {
  createInstance,
  withInstance,
  flushLayoutEffects,
  flushPassiveEffects,
  pushContext,
  popContext,
  captureContext,
  withContextSnapshot,
  type Context,
  isForwardRef,
    type ComponentInstance,
} from '@rrjs/react-compat'

// ─── Instance tracking ──────────────────────────────────────────────────────
// We need to track which component instance produced each DOM node so we can
// run that instance's cleanups when the node is removed.
// WeakMap so removed nodes get garbage collected with their instances.

const instanceByNode = new WeakMap<Node, Set<ComponentInstance>>()
const disposersByNode = new WeakMap<Node, Array<() => void>>()
const mountedNodes = new WeakSet<Node>()
const disposedInstances = new WeakSet<ComponentInstance>()
// Construction can fail before returned nodes acquire an owner. Retain only
// nodes with resources, until their component finishes construction.
const constructionScopes: Set<Node>[] = []
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink'
type PortalRecord = { target: Element | DocumentFragment; nodes: Node[]; committed: boolean }
const portalsByAnchor = new WeakMap<Node, PortalRecord>()

function trackConstruction(node: Node): void {
  for (const scope of constructionScopes) scope.add(node)
}

function trackInstance(node: Node, instance: ComponentInstance): void {
  trackConstruction(node)
  const instances = instanceByNode.get(node) ?? new Set<ComponentInstance>()
  instances.add(instance)
  instanceByNode.set(node, instances)
}

function commitNode(node: Node): void {
  mountedNodes.add(node)
  for (const child of Array.from(node.childNodes)) commitNode(child)
  const portal = portalsByAnchor.get(node)
  if (portal && !portal.committed) {
    portal.committed = true
    for (const child of portal.nodes) portal.target.appendChild(child)
    for (const child of portal.nodes) commitNode(child)
  }
  const instances = instanceByNode.get(node)
  if (instances) {
    untrack(() => {
      for (const instance of instances) {
        flushLayoutEffects(instance)
        if (instance.passiveEffects.length) flushPassiveEffects(instance)
      }
    })
  }
}

function ownBinding(node: Node, dispose: () => void): void {
  trackConstruction(node)
  const disposers = disposersByNode.get(node) ?? []
  disposers.push(dispose)
  disposersByNode.set(node, disposers)
}
// ─── Types ──────────────────────────────────────────────────────────────────

type Child = string | number | null | undefined | boolean | (() => any) | Node | any[]
type Props = Record<string, any> | null

type ComponentFn = (props: any) => any

/**
 * Render preconstructed children into an external DOM container while retaining
 * their lifetime under the component tree containing the returned anchor.
 */
export function createPortal(
  children: Child,
  container: Element | DocumentFragment,
  key?: null,
): Node {
  if (!(container instanceof Element) && !(container instanceof DocumentFragment)) {
    throw new TypeError('createPortal target must be an Element or DocumentFragment')
  }
  if (key !== undefined && key !== null) {
    throw new Error('createPortal keys are not supported by the strict target')
  }
  const normalized = normalizeReturn(children)
  const nodes = Array.isArray(normalized) ? normalized : [normalized]
  const anchor = document.createTextNode('')
  const record: PortalRecord = { target: container, nodes, committed: false }
  portalsByAnchor.set(anchor, record)
  ownBinding(anchor, () => {
    portalsByAnchor.delete(anchor)
    const owned = record.nodes.splice(0)
    finishTeardowns(owned.map(node => () => unmountNode(node)))
  })
  return anchor
}

/** Compiler-owned branch selection; no element-tree or keyed-row matching. */
export function choose(
  test: () => unknown,
  yes: (condition: () => unknown) => any,
  no: (condition: () => unknown) => any,
): () => any {
  const context = captureContext()
  let initialized = false
  let selected = false
  let condition: unknown
  let value: any
  const readCondition = () => condition
  return () => {
    condition = test()
    const next = Boolean(condition)
    if (!initialized || selected !== next) {
      const result = untrack(() => withContextSnapshot(context, () => (next ? yes : no)(readCondition)))
      selected = next
      value = result
      initialized = true
    }
    return value
  }
}

// ─── h() — hyperscript, now component-aware ─────────────────────────────────

export function h(
  tag: string | ComponentFn | { _id: symbol; _isProvider?: true; _context?: any },
  props: Props = null,
  ...children: Child[]
): Node | Node[] {
  if (typeof tag === 'function' && (tag as any)._isProvider === true) {
    const context = (tag as any)._context as Context<unknown>
    pushContext(context._id, props?.value)
    try {
      const child = children.length === 1 ? children[0] : children
      return normalizeReturn(typeof child === 'function' ? child() : child)
    } finally {
      popContext(context._id)
    }
  }
  // ── Component function (capital-letter tag) ──
  if (typeof tag === 'function') {
    return mountComponent(tag, props, children)
  }

  // ── Context.Provider (special object form) ──
  // The Provider is itself a function returned by createContext.
  // The Babel plugin emits <ThemeContext.Provider value={...}>...</...>
  // which compiles to h(ThemeContext.Provider, {value:...}, ...children).
  // The Provider function is what we receive as `tag` in that case.
  // ↑ this is already handled by the typeof tag === 'function' branch above.

  // ── Native HTML element ──
  return createElement(tag as string, props, children)
}

// ─── unmount ────────────────────────────────────────────────────────────────
// Walk a DOM node looking for component instances tagged via instanceByNode.
// For each instance found, run its cleanups in the correct order:
//   1. Layout effects' cleanups
//   2. Passive effects' cleanups
//   3. Anything pushed onto instance.cleanup (useSyncExternalStore, etc.)
// Then walk into children and unmount them recursively.

function finishTeardowns(tasks: Array<() => void>): void {
  const failures: unknown[] = []
  for (const task of tasks) {
    try { task() } catch (error) { failures.push(error) }
  }
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) throw new AggregateError(failures, 'Resource cleanup failed')
}

export function unmountNode(node: Node): void {
  mountedNodes.delete(node)
  const disposers = disposersByNode.get(node) ?? []
  const instances = instanceByNode.get(node)
  const children = Array.from(node.childNodes)
  // Release ownership before invoking user cleanup, including reentrant cleanup.
  disposersByNode.delete(node)
  instanceByNode.delete(node)
  untrack(() => finishTeardowns([
    ...disposers,
    ...children.map(child => () => unmountNode(child)),
    ...Array.from(instances ?? [], instance => () => runInstanceCleanups(instance)),
    () => { if (node.parentNode) node.parentNode.removeChild(node) },
  ]))
}

function runInstanceCleanups(instance: ComponentInstance): void {
  if (disposedInstances.has(instance)) return
  disposedInstances.add(instance)
  emitRuntimeEvent('component-dispose', instance)
  // Cancel mount effects that have not yet reached their asynchronous flush.
  instance.layoutEffects = []
  instance.passiveEffects = []
  const tasks: Array<() => void> = []
  // Preserve the existing hook teardown order. Clear callbacks before invoking
  // any of them so throwing or reentrant cleanup cannot execute them twice.
  // React destroys effects in declaration order within one component.
  for (let i = 0; i < instance.hooks.length; i++) {
    const hook = instance.hooks[i]
    if (hook && typeof hook.cleanup === 'function') {
      const cleanup = hook.cleanup
      tasks.push(() => cleanup.call(hook))
      hook.cleanup = null
    }
  }

  // Hook-level cleanups (useSyncExternalStore pushed an unsubscribe here)
  tasks.push(...instance.cleanup)
  instance.cleanup = []
  finishTeardowns(tasks)
}

// ─── Mount a component function ─────────────────────────────────────────────

function mountComponent(
  fn: ComponentFn | any,
  props: Props,
  children: Child[]
): Node | Node[] {
  const instance = createInstance(fn.displayName || fn.name || 'Anonymous')
  const childProp = children.length === 0 ? undefined : children.length === 1 ? children[0] : children
  const mergedProps = { ...(props ?? {}), children: childProp }

  const scope = new Set<Node>()
  constructionScopes.push(scope)
  try {
    let result: any
    if (isForwardRef(fn)) {
      const { ref, ...rest } = mergedProps as any
      result = withInstance(instance, () => fn._render(rest, ref ?? null))
    } else {
      result = withInstance(instance, () => fn(mergedProps))
    }

    const normalized = normalizeReturn(result)

    // Tag the resulting node(s) with their owning instance so unmountNode
    // can find and clean them up later.
    if (Array.isArray(normalized)) {
      const owner = document.createTextNode('')
      normalized.push(owner)
      trackInstance(owner, instance)
    } else {
      trackInstance(normalized, instance)
    }

    return normalized
  } catch (error) {
    // Preserve the construction error, while attempting every owned teardown.
    const failures: unknown[] = []
    untrack(() => {
      for (const node of scope) {
        try { unmountNode(node) } catch (cleanupError) { failures.push(cleanupError) }
      }
      try { runInstanceCleanups(instance) } catch (cleanupError) { failures.push(cleanupError) }
    })
    if (failures.length) throw new AggregateError([error, ...failures], 'Component construction and cleanup failed')
    throw error
  } finally {
    constructionScopes.pop()
  }
}

function normalizeReturn(result: any): Node | Node[] {
  if (typeof result === 'function') {
    const fragment = document.createDocumentFragment()
    appendChild(fragment, result)
    return Array.from(fragment.childNodes)
  }
  if (result instanceof DocumentFragment) {
    const nodes = Array.from(result.childNodes)
    return nodes.length ? nodes : document.createTextNode('')
  }
  if (result instanceof Node) return result
  if (Array.isArray(result)) {
    const nodes = result.flat(Infinity)
      .filter(value => value != null && typeof value !== 'boolean')
      .flatMap(value => normalizeReturn(value))
    return nodes.length ? nodes : document.createTextNode('')
  }
  if (typeof result === 'string' || typeof result === 'number') {
    return document.createTextNode(String(result))
  }
  return document.createTextNode('')
}

// ─── Native HTML element ────────────────────────────────────────────────────

function createElement(tag: string, props: Props, children: Child[]): Element {
  const el = props?.__rrjsNamespace === 'svg'
    ? document.createElementNS(SVG_NAMESPACE, tag)
    : document.createElement(tag)
  const afterChildren: Array<() => void> = []

  // ── Props ──
  if (props) {
    for (const key in props) {
      const value = props[key]

      if (key === 'children') continue
      if (key === '__rrjsNamespace') continue

      // `key` is reconciliation metadata, not an attribute. list() reads it from
      // the item via getKey and never from the element, so it has no business in
      // the DOM. React strips it for the same reason. Leaving it in cost one
      // setAttribute per row on every keyed list.
      if (key === 'key') continue

// ref attribute: attach the DOM element to the ref object or callback ref
      if (key === 'ref') {
        if (typeof value === 'function') {
          value(el)
          ownBinding(el, () => value(null))
        } else if (value && typeof value === 'object' && 'current' in value) {
          value.current = el
          ownBinding(el, () => { if (value.current === el) value.current = null })
        }
        continue
      }
      if (key.startsWith('on') && typeof value === 'function') {
        const inputType = tag === 'input' && typeof props.type === 'string' ? props.type.toLowerCase() : ''
        const textChange = key === 'onChange' && (tag === 'textarea'
          || (tag === 'input' && inputType !== 'checkbox' && inputType !== 'radio' && inputType !== 'file'))
        const eventName = key === 'onDoubleClick' ? 'dblclick'
          : textChange ? 'input' : key.slice(2).toLowerCase()
        el.addEventListener(eventName, value)
        ownBinding(el, () => el.removeEventListener(eventName, value))
        continue
      }

if (typeof value === 'function') {
  // The binding belongs to the element. Attribute setters avoid redundant
  // writes without allocating an unowned intermediate computed subscription.
  const bind = () => ownBinding(el, effect(() => {
      let resolved = value()
      while (typeof resolved === 'function') resolved = resolved()
      setAttribute(el, key, resolved)
    }))
  if (tag === 'select' && key === 'value') afterChildren.push(bind)
  else bind()
  continue
}

      if (tag === 'select' && key === 'value') afterChildren.push(() => setAttribute(el, key, value))
      else setAttribute(el, key, value)
    }
  }

  // ── Children ──
  for (const child of children) {
    appendChild(el, child)
  }
  for (const apply of afterChildren) apply()

  return el
}

// ─── Append a child ─────────────────────────────────────────────────────────

function appendChild(parent: Node, child: Child): void {
  if (child === null || child === undefined || child === false || child === true) {
    return
  }

  if (Array.isArray(child)) {
    for (const c of child) appendChild(parent, c as Child)
    return
  }

  if (typeof child === 'string' || typeof child === 'number') {
    parent.appendChild(document.createTextNode(String(child)))
    return
  }

if (typeof child === 'function') {
  // Keep a stable insertion point even when this region becomes empty.
  const anchor = document.createTextNode('')
  parent.appendChild(anchor)
  let current: Node[] = []

  ownBinding(anchor, effect(() => {
    const scope = new Set<Node>()
    const next: Node[] = []
    constructionScopes.push(scope)
    try {
    let value = child()
    while (typeof value === 'function') value = value()

    const collect = (item: Child): void => {
      if (item == null || typeof item === 'boolean') return
      if (Array.isArray(item)) {
        item.forEach(collect)
      } else if (typeof item === 'function') {
        collect(item())
      } else if (item instanceof Node) {
        if (item.nodeType === 11) Array.from(item.childNodes).forEach(collect)
        else next.push(item)
      } else {
        const old = current[next.length]
        const text = String(item)
        const node = old?.nodeType === 3 ? old : document.createTextNode(text)
        if (node.nodeValue !== text) node.nodeValue = text
        next.push(node)
      }
    }
    collect(value)
    } catch (error) {
      try { finishTeardowns([...scope].map(node => () => unmountNode(node))) }
      catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Branch evaluation and cleanup failed') }
      throw error
    } finally { constructionScopes.pop() }

    untrack(() => {
      const retained = new Set(next)
      finishTeardowns([
        ...current.filter(node => !retained.has(node)).map(node => () => unmountNode(node)),
        () => {
          const destination = anchor.parentNode!
          let cursor: Node = anchor
          for (let i = next.length - 1; i >= 0; i--) {
            const node = next[i]
            if (node.nextSibling !== cursor || node.parentNode !== destination) {
              destination.insertBefore(node, cursor)
            }
            cursor = node
          }
          current = next
          try {
            if (mountedNodes.has(destination)) next.forEach(commitNode)
          } catch (error) {
            current = []
            try { finishTeardowns(next.map(node => () => unmountNode(node))) }
            catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Branch commit and cleanup failed') }
            throw error
          }
        },
      ])
    })
  }))
  ownBinding(anchor, () => {
    const nodes = current
    current = []
    finishTeardowns(nodes.map(node => () => unmountNode(node)))
  })
  return
}

  if (child instanceof Node) {
    parent.appendChild(child)
    return
  }
}

// ─── Set an attribute ───────────────────────────────────────────────────────

function setAttribute(el: Element, key: string, value: any): void {
  if (key === 'defaultValue' && 'defaultValue' in el) {
    ;(el as HTMLInputElement | HTMLTextAreaElement).defaultValue = value == null ? '' : String(value)
    return
  }
  // Attributes describe initial form state; properties hold the live state
  // after user interaction. Controlled bindings must update the latter.
  if (key === 'value' && 'value' in el) {
    const control = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    const next = value == null ? '' : String(value)
    if (control.value !== next) control.value = next
  }
  if (key === 'checked' && 'checked' in el) {
    ;(el as HTMLInputElement).checked = Boolean(value)
  }
  if (key === 'disabled' && 'disabled' in el) {
    ;(el as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = Boolean(value)
    return
  }
  if (key === 'xlinkHref') {
    if (value === null || value === undefined || value === false) el.removeAttributeNS(XLINK_NAMESPACE, 'href')
    else if (el.getAttributeNS(XLINK_NAMESPACE, 'href') !== String(value)) el.setAttributeNS(XLINK_NAMESPACE, 'xlink:href', String(value))
    return
  }
  // Normalize incoming value to its final string-or-removed form
  const isEmpty = value === null || value === undefined || value === false

  if (isEmpty) {
    if (el.hasAttribute(key) || (key === 'className' || key === 'class')) {
      // Only call removeAttribute / reset className if it isn't already empty
      if (key === 'className' || key === 'class') {
        if (el.namespaceURI === SVG_NAMESPACE) el.removeAttribute('class')
        else if ((el as HTMLElement).className !== '') (el as HTMLElement).className = ''
      } else {
        el.removeAttribute(key)
      }
    }
    return
  }

  // className — fast path
  if (key === 'className' || key === 'class') {
    const next = String(value)
    if (el.namespaceURI === SVG_NAMESPACE) {
      if (el.getAttribute('class') !== next) el.setAttribute('class', next)
    } else if ((el as HTMLElement).className !== next) (el as HTMLElement).className = next
    return
  }

  // style object — Object.assign keeps it cheap; we don't deep-compare
  if (key === 'style' && typeof value === 'object') {
    Object.assign((el as HTMLElement | SVGElement).style, value)
    return
  }

  // Generic attribute path with bailout
  const attributeName = el.namespaceURI === SVG_NAMESPACE && key === 'strokeWidth' ? 'stroke-width' : key
  const nextStr = String(value)
  if (el.getAttribute(attributeName) !== nextStr) {
    el.setAttribute(attributeName, nextStr)
  }
}
type ListOperation =
  | { kind: 'append'; previous: unknown[]; appended: unknown[]; supersedes?: unknown[] }
  | { kind: 'prepend'; previous: unknown[]; prepended: unknown[] }
  | { kind: 'clear'; previous: unknown[] }
  | { kind: 'truncate'; previous: unknown[]; length: number }
  | { kind: 'splice'; previous: unknown[]; start: number; deleteCount: number; inserted: unknown[] }
  | { kind: 'reverse'; previous: unknown[] }
  | { kind: 'filter'; previous: unknown[]; retained: number[] }
  | { kind: 'sort'; previous: unknown[]; permutation: number[] }
  | { kind: 'map'; previous: unknown[]; mapped: unknown[] }
  | { kind: 'move'; previous: unknown[]; from: number; to: number }
const listOperations = new WeakMap<unknown[], ListOperation>()
const latestAppendByPrevious = new WeakMap<unknown[], unknown[]>()

/** Preserve a compiler-visible append as an explicit operation on an ordinary array. */
export function listAppend<T>(previous: T[], ...appended: T[]): T[] {
  const next = [...previous, ...appended]
  const supersedes = latestAppendByPrevious.get(previous)
  listOperations.set(next, { kind: 'append', previous, appended, supersedes })
  latestAppendByPrevious.set(previous, next)
  return next
}

/** Preserve a compiler-visible prepend as an explicit operation. */
export function listPrepend<T>(previous: T[], ...prepended: T[]): T[] {
  const next = [...prepended, ...previous]
  listOperations.set(next, { kind: 'prepend', previous, prepended })
  return next
}

/** Preserve a compiler-visible clear as an explicit operation. */
export function listClear<T>(previous: T[]): T[] {
  const next: T[] = []
  listOperations.set(next, { kind: 'clear', previous })
  return next
}

/** Preserve a compiler-visible tail truncation as an explicit operation. */
export function listTruncate<T>(previous: T[], length: number): T[] {
  const bounded = Math.max(0, Math.min(previous.length, length))
  const next = previous.slice(0, bounded)
  listOperations.set(next, { kind: 'truncate', previous, length: bounded })
  return next
}

/** Preserve an immutable splice as an explicit indexed operation. */
export function listSplice<T>(previous: T[], start: number, deleteCount: number, ...inserted: T[]): T[] {
  const integerStart = Number.isNaN(start) || start === -Infinity ? 0
    : start === Infinity ? previous.length : Math.trunc(start)
  const boundedStart = integerStart < 0
    ? Math.max(previous.length + integerStart, 0)
    : Math.min(integerStart, previous.length)
  const integerDelete = Number.isNaN(deleteCount) || deleteCount === -Infinity ? 0
    : deleteCount === Infinity ? previous.length - boundedStart : Math.trunc(deleteCount)
  const boundedDelete = Math.max(0, Math.min(integerDelete, previous.length - boundedStart))
  const next = [...previous]
  next.splice(boundedStart, boundedDelete, ...inserted)
  listOperations.set(next, { kind: 'splice', previous, start: boundedStart, deleteCount: boundedDelete, inserted })
  return next
}

/** Preserve an immutable reverse as an explicit move operation. */
export function listReverse<T>(previous: T[]): T[] {
  const next = [...previous].reverse()
  listOperations.set(next, { kind: 'reverse', previous })
  return next
}

/** Preserve filter provenance as the retained indices from the previous array. */
export function listFilter<T>(previous: T[], predicate: (item: T, index: number, source: T[]) => unknown): T[] {
  const retained: number[] = []
  const next: T[] = []
  for (let index = 0; index < previous.length; index++) {
    if (!(index in previous) || !predicate(previous[index], index, previous)) continue
    retained.push(index)
    next.push(previous[index])
  }
  listOperations.set(next, { kind: 'filter', previous, retained })
  return next
}

/** Preserve sorting as a permutation of previous-array indices. */
export function listSort<T>(previous: T[], comparator?: (left: T, right: T) => number): T[] {
  const defined: number[] = []
  const undefinedValues: number[] = []
  for (let index = 0; index < previous.length; index++) {
    if (previous[index] === undefined) undefinedValues.push(index)
    else defined.push(index)
  }
  defined.sort((left, right) => {
    const leftValue = previous[left] as T
    const rightValue = previous[right] as T
    if (comparator) return comparator(leftValue, rightValue)
    const leftString = String(leftValue)
    const rightString = String(rightValue)
    return leftString < rightString ? -1 : leftString > rightString ? 1 : 0
  })
  const permutation = [...defined, ...undefinedValues]
  const next = permutation.map(index => previous[index])
  listOperations.set(next, { kind: 'sort', previous, permutation })
  return next
}

/** Preserve a positional value update as a direct map operation. */
export function listMap<T, U>(previous: T[], mapper: (item: T, index: number, source: T[]) => U): U[] {
  const mapped = previous.map(mapper)
  listOperations.set(mapped, { kind: 'map', previous, mapped })
  return mapped
}

/** Preserve one copied-array remove/insert pair as an indexed move. */
export function listMove<T>(previous: T[], from: number, to: number): T[] {
  const boundedFrom = Math.max(0, Math.min(Math.trunc(from), previous.length - 1))
  const boundedTo = Math.max(0, Math.min(Math.trunc(to), previous.length - 1))
  const next = [...previous]
  if (next.length) {
    const [moved] = next.splice(boundedFrom, 1)
    next.splice(boundedTo, 0, moved)
  }
  listOperations.set(next, { kind: 'move', previous, from: boundedFrom, to: boundedTo })
  return next
}

/**
 * A list region driven only by compiler-recorded operations. It never derives
 * identity by comparing old and new arrays or keys.
 */
export function operationList<T>(getItems: () => T[], render: (item: T, index: () => number) => Node): Node {
  const anchor = document.createComment('operations')
  const wrapper = document.createDocumentFragment()
  wrapper.appendChild(anchor)
  let current: T[] | undefined
  let nodes: Node[] = []
  let setIndices: Array<(index: number) => void> = []
  let setItems: Array<(item: unknown) => void> = []

  const createRow = (item: T, index: number): [Node, (index: number) => void, (item: unknown) => void] => {
    const [readIndex, setIndex] = createSignal(index)
    const [readItem, setItem] = createSignal<unknown>(item)
    const view = makeItemView(item, readItem) as T
    return [untrack(() => render(view, readIndex)), setIndex, setItem]
  }

  const moveRows = (parent: Node): void => {
    const active = document.activeElement instanceof HTMLElement
      && nodes.some(node => node === document.activeElement || node.contains(document.activeElement))
      ? document.activeElement : null
    const selection = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
      ? [active.selectionStart, active.selectionEnd, active.selectionDirection] as const : null
    for (const node of nodes) parent.insertBefore(node, anchor)
    if (active && document.activeElement !== active) active.focus({ preventScroll: true })
    if (selection && (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)) {
      active.setSelectionRange(selection[0], selection[1], selection[2] ?? undefined)
    }
  }

  ownBinding(anchor, effect(() => {
    const items = getItems()
    const parent = anchor.parentNode ?? wrapper
    if (!current) {
      const fragment = document.createDocumentFragment()
      const created: Node[] = []
      try {
        for (let index = 0; index < items.length; index++) {
          const [node, setIndex, setItem] = createRow(items[index], index)
          created.push(node)
          setIndices.push(setIndex)
          setItems.push(setItem)
          fragment.appendChild(node)
        }
        parent.insertBefore(fragment, anchor)
        nodes = created
        current = items
        if (mountedNodes.has(parent)) created.forEach(commitNode)
      } catch (error) {
        finishTeardowns(created.map(node => () => unmountNode(node)))
        throw error
      }
      return
    }

    const operation = listOperations.get(items)
    if (operation?.kind === 'append' && operation.previous !== current && operation.supersedes === current) {
      const currentOperation = listOperations.get(current)
      if (currentOperation?.kind === 'append' && currentOperation.previous === operation.previous) {
        const removed = nodes.splice(nodes.length - currentOperation.appended.length)
        setIndices.splice(setIndices.length - currentOperation.appended.length)
        setItems.splice(setItems.length - currentOperation.appended.length)
        current = currentOperation.previous as T[]
        untrack(() => finishTeardowns(removed.map(node => () => unmountNode(node))))
      }
    }
    if (!operation || operation.previous !== current) {
      throw new Error('operationList: update has no direct operation provenance')
    }
    emitRuntimeEvent('list-operation', operation)
    if (operation.kind === 'clear') {
      const removed = nodes
      nodes = []
      setIndices = []
      setItems = []
      current = items
      untrack(() => finishTeardowns(removed.map(node => () => unmountNode(node))))
      return
    }
    if (operation.kind === 'truncate') {
      const removed = nodes.splice(operation.length)
      setIndices.splice(operation.length)
      setItems.splice(operation.length)
      current = items
      untrack(() => finishTeardowns(removed.map(node => () => unmountNode(node))))
      return
    }
    if (operation.kind === 'prepend') {
      const fragment = document.createDocumentFragment()
      const created: Node[] = []
      const createdIndices: Array<(index: number) => void> = []
      const createdItems: Array<(item: unknown) => void> = []
      try {
        for (let index = 0; index < operation.prepended.length; index++) {
          const [node, setIndex, setItem] = createRow(operation.prepended[index] as T, index)
          created.push(node)
          createdIndices.push(setIndex)
          createdItems.push(setItem)
          fragment.appendChild(node)
        }
        parent.insertBefore(fragment, nodes[0] ?? anchor)
        for (let index = 0; index < setIndices.length; index++) {
          setIndices[index](index + created.length)
        }
        nodes.unshift(...created)
        setIndices.unshift(...createdIndices)
        setItems.unshift(...createdItems)
        current = items
        if (mountedNodes.has(parent)) created.forEach(commitNode)
      } catch (error) {
        finishTeardowns(created.map(node => () => unmountNode(node)))
        throw error
      }
      return
    }
    if (operation.kind === 'splice') {
      const removed = nodes.slice(operation.start, operation.start + operation.deleteCount)
      const reference = nodes[operation.start + operation.deleteCount] ?? anchor
      const fragment = document.createDocumentFragment()
      const created: Node[] = []
      const createdIndices: Array<(index: number) => void> = []
      const createdItems: Array<(item: unknown) => void> = []
      try {
        for (let offset = 0; offset < operation.inserted.length; offset++) {
          const [node, setIndex, setItem] = createRow(operation.inserted[offset] as T, operation.start + offset)
          created.push(node)
          createdIndices.push(setIndex)
          createdItems.push(setItem)
          fragment.appendChild(node)
        }
        untrack(() => finishTeardowns(removed.map(node => () => unmountNode(node))))
        parent.insertBefore(fragment, reference)
        nodes.splice(operation.start, operation.deleteCount, ...created)
        setIndices.splice(operation.start, operation.deleteCount, ...createdIndices)
        setItems.splice(operation.start, operation.deleteCount, ...createdItems)
        for (let index = operation.start + created.length; index < setIndices.length; index++) setIndices[index](index)
        current = items
        if (mountedNodes.has(parent)) created.forEach(commitNode)
      } catch (error) {
        finishTeardowns(created.map(node => () => unmountNode(node)))
        throw error
      }
      return
    }
    if (operation.kind === 'reverse') {
      nodes.reverse()
      setIndices.reverse()
      setItems.reverse()
      moveRows(parent)
      for (let index = 0; index < setIndices.length; index++) setIndices[index](index)
      current = items
      return
    }
    if (operation.kind === 'filter') {
      const retained = new Set(operation.retained)
      const removed = nodes.filter((_node, index) => !retained.has(index))
      const nextNodes = operation.retained.map(index => nodes[index])
      const nextIndices = operation.retained.map(index => setIndices[index])
      const nextItems = operation.retained.map(index => setItems[index])
      untrack(() => finishTeardowns(removed.map(node => () => unmountNode(node))))
      nodes = nextNodes
      setIndices = nextIndices
      setItems = nextItems
      for (let index = 0; index < setIndices.length; index++) setIndices[index](index)
      current = items
      return
    }
    if (operation.kind === 'sort') {
      nodes = operation.permutation.map(index => nodes[index])
      setIndices = operation.permutation.map(index => setIndices[index])
      setItems = operation.permutation.map(index => setItems[index])
      moveRows(parent)
      for (let index = 0; index < setIndices.length; index++) setIndices[index](index)
      current = items
      return
    }
    if (operation.kind === 'map') {
      if (operation.mapped.length !== nodes.length) throw new Error('operationList: map changed list length')
      for (let index = 0; index < setItems.length; index++) setItems[index](operation.mapped[index])
      current = items
      return
    }
    if (operation.kind === 'move') {
      if (nodes.length) {
        const [node] = nodes.splice(operation.from, 1)
        const [setIndex] = setIndices.splice(operation.from, 1)
        const [setItem] = setItems.splice(operation.from, 1)
        nodes.splice(operation.to, 0, node)
        setIndices.splice(operation.to, 0, setIndex)
        setItems.splice(operation.to, 0, setItem)
        moveRows(parent)
        for (let index = Math.min(operation.from, operation.to); index < setIndices.length; index++) setIndices[index](index)
      }
      current = items
      return
    }
    const fragment = document.createDocumentFragment()
    const created: Node[] = []
    const createdIndices: Array<(index: number) => void> = []
    const createdItems: Array<(item: unknown) => void> = []
    try {
      for (let offset = 0; offset < operation.appended.length; offset++) {
        const [node, setIndex, setItem] = createRow(operation.appended[offset] as T, nodes.length + offset)
        created.push(node)
        createdIndices.push(setIndex)
        createdItems.push(setItem)
        fragment.appendChild(node)
      }
      parent.insertBefore(fragment, anchor)
      nodes.push(...created)
      setIndices.push(...createdIndices)
      setItems.push(...createdItems)
      current = items
      if (mountedNodes.has(parent)) created.forEach(commitNode)
    } catch (error) {
      finishTeardowns(created.map(node => () => unmountNode(node)))
      throw error
    }
  }))
  ownBinding(anchor, () => {
    const owned = nodes
    nodes = []
    setIndices = []
    setItems = []
    current = undefined
    finishTeardowns(owned.map(node => () => unmountNode(node)))
  })
  return wrapper
}

// ─── Keyed list reconciliation ──────────────────────────────────────────────
//
// list(getItems, getKey, render) is the renderer's primitive for arrays.
// The Babel plugin will compile {items.map(...)} into a list() call.
//
// On each signal update, we receive a fresh array. We diff it against the
// previous one by key, reusing DOM nodes for matched keys and only creating
// new ones for new keys. Removed keys produce removed nodes.

// ─── Keyed list reconciliation ──────────────────────────────────────────────
// ─── Keyed list reconciliation ──────────────────────────────────────────────
//
// list(getItems, getKey, render) is the renderer's primitive for arrays.
// The Babel plugin compiles {items.map(...)} into a list() call.
//
// On each signal update, we receive a fresh array. We diff it against the
// previous one by key, reusing DOM nodes for matched keys and only creating
// new ones for new keys. Removed keys produce removed nodes.

interface ListEntry {
  key: unknown
  node: Node
  item: unknown
  /** Publishes a new item to every binding render() created for this row. */
  setItem: (next: unknown) => void
  /** What render() was actually handed — a live view onto `item`. */
  view: unknown
}

// ─── Reactive item views ────────────────────────────────────────────────────
//
// A key identifies *which* item, not what the item contains. Content changing
// under a stable key is the normal case, so a reused node has to reflect the new
// item. Re-rendering into a fresh node would fix the content but destroy node
// identity — focus, scroll position, uncontrolled input state, in-flight CSS
// transitions — and would cost the LIS reconciliation its whole point.
//
// Instead each row owns a signal holding its current item, and render() is
// handed a proxy that reads through that signal. Every binding the row created
// therefore subscribes to it, and publishing a new item re-runs exactly those
// bindings and nothing else. The node itself is never touched.
//
// The swap case stays free: swapping moves the *same* item objects, so the
// signal is set to the value it already holds and Object.is bailout means no
// binding re-runs at all.

function makeItemView(item: unknown, read: () => unknown): unknown {
  // Primitives can't be proxied. In practice a primitive item is keyed by its
  // own value, so changing it changes the key and produces a fresh node anyway.
  if (item === null || (typeof item !== 'object' && typeof item !== 'function')) {
    return item
  }
  // The target is a bare object, not `item`: proxy invariants forbid reporting a
  // different value for a non-configurable own property of the target, and real
  // item objects have exactly those.
  return new Proxy({} as Record<PropertyKey, unknown>, {
    get: (_t, prop, receiver) => Reflect.get(read() as object, prop, receiver),
    set: (_t, prop, value) => Reflect.set(read() as object, prop, value),
    has: (_t, prop) => Reflect.has(read() as object, prop),
    deleteProperty: (_t, prop) => Reflect.deleteProperty(read() as object, prop),
    ownKeys: () => Reflect.ownKeys(read() as object),
    getPrototypeOf: () => Reflect.getPrototypeOf(read() as object),
    getOwnPropertyDescriptor: (_t, prop) => {
      const d = Reflect.getOwnPropertyDescriptor(read() as object, prop)
      return d === undefined ? undefined : { ...d, configurable: true }
    },
  })
}

export function list<T>(
  getItems: () => T[],
  getKey: (item: T, index: number) => unknown,
  render: (item: T, index: number) => Node
): Node {
  const anchor = document.createComment('list')
  emitRuntimeEvent('reconciler-enter', anchor)
  const wrapper = document.createDocumentFragment()
  wrapper.appendChild(anchor)

  let entries: ListEntry[] = []

  // Build a row. render() runs untracked: the reads it performs belong to the
  // row's own bindings, not to the list effect. Without this, creating a row
  // would subscribe the list to that row's item signal, and updating one row
  // would re-reconcile every row.
  function createEntry(item: T, index: number, key: unknown): ListEntry {
    const [readItem, setItem] = createSignal<unknown>(item)
    const view = makeItemView(item, readItem) as T
    const node = untrack(() => render(view, index))
    return { key, node, item, setItem, view }
  }

  ownBinding(anchor, effect(() => {
    const items = getItems()
    const parent = anchor.parentNode ?? wrapper

    // ── Fast path: clear all ──
    // Going from a populated list to an empty one is the #1 cost outlier in
    // benchmarks (clear test was 67ms script). Removing 1000 children one at
    // a time triggers 1000 layout invalidations. Range.deleteContents() does
    // it in a single browser operation.
    if (items.length === 0) {
      for (const entry of entries) untrack(() => unmountNode(entry.node))
      entries = []
      return
    }

    // ── First render: bulk append via DocumentFragment ──
    // Building 1000 nodes one-by-one with parent.insertBefore triggers
    // 1000 insertions. A DocumentFragment defers insertion: append all
    // nodes to the fragment in memory, then insert the fragment into the
    // parent in a single browser operation.
    if (entries.length === 0) {
      const newEntries: ListEntry[] = []
      const fragment = document.createDocumentFragment()
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const key = getKey(item, i)
        const entry = createEntry(item, i, key)
        newEntries.push(entry)
        fragment.appendChild(entry.node)
      }
      parent.insertBefore(fragment, anchor)
      entries = newEntries
      if (mountedNodes.has(parent)) newEntries.forEach(entry => commitNode(entry.node))
      return
    }

    // ── Fast path: pure append ──
    // Real-world pattern for "load more" buttons and infinite scroll.
    // The benchmark 08_create1k-after1k hits this case. Detect by checking
    // that the first oldEntries.length items have unchanged keys and the
    // new array is longer; then skip reconciliation entirely.
    if (items.length > entries.length) {
      let isPureAppend = true
      for (let i = 0; i < entries.length; i++) {
        if (getKey(items[i], i) !== entries[i].key) {
          isPureAppend = false
          break
        }
      }

      if (isPureAppend) {
        const newEntries: ListEntry[] = entries.slice()
        for (let i = 0; i < entries.length; i++) {
          entries[i].item = items[i]
          entries[i].setItem(items[i])
        }
        const fragment = document.createDocumentFragment()
        for (let i = entries.length; i < items.length; i++) {
          const item = items[i]
          const key = getKey(item, i)
          const entry = createEntry(item, i, key)
          newEntries.push(entry)
          fragment.appendChild(entry.node)
        }
        parent.insertBefore(fragment, anchor)
        entries = newEntries
        if (mountedNodes.has(parent)) newEntries.forEach(entry => commitNode(entry.node))
        return
      }
    }

    // ── Subsequent render: reconcile by key ──
    const oldEntries = entries
    const oldByKey = new Map<unknown, ListEntry>()
    const oldIndexByKey = new Map<unknown, number>()
    for (let i = 0; i < oldEntries.length; i++) {
      oldByKey.set(oldEntries[i].key, oldEntries[i])
      oldIndexByKey.set(oldEntries[i].key, i)
    }

    const newEntries: ListEntry[] = []
    const usedKeys = new Set<unknown>()
    // For each new entry: its old index, or -1 if new.
    const newToOldIndex: number[] = new Array(items.length)

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const key = getKey(item, i)
      const existing = oldByKey.get(key)

      if (existing) {
        // Same key, possibly different content. Keep the node, republish the
        // item. Object.is bailout makes this free when the item is unchanged,
        // which is why a pure reorder (swap) costs nothing here.
        existing.item = item
        existing.setItem(item)
        newEntries.push(existing)
        usedKeys.add(key)
        newToOldIndex[i] = oldIndexByKey.get(key)!
      } else {
        newEntries.push(createEntry(item, i, key))
        newToOldIndex[i] = -1
      }
    }

    // Remove dead keys.
    for (const entry of oldEntries) {
      if (!usedKeys.has(entry.key)) {
        untrack(() => unmountNode(entry.node))
      }
    }

    // Find the longest increasing subsequence of old indices.
    // Nodes at these positions are already in the correct relative order
    // and don't need to move.
    const lisIndices = longestIncreasingSubsequence(newToOldIndex)
    const inLis = new Set(lisIndices)

    // Walk in REVERSE so we always insertBefore a stable cursor.
    // Skip nodes that are in the LIS (already in correct position).
    let cursor: Node = anchor
    for (let i = newEntries.length - 1; i >= 0; i--) {
      const entry = newEntries[i]
      const oldIdx = newToOldIndex[i]
      if (oldIdx === -1 || !inLis.has(i)) {
        // New node, or node that moved — needs insertBefore.
        parent.insertBefore(entry.node, cursor)
      }
      // Otherwise, the node is already where it should be relative to cursor.
      cursor = entry.node
    }

    entries = newEntries
    if (mountedNodes.has(parent)) newEntries.forEach(entry => commitNode(entry.node))
  }))

  return wrapper
}

// ─── Longest Increasing Subsequence ─────────────────────────────────────────
// Returns the indices (into `arr`) of a longest strictly-increasing
// subsequence. Entries equal to -1 are treated as "not part of any
// sequence" and are excluded. O(n log n).

function longestIncreasingSubsequence(arr: number[]): number[] {
  const n = arr.length
  if (n === 0) return []

  // piles[k] = index into `arr` of the smallest tail of any
  // increasing subsequence of length k+1 found so far.
  const piles: number[] = []
  // predecessors[i] = index in `arr` of the element preceding arr[i]
  // in the LIS ending at i.
  const predecessors = new Array<number>(n).fill(-1)

  for (let i = 0; i < n; i++) {
    if (arr[i] === -1) continue
    const x = arr[i]

    // Binary-search for the first pile whose top is >= x.
    let lo = 0
    let hi = piles.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (arr[piles[mid]] < x) lo = mid + 1
      else hi = mid
    }

    if (lo > 0) predecessors[i] = piles[lo - 1]
    if (lo === piles.length) piles.push(i)
    else piles[lo] = i
  }

  // Reconstruct from the last pile's tail.
  const result: number[] = []
  let cur = piles[piles.length - 1]
  while (cur !== undefined && cur !== -1) {
    result.push(cur)
    cur = predecessors[cur]
  }
  return result.reverse()
}
// ─── Provider wrapping ──────────────────────────────────────────────────────
// The renderer needs to recognize when a component IS a Context.Provider,
// push the value, mount children, and pop. We tag Provider functions
// during createContext so we can detect them here.
//
// This isn't fully wired yet — Provider integration with the context stack
// requires identifying provider components by reference. We handle that in
// the next iteration. For now, useContext reads from manually-pushed values
// (which is how the unit tests verify behavior) and we'll add automatic
// renderer integration when we touch Provider rendering end-to-end.

// ─── mount() — entry point ──────────────────────────────────────────────────

export function mount(component: () => any, container: HTMLElement): () => void {
  const result = mountComponent(component, null, [])
  const dispose = () => finishTeardowns((Array.isArray(result) ? result : [result]).map(node => () => unmountNode(node)))
  try {
    if (Array.isArray(result)) {
      for (const node of result) container.appendChild(node)
    } else {
      container.appendChild(result)
    }
    commitNode(container)
  } catch (error) {
    try { dispose() } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Mount commit and cleanup failed')
    }
    throw error
  }
  return dispose
}
