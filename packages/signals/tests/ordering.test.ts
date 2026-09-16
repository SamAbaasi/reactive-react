import { describe, expect, it } from 'vitest'
import { batch, computed, createSignal, effect } from '../src/index'

function fifoFanOutChain(): string[] {
  const pending = new Set<string>()
  pending.add('first')
  pending.add('direct')
  const ran: string[] = []
  while (pending.size > 0) {
    const name = pending.values().next().value!
    pending.delete(name)
    ran.push(name)
    if (name === 'first') pending.add('chained')
  }
  return ran
}

describe('derived flush order', () => {
  it('runs a chain before a later sibling that shares the same source', () => {
    const order: string[] = []
    const [n, setN] = createSignal(0)
    const first = computed(() => { order.push('first'); return n() })
    const chained = computed(() => { order.push('chained'); return first() })
    const direct = computed(() => { order.push('direct'); return n() })
    const seen: Array<[number, number, number]> = []
    const dispose = effect(() => { seen.push([first(), chained(), direct()]) })
    try {
      expect(order).toEqual(['first', 'chained', 'direct'])
      expect(seen).toEqual([[0, 0, 0]])
      order.length = 0
      seen.length = 0
      setN(1)
      expect(order).toEqual(['first', 'chained', 'direct'])
      expect(order).not.toEqual(['first', 'direct', 'chained'])
      expect(seen).toEqual([[1, 1, 1]])
    } finally {
      dispose(); first.dispose(); chained.dispose(); direct.dispose()
    }
  })

  it('catches the previous pendingDerived FIFO drain as a negative control', () => {
    expect(fifoFanOutChain()).toEqual(['first', 'direct', 'chained'])
    const order: string[] = []
    const [n, setN] = createSignal(0)
    const first = computed(() => { order.push('first'); return n() })
    const chained = computed(() => { order.push('chained'); return first() })
    const direct = computed(() => { order.push('direct'); return n() })
    const dispose = effect(() => { first(); chained(); direct() })
    try {
      order.length = 0
      setN(1)
      expect(order).not.toEqual(fifoFanOutChain())
      expect(order).toEqual(['first', 'chained', 'direct'])
    } finally {
      dispose(); first.dispose(); chained.dispose(); direct.dispose()
    }
  })

  it('keeps a diamond glitch-free while still running the chain before the later sibling', () => {
    const order: string[] = []
    const [n, setN] = createSignal(1)
    const first = computed(() => { order.push('first'); return n() })
    const chained = computed(() => { order.push('chained'); return first() * 2 })
    const direct = computed(() => { order.push('direct'); return n() * 10 })
    const mix = computed(() => { order.push('mix'); return chained() + direct() })
    const seen: Array<[number, number, number]> = []
    const dispose = effect(() => { seen.push([chained(), direct(), mix()]) })
    try {
      order.length = 0
      seen.length = 0
      setN(2)
      expect(order).toEqual(['first', 'chained', 'direct', 'mix'])
      expect(seen).toEqual([[4, 20, 24]])
    } finally {
      dispose(); first.dispose(); chained.dispose(); direct.dispose(); mix.dispose()
    }
  })

  it('batches two sources into one creation-ordered derived flush', () => {
    const order: string[] = []
    const [x, setX] = createSignal(0)
    const [y, setY] = createSignal(0)
    const first = computed(() => { order.push('first'); return x() })
    const chained = computed(() => { order.push('chained'); return first() + y() })
    const direct = computed(() => { order.push('direct'); return x() + y() })
    const seen: Array<[number, number]> = []
    const dispose = effect(() => { seen.push([chained(), direct()]) })
    try {
      order.length = 0
      seen.length = 0
      batch(() => { setX(1); setY(1) })
      expect(order).toEqual(['first', 'chained', 'direct'])
      expect(seen).toEqual([[2, 2]])
      expect(seen.some(([left, right]) => left !== right && (left === 1 || right === 1))).toBe(false)
    } finally {
      dispose(); first.dispose(); chained.dispose(); direct.dispose()
    }
  })

  it('drains remaining deriveds in creation order after an upstream error', () => {
    const order: string[] = []
    const [n, setN] = createSignal(0)
    const failure = new Error('first failed')
    const first = computed(() => {
      order.push('first')
      if (n() === 1) throw failure
      return n()
    })
    const chained = computed(() => { order.push('chained'); return first() })
    const direct = computed(() => { order.push('direct'); return n() })
    const seen: number[] = []
    const dispose = effect(() => {
      try { first() } catch {}
      try { chained() } catch {}
      seen.push(direct())
    })
    try {
      order.length = 0
      let caught: unknown
      try { setN(1) } catch (error) { caught = error }
      expect(caught).toBeInstanceOf(AggregateError)
      expect((caught as AggregateError).errors).toEqual([failure, failure])
      expect(order).toEqual(['first', 'chained', 'direct'])
      expect(seen).toEqual([0, 1])
      order.length = 0
      setN(2)
      expect(order).toEqual(['first', 'chained', 'direct'])
      expect(seen).toEqual([0, 1, 2])
    } finally {
      dispose(); first.dispose(); chained.dispose(); direct.dispose()
    }
  })

  it('does not rerun a chained derived when equality suppresses the parent write', () => {
    const order: string[] = []
    const [n, setN] = createSignal(1)
    const first = computed(() => { order.push('first'); return n() > 0 })
    const chained = computed(() => { order.push('chained'); return first() })
    const direct = computed(() => { order.push('direct'); return n() })
    const dispose = effect(() => { first(); chained(); direct() })
    try {
      order.length = 0
      setN(2)
      expect(order).toEqual(['first', 'direct'])
      expect(order).not.toContain('chained')
    } finally {
      dispose(); first.dispose(); chained.dispose(); direct.dispose()
    }
  })

  it('does no derived work after the graph is disposed', () => {
    const order: string[] = []
    const [n, setN] = createSignal(0)
    const first = computed(() => { order.push('first'); return n() })
    const chained = computed(() => { order.push('chained'); return first() })
    const direct = computed(() => { order.push('direct'); return n() })
    const dispose = effect(() => { first(); chained(); direct() })
    dispose(); first.dispose(); chained.dispose(); direct.dispose()
    order.length = 0
    setN(1)
    expect(order).toEqual([])
  })
})
