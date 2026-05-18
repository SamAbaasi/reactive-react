import { describe, it, expect } from 'vitest'
import { createInstance, withInstance } from '../src/instance'
import { useRef } from '../src/hooks/useRef'

describe('useRef', () => {
  it('returns an object with a current property', () => {
    const instance = createInstance()

    withInstance(instance, () => {
      const ref = useRef(0)
      expect(ref).toEqual({ current: 0 })
    })
  })

  it('initialises with the given value', () => {
    const instance = createInstance()

    withInstance(instance, () => {
      const ref = useRef('hello')
      expect(ref.current).toBe('hello')
    })
  })

  it('persists the value across renders', () => {
    const instance = createInstance()
    let firstRef: { current: number }

    // First render
    withInstance(instance, () => {
      firstRef = useRef(42)
    })

    // Mutate the ref
    firstRef!.current = 100

    // Second render — should get the SAME ref object back
    withInstance(instance, () => {
      const secondRef = useRef(42)  // initial value is IGNORED on re-render
      expect(secondRef).toBe(firstRef)  // same identity
      expect(secondRef.current).toBe(100)  // preserves the mutation
    })
  })

  it('mutating does not trigger any reactive update', () => {
    // Refs are explicitly NOT reactive. This is by design.
    // The whole point of useRef vs useState is that ref mutations
    // are invisible to the rendering system.
    const instance = createInstance()
    let ref: { current: number }

    withInstance(instance, () => {
      ref = useRef(0)
    })

    // No signals, no effects involved — just direct mutation
    ref!.current = 1
    ref!.current = 2
    ref!.current = 3

    // No assertions about re-renders — there should be no re-render mechanism
    // to even check. The test passes by completing without errors.
    expect(ref!.current).toBe(3)
  })

  it('supports multiple useRef calls in the same component', () => {
    const instance = createInstance()

    withInstance(instance, () => {
      const a = useRef('a')
      const b = useRef('b')
      const c = useRef('c')

      expect(a.current).toBe('a')
      expect(b.current).toBe('b')
      expect(c.current).toBe('c')

      // Each is a different identity
      expect(a).not.toBe(b)
      expect(b).not.toBe(c)
    })
  })

  it('preserves all refs across re-renders by hook position', () => {
    const instance = createInstance()

    withInstance(instance, () => {
      const a = useRef(1)
      const b = useRef(2)
      a.current = 10
      b.current = 20
    })

    withInstance(instance, () => {
      // Initial values are ignored — the hooks return their stored values
      const a = useRef(999)
      const b = useRef(999)
      expect(a.current).toBe(10)
      expect(b.current).toBe(20)
    })
  })

  it('throws if called outside a component', () => {
    expect(() => useRef(0)).toThrow(/Hook called outside of a component/)
  })
})