// ─── Context — Stack-Based Propagation ──────────────────────────────────────
// Without a VDOM tree to walk, we use mount-time scoping:
//   - When a Provider mounts its children, it pushes its value onto the stack.
//   - useContext reads the current top of the stack for that context.
//   - When children finish mounting, the Provider pops its value.
//
// This works because mounting is synchronous and depth-first — the same property
// React relies on for hook positional ordering.

export interface Context<T> {
  _id: symbol
  _defaultValue: T
  Provider: (props: { value: T; children: any }) => any
}

// One stack per context, keyed by the unique _id symbol
const contextStacks = new Map<symbol, unknown[]>()

export function createContext<T>(defaultValue: T): Context<T> {
  const id = Symbol('Context')

  const Provider = (props: { value: T; children: any }) => {
    pushContext(id, props.value)
    // The renderer will call this and use the returned children.
    // It's responsible for popping after the children finish mounting —
    // we handle that via withProvider() below.
    return props.children
  }

  return {
    _id: id,
    _defaultValue: defaultValue,
    Provider,
  }
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
  if (stack && stack.length > 0) {
    stack.pop()
  }
}

export function readContext<T>(context: Context<T>): T {
  const stack = contextStacks.get(context._id)
  if (stack && stack.length > 0) {
    return stack[stack.length - 1] as T
  }
  return context._defaultValue
}

// Used by tests and the renderer to wrap a function call with a Provider's value.
// Pushes value before fn runs, pops after — even if fn throws.
export function withProvider<T, R>(
  context: Context<T>,
  value: T,
  fn: () => R
): R {
  pushContext(context._id, value)
  try {
    return fn()
  } finally {
    popContext(context._id)
  }
}