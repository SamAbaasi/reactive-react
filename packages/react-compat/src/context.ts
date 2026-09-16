export interface Context<T> {
  _id: symbol
  _defaultValue: T
  Provider: (props: { value: T; children: any }) => any
}

type ProviderMarker<T> = Context<T>['Provider'] & {
  _isProvider: true
  _context: Context<T>
}

const contextStacks = new Map<symbol, unknown[]>()
export type ContextSnapshot = Map<symbol, unknown[]>

export function createContext<T>(defaultValue: T): Context<T> {
  const id = Symbol('Context')
  const Provider = (props: { value: T; children: any }) => props.children
  const context: Context<T> = { _id: id, _defaultValue: defaultValue, Provider }
  const marked = Provider as ProviderMarker<T>
  marked._isProvider = true
  marked._context = context
  return context
}

export function pushContext(id: symbol, value: unknown): void {
  let stack = contextStacks.get(id)
  if (!stack) {
    stack = []
    contextStacks.set(id, stack)
  }
  stack.push(value)
}

export function popContext(id: symbol): void {
  const stack = contextStacks.get(id)
  if (stack?.length) stack.pop()
}

export function readContext<T>(context: Context<T>): T {
  const stack = contextStacks.get(context._id)
  return stack?.length ? stack[stack.length - 1] as T : context._defaultValue
}

export function withProvider<T, R>(context: Context<T>, value: T, fn: () => R): R {
  pushContext(context._id, value)
  try {
    return fn()
  } finally {
    popContext(context._id)
  }
}

export function captureContext(): ContextSnapshot {
  return new Map([...contextStacks].map(([id, stack]) => [id, [...stack]]))
}

export function withContextSnapshot<T>(snapshot: ContextSnapshot, fn: () => T): T {
  const previous = captureContext()
  contextStacks.clear()
  for (const [id, stack] of snapshot) contextStacks.set(id, [...stack])
  try {
    return fn()
  } finally {
    contextStacks.clear()
    for (const [id, stack] of previous) contextStacks.set(id, stack)
  }
}
