import { describe, it, expect, vi } from 'vitest'
import { createInstance, withInstance } from '../src/instance'
import { useReducer } from '../src/hooks/useReducer'

type CounterState = { count: number }
type CounterAction =
  | { type: 'INCREMENT' }
  | { type: 'DECREMENT' }
  | { type: 'ADD'; payload: number }
  | { type: 'RESET' }

const counterReducer = (state: CounterState, action: CounterAction): CounterState => {
  switch (action.type) {
    case 'INCREMENT': return { count: state.count + 1 }
    case 'DECREMENT': return { count: state.count - 1 }
    case 'ADD':       return { count: state.count + action.payload }
    case 'RESET':     return { count: 0 }
    default:          return state
  }
}

describe('useReducer', () => {
  it('returns a [stateGetter, dispatch] tuple', () => {
    const instance = createInstance()

    withInstance(instance, () => {
      const result = useReducer(counterReducer, { count: 0 })
      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(2)
      expect(typeof result[0]).toBe('function')
      expect(typeof result[1]).toBe('function')
    })
  })

  it('returns the initial state from the getter on first render', () => {
    const instance = createInstance()

    withInstance(instance, () => {
      const [state] = useReducer(counterReducer, { count: 42 })
      expect(state()).toEqual({ count: 42 })
    })
  })

  it('dispatch applies the reducer and updates state', () => {
    const instance = createInstance()
    let dispatch!: (action: CounterAction) => void

    withInstance(instance, () => {
      const [, d] = useReducer(counterReducer, { count: 0 })
      dispatch = d
    })

    dispatch({ type: 'INCREMENT' })

    withInstance(instance, () => {
      const [state] = useReducer(counterReducer, { count: 999 })  // initial ignored
      expect(state()).toEqual({ count: 1 })
    })
  })

  it('multiple dispatches accumulate via the reducer', () => {
    const instance = createInstance()
    let dispatch!: (action: CounterAction) => void

    withInstance(instance, () => {
      const [, d] = useReducer(counterReducer, { count: 0 })
      dispatch = d
    })

    dispatch({ type: 'INCREMENT' })
    dispatch({ type: 'INCREMENT' })
    dispatch({ type: 'INCREMENT' })
    dispatch({ type: 'ADD', payload: 10 })

    withInstance(instance, () => {
      const [state] = useReducer(counterReducer, { count: 0 })
      expect(state()).toEqual({ count: 13 })
    })
  })

  it('reducer can read its action payload', () => {
    const instance = createInstance()
    let dispatch!: (action: CounterAction) => void

    withInstance(instance, () => {
      const [, d] = useReducer(counterReducer, { count: 5 })
      dispatch = d
    })

    dispatch({ type: 'ADD', payload: 7 })

    withInstance(instance, () => {
      const [state] = useReducer(counterReducer, { count: 0 })
      expect(state()).toEqual({ count: 12 })
    })
  })

  it('reset action returns to default state', () => {
    const instance = createInstance()
    let dispatch!: (action: CounterAction) => void

    withInstance(instance, () => {
      const [, d] = useReducer(counterReducer, { count: 100 })
      dispatch = d
    })

    dispatch({ type: 'INCREMENT' })
    dispatch({ type: 'RESET' })

    withInstance(instance, () => {
      const [state] = useReducer(counterReducer, { count: 0 })
      expect(state()).toEqual({ count: 0 })
    })
  })

  it('supports lazy initialisation via the third argument', () => {
    const instance = createInstance()
    const init = vi.fn((initial: number) => ({ count: initial * 10 }))

    withInstance(instance, () => {
      const [state] = useReducer(counterReducer, 5, init)
      expect(state()).toEqual({ count: 50 })
    })

    // init runs exactly once on mount
    expect(init).toHaveBeenCalledTimes(1)
    expect(init).toHaveBeenCalledWith(5)
  })

  it('lazy init does NOT re-run on subsequent renders', () => {
    const instance = createInstance()
    const init = vi.fn((n: number) => ({ count: n }))

    withInstance(instance, () => { useReducer(counterReducer, 1, init) })
    withInstance(instance, () => { useReducer(counterReducer, 1, init) })
    withInstance(instance, () => { useReducer(counterReducer, 1, init) })

    expect(init).toHaveBeenCalledTimes(1)
  })

  it('dispatch reference is stable across renders', () => {
    const instance = createInstance()
    let firstDispatch!: (action: CounterAction) => void
    let secondDispatch!: (action: CounterAction) => void

    withInstance(instance, () => {
      const [, d] = useReducer(counterReducer, { count: 0 })
      firstDispatch = d
    })

    withInstance(instance, () => {
      const [, d] = useReducer(counterReducer, { count: 0 })
      secondDispatch = d
    })

    expect(firstDispatch).toBe(secondDispatch)
  })

  it('supports multiple useReducer calls in one component', () => {
    const instance = createInstance()

    withInstance(instance, () => {
      const [count] = useReducer(counterReducer, { count: 1 })
      const [items] = useReducer(
        (state: string[], action: { type: 'ADD'; item: string }) =>
          action.type === 'ADD' ? [...state, action.item] : state,
        ['a']
      )

      expect(count()).toEqual({ count: 1 })
      expect(items()).toEqual(['a'])
    })
  })

  it('the state getter is reactive across dispatches', () => {
    const instance = createInstance()
    let getter!: () => CounterState
    let dispatch!: (action: CounterAction) => void

    withInstance(instance, () => {
      const [g, d] = useReducer(counterReducer, { count: 0 })
      getter = g
      dispatch = d
    })

    expect(getter()).toEqual({ count: 0 })

    dispatch({ type: 'INCREMENT' })
    expect(getter()).toEqual({ count: 1 })

    dispatch({ type: 'ADD', payload: 99 })
    expect(getter()).toEqual({ count: 100 })
  })
})