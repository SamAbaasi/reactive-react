import { computed } from '@rrjs/signals'
import { getCurrentInstance } from './instance.js'

/** Compiler-created computation owned by the mounted component. */
export function derive<T>(factory: () => T): () => T {
  const instance = getCurrentInstance()
  const value = computed(factory)
  instance.cleanup.push(value.dispose)
  return value
}
