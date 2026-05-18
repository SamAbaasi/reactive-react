import { computed } from '@reactive-react/signals'
import { getCurrentInstance } from '../instance'

interface UseMemoHook<T> {
  getter: () => T
}

// useMemo wraps the factory in computed(), which auto-tracks signal reads.
// Returns the GETTER, not the value — for the same reason useState does.
// This allows chained useMemo and downstream effects to track changes.
//
// Inside JSX, the Babel plugin and the renderer's auto-unwrap make this transparent.
// Outside JSX, the developer calls the returned function: doubled().

export function useMemo<T>(
  factory: () => T,
  _deps?: ReadonlyArray<unknown>
): () => T {
  const instance = getCurrentInstance()
  const i = instance.hookIndex++

  if (instance.hooks[i] === undefined) {
    const getter = computed(factory)
    instance.hooks[i] = { getter } as UseMemoHook<T>
  }

  return (instance.hooks[i] as UseMemoHook<T>).getter
}