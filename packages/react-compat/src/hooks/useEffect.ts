import { getCurrentInstance, EffectEntry, flushPassiveEffects } from '../instance.js'
import { effect } from '@rrjs/signals'

interface UseEffectHook {
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

// useEffect runs AFTER the browser paints — in a new macro task.
// This is critical for things like DOM measurement after layout has settled,
// CSS animations triggered after the element is on screen, and subscriptions
// that should not block first paint.
//
// The actual queueing into MessageChannel happens in instance.ts.
// Here we just register an EffectEntry that the renderer will flush later.

type EffectCleanup = void | (() => void)
type EffectFn = () => EffectCleanup

export function useEffect(fn: EffectFn, deps?: ReadonlyArray<unknown> | (() => ReadonlyArray<unknown>)): void {
  const instance = getCurrentInstance()
  const i = instance.hookIndex++

  if (typeof deps === 'function') {
    if (instance.hooks[i] !== undefined) throw new Error('Reactive useEffect dependencies are initialized once')
    const hook: UseEffectHook = { deps: undefined, cleanup: null }
    instance.hooks[i] = hook
    let initialized = false
    let scheduled = false
    const stop = effect(() => {
      const next = deps()
      if (initialized && !depsChanged(next, hook.deps)) return
      hook.deps = [...next]
      if (!scheduled) {
        scheduled = true
        instance.passiveEffects.push({
          cleanup: () => {
            const cleanup = hook.cleanup
            hook.cleanup = null
            cleanup?.()
          },
          run: () => {
            scheduled = false
            const result = fn()
            hook.cleanup = typeof result === 'function' ? result : null
          },
        })
        if (initialized) flushPassiveEffects(instance)
      }
      initialized = true
    })
    instance.cleanup.push(stop)
    return
  }

  const existing = instance.hooks[i] as UseEffectHook | undefined

  if (existing === undefined) {
    // First render — always schedule. There are no prev deps to compare to.
    instance.hooks[i] = { deps, cleanup: null } as UseEffectHook
    instance.passiveEffects.push(makeEntry(instance.hooks[i] as UseEffectHook, fn))
    return
  }

  // Subsequent render — only re-run if deps changed (or no deps given).
  if (depsChanged(deps, existing.deps)) {
    existing.deps = deps
    instance.passiveEffects.push(makeEntry(existing, fn))
  }
}

function makeEntry(hook: UseEffectHook, fn: EffectFn): EffectEntry {
  return {
    cleanup: hook.cleanup,
    run: () => {
      const result = fn()
      hook.cleanup = typeof result === 'function' ? result : null
    },
  }
}
