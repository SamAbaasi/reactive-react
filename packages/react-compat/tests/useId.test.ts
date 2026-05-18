import { describe, it, expect, beforeEach } from 'vitest'
import { createInstance, withInstance } from '../src/instance'
import { useId, _resetIdCounter } from '../src/hooks/useId'

describe('useId', () => {
  beforeEach(() => {
    _resetIdCounter()
  })

  it('returns a string', () => {
    const instance = createInstance()

    withInstance(instance, () => {
      const id = useId()
      expect(typeof id).toBe('string')
    })
  })

  it('returns an id matching the :rN: format', () => {
    const instance = createInstance()

    withInstance(instance, () => {
      const id = useId()
      // Matches React's id format: :r0:, :r1:, ...
      expect(id).toMatch(/^:r[a-z0-9]+:$/)
    })
  })

  it('generates a fresh id on first render', () => {
    const instance = createInstance()

    withInstance(instance, () => {
      const id = useId()
      expect(id).toBe(':r0:')
    })
  })

  it('returns the SAME id on subsequent renders of the same instance', () => {
    const instance = createInstance()
    let firstId!: string

    withInstance(instance, () => {
      firstId = useId()
    })

    withInstance(instance, () => {
      const secondId = useId()
      // Same instance, same hookIndex slot — same id
      expect(secondId).toBe(firstId)
    })
  })

  it('generates UNIQUE ids across different instances', () => {
    const a = createInstance()
    const b = createInstance()
    const c = createInstance()
    const ids = new Set<string>()

    withInstance(a, () => ids.add(useId()))
    withInstance(b, () => ids.add(useId()))
    withInstance(c, () => ids.add(useId()))

    // Three distinct ids — no collisions
    expect(ids.size).toBe(3)
  })

  it('supports multiple useId calls in one component', () => {
    const instance = createInstance()

    withInstance(instance, () => {
      const a = useId()
      const b = useId()
      const c = useId()

      // All three are different
      expect(a).not.toBe(b)
      expect(b).not.toBe(c)
      expect(a).not.toBe(c)
    })
  })

  it('persists each id slot independently across renders', () => {
    const instance = createInstance()
    let firstA!: string
    let firstB!: string

    withInstance(instance, () => {
      firstA = useId()
      firstB = useId()
    })

    withInstance(instance, () => {
      const a = useId()
      const b = useId()
      expect(a).toBe(firstA)
      expect(b).toBe(firstB)
    })
  })

  it('counter advances sequentially with toString(36)', () => {
    const instance = createInstance()
    const ids: string[] = []

    // Generate ids across multiple instances to see the counter progression
    for (let i = 0; i < 5; i++) {
      const inst = createInstance()
      withInstance(inst, () => {
        ids.push(useId())
      })
    }

    expect(ids).toEqual([':r0:', ':r1:', ':r2:', ':r3:', ':r4:'])
  })

  it('ids are usable as DOM attribute values', () => {
    const instance = createInstance()

    withInstance(instance, () => {
      const id = useId()

      // Create an element and use the id as a DOM attribute
      const input = document.createElement('input')
      input.id = id

      const label = document.createElement('label')
      label.setAttribute('for', id)

      // The browser accepts the id format without throwing
      expect(input.id).toBe(id)
      expect(label.getAttribute('for')).toBe(id)
    })
  })
})