import { expect, it, vi } from 'vitest'
import { batch, computed, createSignal, effect, observeRuntime } from '../src/index'

it('propagates derived errors to reads and recovers downstream without publishing stale values', () => {
  const [value, setValue] = createSignal(0)
  const failure = new Error('derived failed')
  const derived = computed(() => { if (value() === 1) throw failure; return value() * 2 })
  const downstream = computed(() => derived() + 1)
  const seen: number[] = []
  const dispose = effect(() => { seen.push(downstream()) })
  try {
    expect(() => setValue(1)).toThrow()
    expect(derived).toThrow(failure)
    expect(downstream).toThrow(failure)
    expect(seen).toEqual([1])
    setValue(2)
    expect(seen).toEqual([1, 5])
    setValue(2)
    expect(seen).toEqual([1, 5])
  } finally { dispose(); downstream.dispose(); derived.dispose() }
  setValue(3)
  expect(seen).toEqual([1, 5])
})

it('preserves both the batch callback and flush errors and restores batching', () => {
  const [value, setValue] = createSignal(0)
  const callbackError = new Error('batch body')
  const flushError = new Error('batch flush')
  const dispose = effect(() => { if (value() === 1) throw flushError })
  try {
    let caught: unknown
    try { batch(() => { setValue(1); throw callbackError }) } catch (error) { caught = error }
    expect(caught).toBeInstanceOf(AggregateError)
    expect((caught as AggregateError).errors).toEqual([callbackError, flushError])
    setValue(2)
    expect(value()).toBe(2)
  } finally { dispose() }
})

it('finishes disposal and emits its lifetime event even when cleanup throws', () => {
  const events: string[] = []
  const stop = observeRuntime(event => events.push(event.kind))
  const [value, setValue] = createSignal(0)
  const failure = new Error('cleanup failed')
  const cleanup = vi.fn(() => { throw failure })
  const run = vi.fn(() => { value(); return cleanup })
  const dispose = effect(run)
  try {
    expect(dispose).toThrow(failure)
    expect(dispose).not.toThrow()
    setValue(1)
    expect(run).toHaveBeenCalledTimes(1)
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(events.filter(kind => kind === 'computation-dispose')).toHaveLength(1)
    expect(events.filter(kind => kind === 'subscription-remove')).toHaveLength(1)
  } finally { stop() }
})

it('does not repeat a throwing update cleanup at disposal', () => {
  const [value, setValue] = createSignal(0)
  const failure = new Error('update cleanup failed')
  const cleanup = vi.fn(() => { throw failure })
  const dispose = effect(() => { value(); return cleanup })
  expect(() => setValue(1)).toThrow(failure)
  expect(dispose).not.toThrow()
  expect(cleanup).toHaveBeenCalledTimes(1)
})

it('flushes independent queued subscribers before reporting update errors', () => {
  const [value, setValue] = createSignal(0)
  const first = new Error('first')
  const second = new Error('second')
  const disposeFirst = effect(() => { if (value() === 1) throw first })
  const disposeSecond = effect(() => { if (value() === 1) throw second })
  const seen: number[] = []
  const disposeLast = effect(() => { seen.push(value()) })
  try {
    let caught: unknown
    try { setValue(1) } catch (error) { caught = error }
    expect(seen).toEqual([0, 1])
    expect(caught).toBeInstanceOf(AggregateError)
    expect((caught as AggregateError).errors).toEqual([first, second])
    setValue(2)
    expect(seen).toEqual([0, 1, 2])
  } finally { disposeFirst(); disposeSecond(); disposeLast() }
})
