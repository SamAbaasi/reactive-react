import { describe, it, expect } from 'vitest'
import { createInstance, withInstance } from '../src/instance'
import {
  createContext,
  withProvider,
  pushContext,
  popContext,
} from '../src/context'
import { useContext } from '../src/hooks/useContext'

describe('createContext', () => {
  it('returns a context object with id, default, and Provider', () => {
    const ctx = createContext('default')

    expect(typeof ctx._id).toBe('symbol')
    expect(ctx._defaultValue).toBe('default')
    expect(typeof ctx.Provider).toBe('function')
  })

  it('each createContext call returns a unique id', () => {
    const a = createContext(0)
    const b = createContext(0)

    // Same initial value, different identity
    expect(a._id).not.toBe(b._id)
  })
})

describe('useContext', () => {
  it('returns the default value when no Provider is mounted', () => {
    const ThemeContext = createContext('light')
    const instance = createInstance()

    withInstance(instance, () => {
      const value = useContext(ThemeContext)
      expect(value).toBe('light')
    })
  })

  it('returns the provided value inside a Provider scope', () => {
    const ThemeContext = createContext('light')
    const instance = createInstance()

    withProvider(ThemeContext, 'dark', () => {
      withInstance(instance, () => {
        const value = useContext(ThemeContext)
        expect(value).toBe('dark')
      })
    })
  })

  it('restores the previous value after Provider scope ends', () => {
    const ThemeContext = createContext('light')
    const instance = createInstance()

    withProvider(ThemeContext, 'dark', () => {
      withInstance(instance, () => {
        expect(useContext(ThemeContext)).toBe('dark')
      })
    })

    // Outside the provider scope, default is restored
    withInstance(instance, () => {
      expect(useContext(ThemeContext)).toBe('light')
    })
  })

  it('nested Providers — inner overrides outer', () => {
    const ThemeContext = createContext('light')
    const instance = createInstance()

    withProvider(ThemeContext, 'outer', () => {
      withInstance(instance, () => {
        expect(useContext(ThemeContext)).toBe('outer')
      })

      withProvider(ThemeContext, 'inner', () => {
        withInstance(instance, () => {
          expect(useContext(ThemeContext)).toBe('inner')
        })
      })

      // Back to outer after inner scope ends
      withInstance(instance, () => {
        expect(useContext(ThemeContext)).toBe('outer')
      })
    })
  })

  it('multiple contexts are independent', () => {
    const ThemeContext = createContext('light')
    const LocaleContext = createContext('en')
    const instance = createInstance()

    withProvider(ThemeContext, 'dark', () => {
      withProvider(LocaleContext, 'fr', () => {
        withInstance(instance, () => {
          expect(useContext(ThemeContext)).toBe('dark')
          expect(useContext(LocaleContext)).toBe('fr')
        })
      })

      // LocaleContext popped, ThemeContext still pushed
      withInstance(instance, () => {
        expect(useContext(ThemeContext)).toBe('dark')
        expect(useContext(LocaleContext)).toBe('en')
      })
    })
  })

  it('does not allocate a hookIndex slot', () => {
    // useContext doesn't store anything per-component. Calling it many times
    // should not consume hook slots that useState/useMemo etc. depend on.
    const ThemeContext = createContext('light')
    const instance = createInstance()

    withProvider(ThemeContext, 'dark', () => {
      withInstance(instance, () => {
        // Call useContext many times, then a positional hook
        useContext(ThemeContext)
        useContext(ThemeContext)
        useContext(ThemeContext)

        // hookIndex should still be 0 — useContext didn't consume a slot
        expect(instance.hookIndex).toBe(0)
      })
    })
  })

  it('survives throws inside Provider scope', () => {
    const ThemeContext = createContext('light')
    const instance = createInstance()

    try {
      withProvider(ThemeContext, 'dark', () => {
        throw new Error('boom')
      })
    } catch (e) {
      // expected
    }

    // Stack should be cleaned up — back to default
    withInstance(instance, () => {
      expect(useContext(ThemeContext)).toBe('light')
    })
  })

  it('pushContext and popContext work directly', () => {
    const ThemeContext = createContext('light')
    const instance = createInstance()

    pushContext(ThemeContext._id, 'manual')

    withInstance(instance, () => {
      expect(useContext(ThemeContext)).toBe('manual')
    })

    popContext(ThemeContext._id)

    withInstance(instance, () => {
      expect(useContext(ThemeContext)).toBe('light')
    })
  })
})