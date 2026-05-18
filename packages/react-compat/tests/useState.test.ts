import { describe, it, expect, vi } from 'vitest'
import { createInstance, withInstance } from '../src/instance'
import { useState } from '../src/hooks/useState'

describe('useState', () => {
  it('returns a [getter, setter] tuple', () => {
    const instance = createInstance()

    withInstance(instance, () => {
      const result = useState(0)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(2)
      expect(typeof result[0]).toBe('function')
      expect(typeof result[1]).toBe('function')
      expect(result[0]()).toBe(0)
    })
  })

  it('returns the initial value via the getter', () => {
    const instance = createInstance()

    withInstance(instance, () => {
      const [count] = useState(42)
      expect(count()).toBe(42)
    })
  })

  it('supports lazy initialisation with a function', () => {
    const instance = createInstance()
    const expensiveCompute = vi.fn(() => 'computed value')

    withInstance(instance, () => {
      const [value] = useState(expensiveCompute)
      expect(value()).toBe('computed value')
    })

    expect(expensiveCompute).toHaveBeenCalledTimes(1)
  })

  it('lazy initialisation does NOT re-run on subsequent renders', () => {
    const instance = createInstance()
    const expensiveCompute = vi.fn(() => 'first')

    withInstance(instance, () => { useState(expensiveCompute) })
    withInstance(instance, () => { useState(expensiveCompute) })

    expect(expensiveCompute).toHaveBeenCalledTimes(1)
  })

  it('persists state across renders', () => {
    const instance = createInstance()
    let setCount!: (v: number) => void

    withInstance(instance, () => {
      const [count, set] = useState(0)
      setCount = set
      expect(count()).toBe(0)
    })

    setCount(5)

    withInstance(instance, () => {
      const [count] = useState(999)  // initial value ignored on re-render
      expect(count()).toBe(5)
    })
  })

  it('accepts a direct value', () => {
    const instance = createInstance()
    let setCount!: (v: number) => void

    withInstance(instance, () => {
      const [, set] = useState(0)
      setCount = set
    })

    setCount(10)

    withInstance(instance, () => {
      const [count] = useState(0)
      expect(count()).toBe(10)
    })
  })

  it('accepts a functional updater', () => {
    const instance = createInstance()
    let setCount!: (action: number | ((prev: number) => number)) => void

    withInstance(instance, () => {
      const [, set] = useState(0)
      setCount = set
    })

    setCount(prev => prev + 1)
    setCount(prev => prev + 1)
    setCount(prev => prev + 1)

    withInstance(instance, () => {
      const [count] = useState(0)
      expect(count()).toBe(3)
    })
  })

  it('supports multiple useState calls in one component', () => {
    const instance = createInstance()

    withInstance(instance, () => {
      const [count] = useState(0)
      const [name] = useState('Alice')
      const [active] = useState(true)

      expect(count()).toBe(0)
      expect(name()).toBe('Alice')
      expect(active()).toBe(true)
    })
  })

  it('each useState slot is independent across re-renders', () => {
    const instance = createInstance()
    let setA!: (v: number) => void
    let setB!: (v: string) => void

    withInstance(instance, () => {
      const [, sA] = useState(1)
      const [, sB] = useState('x')
      setA = sA
      setB = sB
    })

    setA(99)
    setB('y')

    withInstance(instance, () => {
      const [a] = useState(0)
      const [b] = useState('z')
      expect(a()).toBe(99)
      expect(b()).toBe('y')
    })
  })

  it('the getter is reactive — reads the latest value at call time', () => {
    const instance = createInstance()
    let getter!: () => number
    let setter!: (v: number) => void

    withInstance(instance, () => {
      const [g, s] = useState(0)
      getter = g
      setter = s
    })

    expect(getter()).toBe(0)
    setter(1)
    expect(getter()).toBe(1)
    setter(42)
    expect(getter()).toBe(42)
  })
})