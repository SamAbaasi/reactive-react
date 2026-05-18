import { effect, computed } from '@reactive-react/signals'
import {
  createInstance,
  withInstance,
  flushLayoutEffects,
  flushPassiveEffects,
  pushContext,
  popContext,
  type Context,
  isForwardRef,
    type ComponentInstance,
} from '@reactive-react/react-compat'

// ─── Instance tracking ──────────────────────────────────────────────────────
// We need to track which component instance produced each DOM node so we can
// run that instance's cleanups when the node is removed.
// WeakMap so removed nodes get garbage collected with their instances.

const instanceByNode = new WeakMap<Node, ComponentInstance>()
// ─── Types ──────────────────────────────────────────────────────────────────

type Child = string | number | null | undefined | boolean | (() => any) | Node | any[]
type Props = Record<string, any> | null

type ComponentFn = (props: any) => any

// ─── h() — hyperscript, now component-aware ─────────────────────────────────

export function h(
  tag: string | ComponentFn | { _id: symbol; _isProvider?: true; _context?: any },
  props: Props = null,
  ...children: Child[]
): Node | Node[] {
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

export function unmountNode(node: Node): void {
  // Unmount any children first (post-order traversal)
  const children = Array.from(node.childNodes)
  for (const child of children) {
    unmountNode(child)
  }

  // If this node belongs to a component instance, run its cleanups
  const instance = instanceByNode.get(node)
  if (instance) {
    runInstanceCleanups(instance)
    instanceByNode.delete(node)
  }

  // Detach from DOM
  if (node.parentNode) {
    node.parentNode.removeChild(node)
  }
}

function runInstanceCleanups(instance: ComponentInstance): void {
  // Walk every hook slot. Hooks that scheduled effects stored their cleanup
  // on themselves (e.g. useEffect's UseEffectHook has `cleanup`).
  // Call any cleanup found, in reverse order so layout effects clean up
  // after passive effects, matching the order React uses.
  for (let i = instance.hooks.length - 1; i >= 0; i--) {
    const hook = instance.hooks[i]
    if (hook && typeof hook.cleanup === 'function') {
      hook.cleanup()
      hook.cleanup = null   // prevent double-fire on a second dispose()
    }
  }

  // Hook-level cleanups (useSyncExternalStore pushed an unsubscribe here)
  for (const fn of instance.cleanup) {
    fn()
  }
  instance.cleanup = []
}

// ─── Mount a component function ─────────────────────────────────────────────

function mountComponent(
  fn: ComponentFn | any,
  props: Props,
  children: Child[]
): Node | Node[] {
  const instance = createInstance()
  const mergedProps = { ...(props ?? {}), children }

  let result: any
  if (isForwardRef(fn)) {
    const { ref, ...rest } = mergedProps as any
    result = withInstance(instance, () => fn._render(rest, ref ?? null))
  } else {
    result = withInstance(instance, () => fn(mergedProps))
  }

  flushLayoutEffects(instance)
  flushPassiveEffects(instance)

  const normalized = normalizeReturn(result)

  // Tag the resulting node(s) with their owning instance so unmountNode
  // can find and clean them up later.
  if (Array.isArray(normalized)) {
    for (const node of normalized) instanceByNode.set(node, instance)
  } else {
    instanceByNode.set(normalized, instance)
  }

  return normalized
}

function normalizeReturn(result: any): Node | Node[] {
  if (result instanceof Node) return result
  if (Array.isArray(result)) {
    return result.flat(Infinity).filter(Boolean) as Node[]
  }
  if (typeof result === 'string' || typeof result === 'number') {
    return document.createTextNode(String(result))
  }
  return document.createTextNode('')
}

// ─── Native HTML element ────────────────────────────────────────────────────

function createElement(tag: string, props: Props, children: Child[]): HTMLElement {
  const el = document.createElement(tag)

  // ── Props ──
  if (props) {
    for (const key in props) {
      const value = props[key]

      if (key === 'children') continue
// ref attribute: attach the DOM element to the ref object or callback ref
      if (key === 'ref') {
        if (typeof value === 'function') {
          value(el)
        } else if (value && typeof value === 'object' && 'current' in value) {
          value.current = el
        }
        continue
      }
      if (key.startsWith('on') && typeof value === 'function') {
        const eventName = key.slice(2).toLowerCase()
        el.addEventListener(eventName, value)
        continue
      }

if (typeof value === 'function') {
  // Wrap the thunk in a computed so its same-value bailout prevents
  // downstream DOM writes when the resolved value didn't change.
  // This is what makes per-row updates cheap when 999/1000 rows
  // would otherwise re-run identical no-op writes.
  const cached = computed(() => {
    let resolved = value()
    while (typeof resolved === 'function') resolved = resolved()
    return resolved
  })
  effect(() => {
    setAttribute(el, key, cached())
  })
  continue
}

      setAttribute(el, key, value)
    }
  }

  // ── Children ──
  for (const child of children) {
    appendChild(el, child)
  }

  return el
}

// ─── Append a child ─────────────────────────────────────────────────────────

function appendChild(parent: HTMLElement, child: Child): void {
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
  const textNode = document.createTextNode('')
  parent.appendChild(textNode)

  const cached = computed(() => {
    let value = child()
    while (typeof value === 'function') value = value()
    return value
  })

  effect(() => {
    const value = cached()

    if (value instanceof Node) {
      if (textNode.parentNode === parent) {
        parent.replaceChild(value, textNode)
      } else {
        parent.appendChild(value)
      }
      return
    }

    const next =
      value === null || value === undefined || value === false || value === true
        ? ''
        : String(value)

    if (textNode.nodeValue !== next) {
      textNode.nodeValue = next
    }
  })
  return
}

  if (child instanceof Node) {
    parent.appendChild(child)
    return
  }
}

