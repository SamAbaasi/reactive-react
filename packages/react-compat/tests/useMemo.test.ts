import { describe, it, expect, vi } from 'vitest'
import { createInstance, withInstance } from '../src/instance'
import { useMemo } from '../src/hooks/useMemo'
import { useState } from '../src/hooks/useState'

describe('useMemo', () => {
  it('returns a getter for the computed value', () => {
    const instance = createInstance()

    withInstance(instance, () => {
      const value = useMemo(() => 2 + 2, [])
      expect(typeof value).toBe('function')
      expect(value()).toBe(4)
    })
  })

  it('runs the factory function on mount', () => {
    const instance = createInstance()
    const factory = vi.fn(() => 'computed')

    withInstance(instance, () => {
      const value = useMemo(factory, [])
      expect(value()).toBe('computed')
    })

    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('does NOT recompute when nothing has changed across renders', () => {
    const instance = createInstance()
    const factory = vi.fn(() => 'static result')

    withInstance(instance, () => useMemo(factory, []))
    withInstance(instance, () => useMemo(factory, []))
    withInstance(instance, () => useMemo(factory, []))

    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('recomputes automatically when a signal it reads changes', () => {
    const instance = createInstance()
    let setCount!: (v: number) => void
    const factory = vi.fn()

    withInstance(instance, () => {
      const [count, set] = useState(0)
      setCount = set
      const doubled = useMemo(() => {
        factory()
        return count() * 2
      }, [count])
      expect(doubled()).toBe(0)
    })

    expect(factory).toHaveBeenCalledTimes(1)

    setCount(5)

    withInstance(instance, () => {
      const [count] = useState(0)
      const doubled = useMemo(() => {
        factory()
        return count() * 2
      }, [count])
      expect(doubled()).toBe(10)
    })

    expect(factory).toHaveBeenCalledTimes(2)
  })

  it('supports multiple useMemo calls in one component', () => {
    const instance = createInstance()

    withInstance(instance, () => {
      const a = useMemo(() => 1 + 1, [])
      const b = useMemo(() => 'hello' + ' ' + 'world', [])
      const c = useMemo(() => [1, 2, 3].reduce((s, n) => s + n, 0), [])

      expect(a()).toBe(2)
      expect(b()).toBe('hello world')
      expect(c()).toBe(6)
    })
  })

  it('caches independently across multiple useMemo calls', () => {
    const instance = createInstance()
    const factoryA = vi.fn(() => 'A')
    const factoryB = vi.fn(() => 'B')

    withInstance(instance, () => {
      useMemo(factoryA, [])
      useMemo(factoryB, [])
    })

    withInstance(instance, () => {
      useMemo(factoryA, [])
      useMemo(factoryB, [])
    })

    expect(factoryA).toHaveBeenCalledTimes(1)
    expect(factoryB).toHaveBeenCalledTimes(1)
  })

  it('chained useMemo — one depends on another via useState', () => {
    const instance = createInstance()
    let setCount!: (v: number) => void

    withInstance(instance, () => {
      const [count, set] = useState(1)
      setCount = set

      // Both factories use getters — doubled() and count() — so tracking
      // propagates correctly through the chain.
      const doubled = useMemo(() => count() * 2, [count])
      const quadrupled = useMemo(() => doubled() * 2, [doubled])

      expect(doubled()).toBe(2)
      expect(quadrupled()).toBe(4)
    })

    setCount(3)

    withInstance(instance, () => {
      const [count] = useState(0)
      const doubled = useMemo(() => count() * 2, [count])
      const quadrupled = useMemo(() => doubled() * 2, [doubled])

      expect(doubled()).toBe(6)
      expect(quadrupled()).toBe(12)
    })
  })

  it('factory is wrapped in computed — auto-tracks signals, deps array is ignored', () => {
    const instance = createInstance()
    const factory = vi.fn(() => 'frozen')

    for (let i = 0; i < 5; i++) {
      withInstance(instance, () => {
        useMemo(factory, [Math.random(), Date.now(), {}])
      })
    }

    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('re-runs only when a signal it actually reads changes', () => {
    const instance = createInstance()
    const factory = vi.fn((c: () => number) => c() * 10)
    let setA!: (v: number) => void
    let setB!: (v: number) => void

    withInstance(instance, () => {
      const [a, sA] = useState(2)
      const [b, sB] = useState(99)
      setA = sA
      setB = sB
      const result = useMemo(() => factory(a), [])
      expect(result()).toBe(20)
    })

    expect(factory).toHaveBeenCalledTimes(1)

    setB(100)

    withInstance(instance, () => {
      const [a] = useState(2)
      const [b] = useState(99)
      useMemo(() => factory(a), [])
    })

    expect(factory).toHaveBeenCalledTimes(1)

    setA(5)

    withInstance(instance, () => {
      const [a] = useState(2)
      useMemo(() => factory(a), [])
    })

    expect(factory).toHaveBeenCalledTimes(2)
  })

  it('empty deps array — factory reads no signals, never recomputes after mount', () => {
    const instance = createInstance()
    const factory = vi.fn(() => 'frozen')

    withInstance(instance, () => useMemo(factory, []))
    withInstance(instance, () => useMemo(factory, []))
    withInstance(instance, () => useMemo(factory, []))

    expect(factory).toHaveBeenCalledTimes(1)
  })
})