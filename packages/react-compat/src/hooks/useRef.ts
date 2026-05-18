import { getCurrentInstance } from '../instance'

export interface RefObject<T> {
  current: T
}

export function useRef<T>(initial: T): RefObject<T> {
  const instance = getCurrentInstance()
  const i = instance.hookIndex++

  if (instance.hooks[i] === undefined) {
    // First render — create the ref box
    instance.hooks[i] = { current: initial }
  }

  return instance.hooks[i]
}