import { describe, it, expect, vi } from 'vitest'
import {
  useTransition,
  useDeferredValue,
  useInsertionEffect,
  useDebugValue,
} from '../src/hooks/noop-hooks'
import { createInstance, withInstance, flushLayoutEffects } from '../src/instance'

describe('useTransition', () => {
  it('returns a tuple of [isPending getter, startTransition function]', () => {
    const result = useTransition()
    expect(Array.isArray(result)).toBe(true)
    expect(typeof result[0]).toBe('function')
    expect(typeof result[1]).toBe('function')
  })

  it('isPending always returns false', () => {
    const [isPending] = useTransition()
    expect(isPending()).toBe(false)
  })

  it('startTransition runs the callback synchronously', () => {
    const spy = vi.fn()
    const [, startTransition] = useTransition()

    startTransition(spy)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('startTransition does not affect isPending in our implementation', () => {
    const [isPending, startTransition] = useTransition()

    expect(isPending()).toBe(false)
    startTransition(() => {
      // Even during the transition, isPending stays false
      expect(isPending()).toBe(false)
    })
    expect(isPending()).toBe(false)
  })
})

describe('useDeferredValue', () => {
  it('returns the input value unchanged', () => {
    expect(useDeferredValue(42)).toBe(42)
    expect(useDeferredValue('hello')).toBe('hello')
    expect(useDeferredValue(null)).toBe(null)
  })

  it('preserves reference identity for objects', () => {
    const obj = { count: 1 }
    expect(useDeferredValue(obj)).toBe(obj)
  })

  it('is a true pass-through — no deferral, no copying', () => {
    const arr = [1, 2, 3]
    const result = useDeferredValue(arr)
    expect(result).toBe(arr)             // same reference
    expect(result.length).toBe(3)
  })
})

describe('useInsertionEffect', () => {
  it('schedules the effect as a layout effect (runs synchronously before paint)', () => {
    const instance = createInstance()
    const spy = vi.fn()

    withInstance(instance, () => {
      useInsertionEffect(() => { spy('inserted') })
    })

    // Should not have run yet — same timing as useLayoutEffect
    expect(spy).not.toHaveBeenCalled()

    flushLayoutEffects(instance)
    expect(spy).toHaveBeenCalledWith('inserted')
  })

  it('respects the dep array — does not re-run when deps unchanged', () => {
    const instance = createInstance()
    const spy = vi.fn()

    withInstance(instance, () => {
      useInsertionEffect(() => spy(), [1])
    })
    flushLayoutEffects(instance)

    withInstance(instance, () => {
      useInsertionEffect(() => spy(), [1])
    })
    flushLayoutEffects(instance)

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('respects the dep array — re-runs when deps change', () => {
    const instance = createInstance()
    const spy = vi.fn()

    withInstance(instance, () => {
      useInsertionEffect(() => spy(), [1])
    })
    flushLayoutEffects(instance)

    withInstance(instance, () => {
      useInsertionEffect(() => spy(), [2])
    })
    flushLayoutEffects(instance)

    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('cleanup runs before next effect', () => {
    const instance = createInstance()
    const log: string[] = []

    withInstance(instance, () => {
      useInsertionEffect(() => {
        log.push('run-1')
        return () => log.push('cleanup-1')
      }, [1])
    })
    flushLayoutEffects(instance)

    withInstance(instance, () => {
      useInsertionEffect(() => {
        log.push('run-2')
        return () => log.push('cleanup-2')
      }, [2])
    })
    flushLayoutEffects(instance)

    expect(log).toEqual(['run-1', 'cleanup-1', 'run-2'])
  })
})

describe('useDebugValue', () => {
  it('is a no-op — does not throw or return anything observable', () => {
    expect(useDebugValue('label')).toBeUndefined()
    expect(useDebugValue(42, (v) => `value: ${v}`)).toBeUndefined()
    expect(useDebugValue({ complex: 'object' })).toBeUndefined()
  })

  it('the formatter is never called', () => {
    const formatter = vi.fn()
    useDebugValue(42, formatter)
    expect(formatter).not.toHaveBeenCalled()
  })
})