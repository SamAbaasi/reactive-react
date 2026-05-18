import { getCurrentInstance } from '../instance'

interface UseCallbackHook<T> {
  fn: T
  deps: ReadonlyArray<unknown> | undefined
}

function depsChanged(
  next: ReadonlyArray<unknown> | undefined,
  prev: ReadonlyArray<unknown> | undefined
): boolean {
  if (next === undefined || prev === undefined) return true
  if (next.length !== prev.length) return true
  for (let i = 0; i < next.length; i++) {
    if (!Object.is(next[i], prev[i])) return true
  }
  return false
}

// useCallback caches a function reference between renders.
// Same dep-array semantics as useMemo, but the cached value IS the function
// rather than the result of calling it.
//
// In a snapshot-based hook model (which ours is, for React compatibility),
// useCallback is what prevents stale references when passing handlers down
// to memoized children — same role it plays in React.

export function useCallback<T extends (...args: any[]) => any>(
  fn: T,
  deps?: ReadonlyArray<unknown>
): T {
  const instance = getCurrentInstance()
  const i = instance.hookIndex++

  const existing = instance.hooks[i] as UseCallbackHook<T> | undefined

  if (existing === undefined) {
    instance.hooks[i] = { fn, deps } as UseCallbackHook<T>
    return fn
  }

  if (depsChanged(deps, existing.deps)) {
    existing.fn = fn
    existing.deps = deps
  }

  return existing.fn
}