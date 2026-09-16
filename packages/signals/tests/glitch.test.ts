// Q7 — glitch-freedom of the signal core.
//
// A "glitch" is an observer running with an inconsistent view of the graph: seeing
// a new value for one dependency and a stale one for another. The diamond is the
// canonical test — A feeds B and C, D reads both, A changes. D must run with both
// B and C updated, and ideally exactly once.
import { describe, it, expect } from 'vitest'
import { createSignal, computed, effect, batch, untrack } from '../src/index'

describe('glitch-freedom', () => {
  it('diamond: D sees a consistent view of B and C', () => {
    const [a, setA] = createSignal(1)
    const b = computed(() => a() * 2)
    const c = computed(() => a() * 10)

    const observed: Array<[number, number]> = []
    effect(() => { observed.push([b(), c()]) })

    observed.length = 0
    setA(2)

    // Every observation must be internally consistent: c === b * 5, because both
    // derive from the same a. A torn read shows up as a pair that cannot come
    // from any single value of a.
    for (const [bv, cv] of observed) {
      expect(cv).toBe(bv * 5)
    }
    // And the final state must be correct.
    expect(observed[observed.length - 1]).toEqual([4, 20])
  })

  it('diamond: D runs exactly once per change to A', () => {
    const [a, setA] = createSignal(1)
    const b = computed(() => a() * 2)
    const c = computed(() => a() * 10)

    let runs = 0
    effect(() => { b(); c(); runs++ })

    runs = 0
    setA(2)
    expect(runs).toBe(1)
  })

  it('deeper diamond: two levels of derivation stay consistent', () => {
    const [a, setA] = createSignal(1)
    const b = computed(() => a() + 1)
    const c = computed(() => a() + 2)
    const d = computed(() => b() + c())

    const seen: number[] = []
    effect(() => { seen.push(d()) })

    seen.length = 0
    setA(10)
    // d = (a+1) + (a+2) = 2a + 3. For a=10 that is 23. Any intermediate value
    // that is not 2a+3 for some a is a torn read.
    for (const v of seen) expect((v - 3) % 2).toBe(0)
    expect(seen[seen.length - 1]).toBe(23)
  })

  it('batch: multiple writes produce one consistent run', () => {
    const [x, setX] = createSignal(1)
    const [y, setY] = createSignal(1)
    const pairs: Array<[number, number]> = []
    effect(() => { pairs.push([x(), y()]) })

    pairs.length = 0
    batch(() => { setX(2); setY(2) })

    expect(pairs[pairs.length - 1]).toEqual([2, 2])
    // Intermediate half-applied states must not be observed.
    expect(pairs.some(([a, b]) => a === 2 && b === 1)).toBe(false)
  })

  it('writing to a signal inside an effect that reads it terminates', () => {
    const [n, setN] = createSignal(0)
    let runs = 0
    effect(() => {
      runs++
      if (n() < 3) setN(n() + 1)
    })
    expect(n()).toBeGreaterThanOrEqual(3)
    expect(runs).toBeLessThan(50) // terminates rather than looping forever
  })

  it('nested reads inside reads track correctly', () => {
    const [a, setA] = createSignal(1)
    const [b, setB] = createSignal(10)
    const nested = computed(() => {
      const inner = computed(() => b() * 2)
      return a() + inner()
    })
    const seen: number[] = []
    effect(() => { seen.push(nested()) })

    expect(seen[seen.length - 1]).toBe(21)
    setB(20)
    expect(seen[seen.length - 1]).toBe(41)
    setA(2)
    expect(seen[seen.length - 1]).toBe(42)
  })

  it('untrack suppresses only the current observer, not nested effects', () => {
    const [a, setA] = createSignal(1)
    const [b, setB] = createSignal(1)

    let outerRuns = 0
    let innerRuns = 0
    effect(() => {
      outerRuns++
      untrack(() => {
        a() // must NOT subscribe the outer effect
        effect(() => { innerRuns++; b() }) // nested effect must still track b
      })
    })

    const outerBefore = outerRuns
    setA(2)
    expect(outerRuns).toBe(outerBefore) // untracked read did not resubscribe

    const innerBefore = innerRuns
    setB(2)
    expect(innerRuns).toBeGreaterThan(innerBefore) // nested effect still reactive
  })

  it('conditional dependencies are dropped when no longer read', () => {
    const [flag, setFlag] = createSignal(true)
    const [a, setA] = createSignal(1)
    let runs = 0
    effect(() => { runs++; if (flag()) a() })

    setFlag(false)
    const after = runs
    setA(99) // a is no longer read; this must not re-run the effect
    expect(runs).toBe(after)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Unequal dependency depths must settle before an observable effect runs.
// The observer reads the source and both branches to detect mixed versions.

describe('asymmetric diamond', () => {
  it('the observer sees a consistent view on every run', () => {
    const [a, setA] = createSignal(1)
    const b = computed(() => a() * 2)
    const c = computed(() => b() + 1)   // depth 2
    const d = computed(() => a() * 100) // depth 1

    const seen: Array<{ a: number; c: number; d: number }> = []
    effect(() => { seen.push({ a: a(), c: c(), d: d() }) })

    seen.length = 0
    setA(3)

    expect(seen).toEqual([{ a: 3, c: 7, d: 300 }])

    expect(seen[seen.length - 1]).toEqual({ a: 3, c: 7, d: 300 })
  })

  it('the observer runs once per write', () => {
    const [a, setA] = createSignal(1)
    const b = computed(() => a() * 2)
    const c = computed(() => b() + 1)
    const d = computed(() => a() * 100)

    let runs = 0
    effect(() => { c(); d(); runs++ })
    runs = 0
    setA(3)

    // One source write produces one settled observation.
    expect(runs).toBe(1)
  })
})
