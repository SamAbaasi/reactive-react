import { getCurrentInstance, EffectEntry } from '../instance'
import type { Ref } from '../forwardRef'

interface UseImperativeHandleHook {
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

// useImperativeHandle customizes what a forwardRef ref exposes.
// Instead of attaching the raw DOM node, the parent gets a custom handle
// returned by the factory function.
//
// Timing: runs as a LAYOUT effect, before paint. This matches React's behavior —
// the parent's ref must be populated before any rendered output is visible,
// because useLayoutEffect in the PARENT might read from this ref immediately.

export function useImperativeHandle<T>(
  ref: Ref<T> | undefined,
  factory: () => T,
  deps?: ReadonlyArray<unknown>
): void {
  const instance = getCurrentInstance()
  const i = instance.hookIndex++

  const existing = instance.hooks[i] as UseImperativeHandleHook | undefined

  const attach: EffectEntry = {
    cleanup: existing?.cleanup ?? null,
    run: () => {
      if (!ref) return
      const value = factory()

      if (typeof ref === 'function') {
        ref(value)
        // Cleanup: pass null to the callback ref on unmount/re-attach
        ;(instance.hooks[i] as UseImperativeHandleHook).cleanup = () => ref(null)
      } else if (typeof ref === 'object' && 'current' in ref) {
        ref.current = value
        ;(instance.hooks[i] as UseImperativeHandleHook).cleanup = () => {
          ref.current = null as any
        }
      }
    },
  }

  if (existing === undefined) {
    instance.hooks[i] = { deps, cleanup: null } as UseImperativeHandleHook
    instance.layoutEffects.push(attach)
    return
  }

  if (depsChanged(deps, existing.deps)) {
    existing.deps = deps
    instance.layoutEffects.push(attach)
  }
}