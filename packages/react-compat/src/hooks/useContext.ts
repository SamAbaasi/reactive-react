import { readContext, Context } from '../context'

// useContext does NOT need a hook slot.
// It just reads the current value from the global stack for this context.
// No state to persist between renders — the stack handles it.
//
// Note: this means useContext is the only React-shim hook that doesn't
// allocate a hookIndex slot. We deliberately do NOT call instance.hookIndex++
// because we want the hook to be callable conditionally without breaking
// positional ordering for other hooks. React works the same way: useContext
// doesn't store anything on the Fiber.

export function useContext<T>(context: Context<T>): T {
  return readContext(context)
}