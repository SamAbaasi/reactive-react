import { getCurrentInstance } from '../instance'

interface UseIdHook {
  id: string
}

// A global counter is the simplest correct implementation client-side.
// React 18 also uses a counter, though theirs encodes tree position
// for SSR/hydration matching. For pure client rendering, a counter is fine.
//
// React's id format is ":r0:", ":r1:", etc. We match the format so that
// any third-party library checking the format works the same way.

let nextId = 0

function generateId(): string {
  return `:r${(nextId++).toString(36)}:`
}

// useId returns a stable unique string for each call site in each component.
// On the first render of a component, generate a fresh id.
// On any subsequent render of the same component instance, return the cached id.
// This is what makes <label htmlFor={id}> match <input id={id} /> across renders.

export function useId(): string {
  const instance = getCurrentInstance()
  const i = instance.hookIndex++

  if (instance.hooks[i] === undefined) {
    instance.hooks[i] = { id: generateId() } as UseIdHook
  }

  return (instance.hooks[i] as UseIdHook).id
}

// Exposed for testing — lets tests reset the counter for predictable assertions
export function _resetIdCounter(): void {
  nextId = 0
}