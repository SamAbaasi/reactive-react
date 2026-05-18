import { getCurrentInstance, EffectEntry } from '../instance'

// ─── useTransition ───────────────────────────────────────────────────────────
// In React, useTransition marks a state update as lower-priority. The renderer
// can keep showing the previous UI while the transition completes, and isPending
// reflects whether the transition is in flight.
//
// Our renderer has no priority system (no Lanes, no Scheduler with concurrent
// rendering). Updates are synchronous. So:
//   - startTransition runs its callback synchronously
//   - isPending is always a getter returning false
//
// This means apps that depend on useTransition for visual loading indicators
// will see no spinner — but they will work correctly otherwise.

type StartTransition = (fn: () => void) => void

export function useTransition(): [() => boolean, StartTransition] {
  const isPending = () => false
  const startTransition: StartTransition = (fn) => {
    fn()
  }
  return [isPending, startTransition]
}

// ─── useDeferredValue ────────────────────────────────────────────────────────
// In React, useDeferredValue returns a "stale" version of a value that updates
// only when the renderer has spare time. Used for typeahead inputs and similar
// patterns where intermediate values can be skipped.
//
// Without concurrent rendering, deferral has no meaning. We return the input
// value unchanged. Apps using useDeferredValue still work — they just get the
// fresh value immediately. No deferral, no batching of intermediate updates.

export function useDeferredValue<T>(value: T): T {
  return value
}

// ─── useInsertionEffect ──────────────────────────────────────────────────────
// React 18 added useInsertionEffect for CSS-in-JS libraries to inject styles
// BEFORE useLayoutEffect runs. The ordering: insertion → layout → passive.
//
// Our renderer doesn't separate insertion from layout. We push insertion
// effects to the same layoutEffects queue, so they fire synchronously before
// paint. CSS-in-JS libraries that use this hook will inject styles slightly
// later than they would in React, but still before paint — which is what
// actually matters for avoiding FOUC.

interface UseInsertionEffectHook {
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

export function useInsertionEffect(fn: EffectFn, deps?: ReadonlyArray<unknown>): void {
  const instance = getCurrentInstance()
  const i = instance.hookIndex++

  const existing = instance.hooks[i] as UseInsertionEffectHook | undefined

  const makeEntry = (hook: UseInsertionEffectHook): EffectEntry => ({
    cleanup: hook.cleanup,
    run: () => {
      const result = fn()
      hook.cleanup = typeof result === 'function' ? result : null
    },
  })

  if (existing === undefined) {
    const hook: UseInsertionEffectHook = { deps, cleanup: null }
    instance.hooks[i] = hook
    instance.layoutEffects.push(makeEntry(hook))
    return
  }

  if (depsChanged(deps, existing.deps)) {
    existing.deps = deps
    instance.layoutEffects.push(makeEntry(existing))
  }
}

// ─── useDebugValue ───────────────────────────────────────────────────────────
// useDebugValue annotates custom hooks for React DevTools. It has no runtime
// behavior — purely a hint to the devtools layer about what to display.
// We have no DevTools integration. The hook is a true no-op.

export function useDebugValue<T>(_value: T, _formatter?: (v: T) => any): void {
  // Intentionally empty
}