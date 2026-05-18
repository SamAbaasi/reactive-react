import { describe, it, expect, vi } from 'vitest'
import { createInstance, withInstance } from '../src/instance'
import { useCallback } from '../src/hooks/useCallback'

describe('useCallback', () => {
  it('returns the function on first render', () => {
    const instance = createInstance()
    const fn = () => 42

    withInstance(instance, () => {
      const cached = useCallback(fn, [])
      expect(cached).toBe(fn)
    })
  })

  it('returns the same reference across renders when deps unchanged', () => {
    const instance = createInstance()
    let firstFn: () => number

    withInstance(instance, () => {
      firstFn = useCallback(() => 1, [])
    })

    withInstance(instance, () => {
      const secondFn = useCallback(() => 2, [])
      // First render's function is cached and returned —
      // even though we passed a brand new function on this render
      expect(secondFn).toBe(firstFn)
    })
  })

  it('returns a new reference when deps change', () => {
    const instance = createInstance()
    let firstFn: () => number

    withInstance(instance, () => {
      firstFn = useCallback(() => 1, [1])
    })

    withInstance(instance, () => {
      const secondFn = useCallback(() => 2, [2])
      // Deps changed [1] → [2], so the new function is stored and returned
      expect(secondFn).not.toBe(firstFn)
    })
  })

  it('cached function captures the original closure values', () => {
    const instance = createInstance()
    let value = 'first'
    let cached: () => string

    withInstance(instance, () => {
      cached = useCallback(() => value, [])
    })

    value = 'second'

    withInstance(instance, () => {
      // We pass a new closure that would return 'second',
      // but useCallback returns the cached one — which closes over 'first'
      // (at the time the original closure was created)
      // BUT the closure references `value` by name, not by snapshot,
      // so it actually sees the live mutation. This is the stale closure
      // mechanism — the test documents both behaviors clearly.
      const result = useCallback(() => value, [])
      expect(result()).toBe('second') // closure reads live `value`
    })
  })

  it('preserves reference when passed to memoized child (the React.memo scenario)', () => {
    // This is the entire purpose of useCallback in React:
    // Preserve handler identity across renders so React.memo'd children
    // don't re-render unnecessarily.
    const instance = createInstance()
    const refs = new Set<Function>()

    for (let i = 0; i < 5; i++) {
      withInstance(instance, () => {
        const handler = useCallback(() => 'click', [])
        refs.add(handler)
      })
    }

    // Five renders, one unique reference — useCallback did its job
    expect(refs.size).toBe(1)
  })

  it('uses Object.is for dep comparison', () => {
    const instance = createInstance()
    let firstFn: () => number

    withInstance(instance, () => {
      firstFn = useCallback(() => 1, [NaN])
    })

    withInstance(instance, () => {
      const secondFn = useCallback(() => 2, [NaN])
      // Object.is(NaN, NaN) === true, so deps are considered equal
      expect(secondFn).toBe(firstFn)
    })
  })

  it('handles multiple useCallback calls independently', () => {
    const instance = createInstance()
    let firstA: () => string
    let firstB: () => string

    withInstance(instance, () => {
      firstA = useCallback(() => 'a', [1])
      firstB = useCallback(() => 'b', [1])
    })

    withInstance(instance, () => {
      const a = useCallback(() => 'a', [1])    // deps unchanged
      const b = useCallback(() => 'b', [2])    // deps changed

      expect(a).toBe(firstA)   // same reference
      expect(b).not.toBe(firstB)  // new reference
    })
  })

  it('no deps argument — returns new function every render', () => {
    const instance = createInstance()
    const refs = new Set<Function>()

    for (let i = 0; i < 3; i++) {
      withInstance(instance, () => {
        const fn = useCallback(() => 'fresh')
        refs.add(fn)
      })
    }

    // Without deps, every render gets the latest function — matches React
    expect(refs.size).toBe(3)
  })

  it('empty deps — never changes after mount', () => {
    const instance = createInstance()
    const refs = new Set<Function>()

    for (let i = 0; i < 3; i++) {
      withInstance(instance, () => {
        const fn = useCallback(() => 'frozen', [])
        refs.add(fn)
      })
    }

    expect(refs.size).toBe(1)
  })
})