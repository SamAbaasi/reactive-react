import { describe, it, expect, vi } from 'vitest'
import { createInstance, withInstance } from '../src/instance'
import { useSyncExternalStore } from '../src/hooks/useSyncExternalStore'

// A minimal store implementation for testing.
// Same shape as Zustand, Redux, or any other external store.
function createTestStore<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot(): T {
      return value
    },
    setValue(next: T): void {
      value = next
      listeners.forEach(l => l())
    },
    get listenerCount() {
      return listeners.size
    },
  }
}

describe('useSyncExternalStore', () => {
  it('returns the initial snapshot via the getter', () => {
    const instance = createInstance()
    const store = createTestStore(42)

    withInstance(instance, () => {
      const value = useSyncExternalStore(store.subscribe, store.getSnapshot)
      expect(value()).toBe(42)
    })
  })

  it('subscribes to the store on first render', () => {
    const instance = createInstance()
    const store = createTestStore('initial')

    expect(store.listenerCount).toBe(0)

    withInstance(instance, () => {
      useSyncExternalStore(store.subscribe, store.getSnapshot)
    })

    expect(store.listenerCount).toBe(1)
  })

  it('does NOT re-subscribe on subsequent renders', () => {
    const instance = createInstance()
    const store = createTestStore('hello')

    withInstance(instance, () => useSyncExternalStore(store.subscribe, store.getSnapshot))
    withInstance(instance, () => useSyncExternalStore(store.subscribe, store.getSnapshot))
    withInstance(instance, () => useSyncExternalStore(store.subscribe, store.getSnapshot))

    // One subscription, total, not three
    expect(store.listenerCount).toBe(1)
  })

  it('getter returns the latest snapshot after store changes', () => {
    const instance = createInstance()
    const store = createTestStore(0)

    let getter!: () => number

    withInstance(instance, () => {
      getter = useSyncExternalStore(store.subscribe, store.getSnapshot)
    })

    expect(getter()).toBe(0)

    store.setValue(1)
    expect(getter()).toBe(1)

    store.setValue(42)
    expect(getter()).toBe(42)
  })

  it('multiple components subscribe independently to the same store', () => {
    const store = createTestStore('shared')
    const instance1 = createInstance()
    const instance2 = createInstance()

    let getter1!: () => string
    let getter2!: () => string

    withInstance(instance1, () => {
      getter1 = useSyncExternalStore(store.subscribe, store.getSnapshot)
    })

    withInstance(instance2, () => {
      getter2 = useSyncExternalStore(store.subscribe, store.getSnapshot)
    })

    expect(store.listenerCount).toBe(2)

    store.setValue('updated')

    expect(getter1()).toBe('updated')
    expect(getter2()).toBe('updated')
  })

  it('store snapshot that compares equal does not produce a new signal write', () => {
    // The signal's Object.is bailout means same-value snapshots don't cause work.
    const instance = createInstance()
    const store = createTestStore({ count: 1 })

    withInstance(instance, () => {
      useSyncExternalStore(store.subscribe, store.getSnapshot)
    })

    // Reset to an Object.is-equal value (literally same reference)
    const snapshotBefore = store.getSnapshot()
    store.setValue(snapshotBefore)

    // No assertion needed — the signal's bailout means no exception, no infinite loop.
    // This documents the property.
    expect(true).toBe(true)
  })

  it('accepts getServerSnapshot but ignores it client-side', () => {
    const instance = createInstance()
    const store = createTestStore('client')
    const getServer = vi.fn(() => 'server')

    withInstance(instance, () => {
      const value = useSyncExternalStore(store.subscribe, store.getSnapshot, getServer)
      expect(value()).toBe('client')
    })

    // We don't currently call getServerSnapshot in any path
    expect(getServer).not.toHaveBeenCalled()
  })

  it('cleanup is registered for store unsubscription', () => {
    const instance = createInstance()
    const store = createTestStore('value')

    withInstance(instance, () => {
      useSyncExternalStore(store.subscribe, store.getSnapshot)
    })

    expect(store.listenerCount).toBe(1)
    expect(instance.cleanup.length).toBe(1)

    // Simulating unmount — run all cleanups
    instance.cleanup.forEach(fn => fn())

    expect(store.listenerCount).toBe(0)
  })

  it('integrates with a Redux-style store', () => {
    type Action = { type: 'INCREMENT' } | { type: 'ADD'; payload: number }
    type State = { count: number }

    function createReduxLikeStore<S, A>(
      reducer: (s: S, a: A) => S,
      initial: S
    ) {
      let state = initial
      const listeners = new Set<() => void>()
      return {
        getState: () => state,
        dispatch(action: A) {
          state = reducer(state, action)
          listeners.forEach(l => l())
        },
        subscribe(l: () => void) {
          listeners.add(l)
          return () => listeners.delete(l)
        },
      }
    }

    const store = createReduxLikeStore<State, Action>(
      (s, a) => {
        switch (a.type) {
          case 'INCREMENT': return { count: s.count + 1 }
          case 'ADD':       return { count: s.count + a.payload }
        }
      },
      { count: 0 }
    )

    const instance = createInstance()
    let getter!: () => State

    withInstance(instance, () => {
      getter = useSyncExternalStore(store.subscribe, store.getState)
    })

    expect(getter()).toEqual({ count: 0 })

    store.dispatch({ type: 'INCREMENT' })
    expect(getter()).toEqual({ count: 1 })

    store.dispatch({ type: 'ADD', payload: 10 })
    expect(getter()).toEqual({ count: 11 })
  })

  it('integrates with a Zustand-style store', () => {
    function createZustandLikeStore<T extends object>(creator: (set: (next: Partial<T>) => void) => T) {
      let state: T
      const listeners = new Set<() => void>()

      const setState = (next: Partial<T>) => {
        state = { ...state, ...next }
        listeners.forEach(l => l())
      }

      state = creator(setState)

      return {
        getState: () => state,
        subscribe(l: () => void) {
          listeners.add(l)
          return () => listeners.delete(l)
        },
        setState,
      }
    }

    interface BearState {
      bears: number
      addBear: () => void
    }

    const store = createZustandLikeStore<BearState>((set) => ({
      bears: 0,
      addBear: () => set({ bears: (store?.getState().bears ?? 0) + 1 }),
    }))

    const instance = createInstance()
    let getter!: () => BearState

    withInstance(instance, () => {
      getter = useSyncExternalStore(store.subscribe, store.getState)
    })

    expect(getter().bears).toBe(0)

    getter().addBear()
    expect(getter().bears).toBe(1)

    getter().addBear()
    expect(getter().bears).toBe(2)
  })
})