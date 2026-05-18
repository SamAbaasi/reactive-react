import { describe, it, expect, vi } from 'vitest'
import { createSignal, effect, computed, batch } from '../src/index'

describe('batch', () => {
  it('runs effects once when multiple signals update together', () => {
    const [a, setA] = createSignal(0)
    const [b, setB] = createSignal(0)
    const spy = vi.fn()

    effect(() => {
      spy(a() + b())
    })

    expect(spy).toHaveBeenCalledTimes(1)

    batch(() => {
      setA(1)  // scheduled, not flushed yet
      setB(2)  // scheduled, not flushed yet
    })          // flush here — spy runs once with a+b = 3

    expect(spy).toHaveBeenCalledTimes(2)  // not 3
    expect(spy).toHaveBeenLastCalledWith(3)
  })
})

describe('computed', () => {
  it('returns the initial derived value', () => {
    const [count] = createSignal(2)
    const doubled = computed(() => count() * 2)

    expect(doubled()).toBe(4)
  })

  it('updates when its dependency changes', () => {
    const [count, setCount] = createSignal(2)
    const doubled = computed(() => count() * 2)

    setCount(5)
    expect(doubled()).toBe(10)
  })

  it('can depend on multiple signals', () => {
    const [a, setA] = createSignal(1)
    const [b, setB] = createSignal(2)
    const sum = computed(() => a() + b())

    expect(sum()).toBe(3)

    setA(10)
    expect(sum()).toBe(12)

    setB(20)
    expect(sum()).toBe(30)
  })

  it('can be read inside an effect', () => {
    const [count, setCount] = createSignal(1)
    const doubled = computed(() => count() * 2)
    const spy = vi.fn()

    effect(() => {
      spy(doubled())
    })

    expect(spy).toHaveBeenCalledWith(2)

    setCount(5)
    expect(spy).toHaveBeenCalledWith(10)
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('can chain — computed from computed', () => {
    const [count, setCount] = createSignal(2)
    const doubled = computed(() => count() * 2)
    const quadrupled = computed(() => doubled() * 2)

    expect(quadrupled()).toBe(8)

    setCount(3)
    expect(doubled()).toBe(6)
    expect(quadrupled()).toBe(12)
  })

  it('only notifies dependents when the value actually changes', () => {
    const [a, setA] = createSignal(1)
    const [b, setB] = createSignal(1)
    const spy = vi.fn()

    // This computed always returns true regardless of input values
    const alwaysTrue = computed(() => a() > 0 || b() > 0)

    effect(() => {
      spy(alwaysTrue())
    })

    expect(spy).toHaveBeenCalledTimes(1)

    // Both still positive — alwaysTrue stays true — spy should NOT fire again
    setA(100)
    expect(spy).toHaveBeenCalledTimes(1)

    setB(200)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('diamond: A → B, A → C, B+C → D — D fires exactly once', () => {
    const [a, setA] = createSignal(1)
    const b = computed(() => a() * 2)
    const c = computed(() => a() * 3)
    const d = computed(() => b() + c())
    const spy = vi.fn()

    effect(() => {
      spy(d())
    })

    // Initial: b=2, c=3, d=5
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenLastCalledWith(5)

    // When a changes: b and c both update, d should fire ONCE not twice
    setA(2)
    // b=4, c=6, d=10
    expect(spy).toHaveBeenCalledTimes(2)  // not 3
    expect(spy).toHaveBeenLastCalledWith(10)
  })
})
// --- previous tests stay here ---

describe('effect', () => {
  it('runs immediately on creation', () => {
    const [count] = createSignal(0)
    const spy = vi.fn()

    effect(() => {
      count() // read the signal to subscribe
      spy()
    })

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('re-runs when a signal it read changes', () => {
    const [count, setCount] = createSignal(0)
    const spy = vi.fn()

    effect(() => {
      spy(count()) // read and record the value
    })

    expect(spy).toHaveBeenCalledWith(0)

    setCount(1)
    expect(spy).toHaveBeenCalledWith(1)
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('does NOT re-run when an unread signal changes', () => {
    const [count, setCount] = createSignal(0)
    const [other, setOther] = createSignal(99)
    const spy = vi.fn()

    effect(() => {
      spy(count()) // only reads count, not other
    })

    setOther(100) // should NOT trigger the effect
    expect(spy).toHaveBeenCalledTimes(1)

    setCount(1) // SHOULD trigger the effect
    expect(spy).toHaveBeenCalledTimes(2)
  })

it('runs cleanup before the next run', () => {
  const [count, setCount] = createSignal(0)
  const log: string[] = []

  effect(() => {
    const current = count()        // capture value at run time
    log.push(`run:${current}`)
    return () => log.push(`cleanup:${current}`)  // close over captured value
  })

  setCount(1)
  setCount(2)

  expect(log).toEqual([
    'run:0',
    'cleanup:0',   // sees the captured 0, not current count()
    'run:1',
    'cleanup:1',
    'run:2',
  ])
})

  it('runs cleanup on dispose', () => {
    const [count] = createSignal(0)
    const log: string[] = []

    const dispose = effect(() => {
      count()
      log.push('run')
      return () => log.push('cleanup')
    })

    dispose()
    expect(log).toEqual(['run', 'cleanup'])
  })

  it('stops re-running after dispose', () => {
    const [count, setCount] = createSignal(0)
    const spy = vi.fn()

    const dispose = effect(() => {
      spy(count())
    })

    setCount(1)
    expect(spy).toHaveBeenCalledTimes(2)

    dispose()
    setCount(2)
    expect(spy).toHaveBeenCalledTimes(2) // no more calls after dispose
  })

  it('handles conditional dependencies correctly', () => {
    const [flag, setFlag] = createSignal(true)
    const [a, setA] = createSignal('a')
    const [b, setB] = createSignal('b')
    const spy = vi.fn()

    effect(() => {
      // When flag is true, we depend on a.
      // When flag is false, we depend on b.
      // We should NEVER depend on both at the same time.
      spy(flag() ? a() : b())
    })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenLastCalledWith('a')

    // Changing b should NOT trigger when flag is true
    setB('B')
    expect(spy).toHaveBeenCalledTimes(1)

    // Changing a SHOULD trigger when flag is true
    setA('A')
    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy).toHaveBeenLastCalledWith('A')

    // Switch flag — now we depend on b, not a
    setFlag(false)
    expect(spy).toHaveBeenCalledTimes(3)
    expect(spy).toHaveBeenLastCalledWith('B')

    // Changing a should NOT trigger when flag is false
    setA('AA')
    expect(spy).toHaveBeenCalledTimes(3)

    // Changing b SHOULD trigger when flag is false
    setB('BB')
    expect(spy).toHaveBeenCalledTimes(4)
    expect(spy).toHaveBeenLastCalledWith('BB')
  })
})