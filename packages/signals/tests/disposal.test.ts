import { describe, expect, it, vi } from 'vitest'
import { batch, computed, createSignal, effect } from '../src/index'

describe('effect disposal', () => {
  it.each([effect, computed])('releases subscriptions when initial computation throws (%#)', factory => {
    const [value, setValue] = createSignal(0)
    const failure = new Error('initial computation failed')
    const read = vi.fn(() => { value(); throw failure })
    expect(() => factory(read)).toThrow(failure)
    expect(() => setValue(1)).not.toThrow()
    expect(read).toHaveBeenCalledTimes(1)
    const observed: number[] = []
    const dispose = effect(() => { observed.push(value()) })
    setValue(2)
    dispose()
    setValue(3)
    expect(observed).toEqual([1, 2])
  })
  it('disposes computed subscriptions and preserves function-valued results', () => {
    const [n, setN] = createSignal(1)
    const value = vi.fn()
    const factory = vi.fn(() => { n(); return value })
    const result = computed(factory)
    expect(result()).toBe(value)
    expect(value).not.toHaveBeenCalled()
    setN(2)
    expect(factory).toHaveBeenCalledTimes(2)
    result.dispose()
    result.dispose()
    setN(3)
    expect(factory).toHaveBeenCalledTimes(2)
  })
  it('cancels an effect queued inside a batch', () => {
    const [value, setValue] = createSignal(0)
    const read = vi.fn(() => { value() })
    const dispose = effect(read)
    read.mockClear()
    batch(() => {
      setValue(1)
      dispose()
    })
    setValue(2)
    expect(read).not.toHaveBeenCalled()
  })

  it('skips a subscriber disposed earlier in the same flush', () => {
    const [value, setValue] = createSignal(0)
    let disposeLater = () => {}
    const disposeFirst = effect(() => { if (value()) disposeLater() })
    const read = vi.fn(() => { value() })
    disposeLater = effect(read)
    read.mockClear()
    setValue(1)
    expect(read).not.toHaveBeenCalled()
    disposeFirst()
  })

  it('runs cleanup once when disposal is repeated', () => {
    const cleanup = vi.fn()
    const dispose = effect(() => cleanup)
    dispose()
    dispose()
    expect(cleanup).toHaveBeenCalledTimes(1)
  })
})
