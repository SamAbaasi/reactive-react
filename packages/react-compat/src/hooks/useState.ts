import { createSignal } from '@rrjs/signals'
import { getCurrentInstance } from '../instance'

// React-shim useState — but honest about JavaScript's constraints.
//
// In a true signal-based model, state cannot be a frozen primitive
// that auto-tracks. We return the getter directly. Developers call it
// when they need the value: count(), not count.
//
// Inside JSX, the Babel plugin wraps {count} as () => count, and the
// renderer's effect auto-invokes nested getters. So JSX still reads
// as if count were a value. Outside JSX, the developer writes count().
//
// This matches SolidJS's createSignal API. It is the simplest possible
// signal API that gives you "component runs once" semantics.

type SetStateAction<T> = T | ((prev: T) => T)

interface UseStateHook<T> {
  getter: () => T
  setter: (value: T) => void
  dispatch: (action: SetStateAction<T>) => void
}

export function useState<T>(
  initial: T | (() => T)
): [() => T, (action: SetStateAction<T>) => void] {
  const instance = getCurrentInstance()
  const i = instance.hookIndex++

  if (instance.hooks[i] === undefined) {
    const initialValue =
      typeof initial === 'function'
        ? (initial as () => T)()
        : initial

    const [getter, setter] = createSignal<T>(initialValue)

    // The dispatch wrapper handles the functional updater form.
    // setCount(c => c + 1) reads the current value through the getter,
    // applies the updater, and writes the result.
    const dispatch = (action: SetStateAction<T>): void => {
      if (typeof action === 'function') {
        setter((action as (prev: T) => T)(getter()))
      } else {
        setter(action)
      }
    }

    instance.hooks[i] = { getter, setter, dispatch } as UseStateHook<T>
  }

  const hook = instance.hooks[i] as UseStateHook<T>

  // Return the getter, not the value.
  // The first element of the tuple is a function: count is () => number.
  return [hook.getter, hook.dispatch]
}