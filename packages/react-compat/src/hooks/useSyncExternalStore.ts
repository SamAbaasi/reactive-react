import { createSignal, effect } from '@rrjs/signals'
import { getCurrentInstance } from '../instance'

type Subscribe = (onStoreChange: () => void) => () => void

interface UseSyncExternalStoreHook<T> {
  getter: () => T
  unsubscribe: () => void
}

// useSyncExternalStore is the React 18+ primitive that lets external state
// libraries (Redux, Zustand, Jotai, etc.) plug into a React-compatible
// rendering system.
//
// The contract:
//   - subscribe(callback): the store calls `callback` whenever its value changes,
//     and returns a function that unsubscribes the callback.
//   - getSnapshot(): returns the current value synchronously.
//
// Our implementation bridges this to the signal world:
//   1. Read the initial snapshot.
//   2. Create a signal seeded with that snapshot.
//   3. Subscribe to the store. When it notifies, read a fresh snapshot
//      and write it into the signal.
//   4. Return the signal's getter — components that read it auto-track.
//
// The third argument (getServerSnapshot) is accepted for API compatibility.
// We use it only for the initial value if we're in an SSR context — which
// we don't currently support, so we just ignore it client-side.

export function useSyncExternalStore<T>(
  subscribe: Subscribe,
  getSnapshot: () => T,
  _getServerSnapshot?: () => T
): () => T {
  const instance = getCurrentInstance()
  const i = instance.hookIndex++

  if (instance.hooks[i] === undefined) {
    // Initial mount: snapshot, signal, subscription
    const [getter, setter] = createSignal<T>(getSnapshot())

    const onStoreChange = () => {
      const next = getSnapshot()
      // The signal's same-value bailout handles unchanged snapshots correctly:
      // Object.is(prev, next) means no notification fires, no DOM thrash.
      setter(next)
    }

    const unsubscribe = subscribe(onStoreChange)

    // Register cleanup to unsubscribe when the component unmounts.
    instance.cleanup.push(unsubscribe)

    instance.hooks[i] = { getter, unsubscribe } as UseSyncExternalStoreHook<T>
  }

  return (instance.hooks[i] as UseSyncExternalStoreHook<T>).getter
}