// ─── Set an attribute ───────────────────────────────────────────────────────

function setAttribute(el: HTMLElement, key: string, value: any): void {
  // Normalize incoming value to its final string-or-removed form
  const isEmpty = value === null || value === undefined || value === false

  if (isEmpty) {
    if (el.hasAttribute(key) || (key === 'className' || key === 'class')) {
      // Only call removeAttribute / reset className if it isn't already empty
      if (key === 'className' || key === 'class') {
        if (el.className !== '') el.className = ''
      } else {
        el.removeAttribute(key)
      }
    }
    return
  }

  // className — fast path
  if (key === 'className' || key === 'class') {
    const next = String(value)
    if (el.className !== next) {
      el.className = next
    }
    return
  }

  // style object — Object.assign keeps it cheap; we don't deep-compare
  if (key === 'style' && typeof value === 'object') {
    Object.assign(el.style, value)
    return
  }

  // Generic attribute path with bailout
  const nextStr = String(value)
  if (el.getAttribute(key) !== nextStr) {
    el.setAttribute(key, nextStr)
  }
}
// ─── Keyed list reconciliation ──────────────────────────────────────────────
//
// list(getItems, getKey, render) is the renderer's primitive for arrays.
// The Babel plugin will compile {items.map(...)} into a list() call.
//
// On each signal update, we receive a fresh array. We diff it against the
// previous one by key, reusing DOM nodes for matched keys and only creating
// new ones for new keys. Removed keys produce removed nodes.

interface ListEntry {
  key: unknown
  node: Node
  item: unknown
}

export function list<T>(
  getItems: () => T[],
  getKey: (item: T, index: number) => unknown,
  render: (item: T, index: number) => Node
): Node {
  // The list is mounted into a stable anchor — a fragment-like wrapper.
  // We use a comment node as a stable insertion anchor so the list
  // can be appended anywhere a single child is expected.
  const anchor = document.createComment('list')

  // A wrapper that holds the rendered children. The renderer's caller
  // appends this wrapper as a single child via appendChild.
  const wrapper = document.createDocumentFragment()
  wrapper.appendChild(anchor)

  let entries: ListEntry[] = []

  effect(() => {
    const items = getItems()
    const parent = anchor.parentNode

    // First render — just append everything.
    if (entries.length === 0 && items.length > 0) {
      const newEntries: ListEntry[] = []
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const key = getKey(item, i)
        const node = render(item, i)
        newEntries.push({ key, node, item })
        if (parent) {
          parent.insertBefore(node, anchor)
        } else {
          wrapper.insertBefore(node, anchor)
        }
      }
      entries = newEntries
      return
    }

    // Subsequent render — reconcile.
    const oldEntries = entries
    const oldByKey = new Map<unknown, ListEntry>()
    for (const entry of oldEntries) {
      oldByKey.set(entry.key, entry)
    }

    const newEntries: ListEntry[] = []
    const usedKeys = new Set<unknown>()

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const key = getKey(item, i)
      const existing = oldByKey.get(key)

      if (existing) {
        // Reuse the existing DOM node — possibly moved to a new position.
        newEntries.push({ key, node: existing.node, item })
        usedKeys.add(key)
      } else {
        // New key — create a fresh node.
        const node = render(item, i)
        newEntries.push({ key, node, item })
      }
    }

    // Remove DOM nodes for keys that disappeared.
    for (const entry of oldEntries) {
      if (!usedKeys.has(entry.key)) {
        if (entry.node.parentNode) {
          entry.node.parentNode.removeChild(entry.node)
        }
      }
    }

    // Place each node in its new position, in order, before the anchor.
    // insertBefore on an already-attached node moves it without removing/adding.
    if (parent) {
      for (const entry of newEntries) {
        parent.insertBefore(entry.node, anchor)
      }
    } else {
      for (const entry of newEntries) {
        wrapper.insertBefore(entry.node, anchor)
      }
    }

    entries = newEntries
  })

  return wrapper
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
  if (Array.isArray(result)) {
    for (const node of result) container.appendChild(node)
  } else {
    container.appendChild(result)
  }

  // Return an unmount function — caller can dispose the whole tree
  return () => {
    if (Array.isArray(result)) {
      for (const node of result) unmountNode(node)
    } else {
      unmountNode(result)
    }
  }
}