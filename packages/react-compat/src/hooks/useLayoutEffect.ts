import { getCurrentInstance, EffectEntry } from '../instance'

interface UseLayoutEffectHook {
  deps: ReadonlyArray<unknown> | undefined
  cleanup: (() => void) | null
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

type EffectCleanup = void | (() => void)
type EffectFn = () => EffectCleanup

// useLayoutEffect runs SYNCHRONOUSLY during the commit phase, BEFORE paint.
// This is the right hook for:
//   - DOM measurement that affects layout (avoiding flicker)
//   - Synchronous DOM mutations the user should not see partially applied
//   - State updates that must complete before the user sees the screen
//
// The cost: it blocks paint. Use useEffect unless you have a specific reason.

export function useLayoutEffect(fn: EffectFn, deps?: ReadonlyArray<unknown>): void {
  const instance = getCurrentInstance()
  const i = instance.hookIndex++

  const existing = instance.hooks[i] as UseLayoutEffectHook | undefined

  if (existing === undefined) {
    instance.hooks[i] = { deps, cleanup: null } as UseLayoutEffectHook
    instance.layoutEffects.push(makeEntry(instance.hooks[i] as UseLayoutEffectHook, fn))
    return
  }

  if (depsChanged(deps, existing.deps)) {
    existing.deps = deps
    instance.layoutEffects.push(makeEntry(existing, fn))
  }
}

function makeEntry(hook: UseLayoutEffectHook, fn: EffectFn): EffectEntry {
  return {
    cleanup: hook.cleanup,
    run: () => {
      const result = fn()
      hook.cleanup = typeof result === 'function' ? result : null
    },
  }
}