import { describe, it, expect, vi } from 'vitest'
import { createSignal } from '@rrjs/signals'
import { h, mount } from '../src/index'

describe('h()', () => {
  it('creates a DOM element with static text', () => {
    const el = h('div', null, 'Hello')
    expect(el.tagName).toBe('DIV')
    expect(el.textContent).toBe('Hello')
  })

  it('creates an element with static attributes', () => {
    const el = h('div', { id: 'main', className: 'box' })
    expect(el.id).toBe('main')
    expect(el.className).toBe('box')
  })

  it('creates nested elements', () => {
    const el = h('div', null, h('span', null, 'inner'))
    expect(el.firstChild?.nodeName).toBe('SPAN')
    expect(el.firstChild?.textContent).toBe('inner')
  })

  it('attaches event handlers', () => {
    const spy = vi.fn()
    const el = h('button', { onClick: spy }, 'click me')
    el.click()
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('reactive bindings', () => {
  it('updates text when a signal changes — without re-running the component', () => {
    const [count, setCount] = createSignal(0)

    // The component function will track how many times it runs
    const componentRuns = vi.fn()

    function Counter() {
      componentRuns()
      return h('span', null, () => count())  // thunk subscribes to count
    }

    const container = document.createElement('div')
    mount(Counter, container)

    expect(container.textContent).toBe('0')
    expect(componentRuns).toHaveBeenCalledTimes(1)

    setCount(1)
    expect(container.textContent).toBe('1')

    setCount(42)
    expect(container.textContent).toBe('42')

    // Critical: the component function ran ONCE on mount, never again.
    // This is the entire point of the signal model.
    expect(componentRuns).toHaveBeenCalledTimes(1)
  })

  it('updates an attribute when a signal changes', () => {
    const [cls, setCls] = createSignal('on')

    const el = h('div', { className: () => cls() })
    expect(el.className).toBe('on')

    setCls('off')
    expect(el.className).toBe('off')
  })

  it('handles a full counter component with click', () => {
    const [count, setCount] = createSignal(0)

    function Counter() {
      return h('button',
        { onClick: () => setCount(count() + 1) },
        () => `Count: ${count()}`
      )
    }

    const container = document.createElement('div')
    mount(Counter, container)

    const button = container.querySelector('button')!
    expect(button.textContent).toBe('Count: 0')

    button.click()
    expect(button.textContent).toBe('Count: 1')

    button.click()
    button.click()
    button.click()
    expect(button.textContent).toBe('Count: 4')
  })

  it('multiple signals update independently in the same component', () => {
    const [a, setA] = createSignal(1)
    const [b, setB] = createSignal(2)

    function Component() {
      return h('div', null,
        h('span', { id: 'a' }, () => a()),
        h('span', { id: 'b' }, () => b()),
      )
    }

    const container = document.createElement('div')
    mount(Component, container)

    const spanA = container.querySelector('#a')!
    const spanB = container.querySelector('#b')!

    expect(spanA.textContent).toBe('1')
    expect(spanB.textContent).toBe('2')

    setA(10)
    expect(spanA.textContent).toBe('10')
    expect(spanB.textContent).toBe('2')  // b unchanged

    setB(20)
    expect(spanA.textContent).toBe('10') // a unchanged
    expect(spanB.textContent).toBe('20')
  })
})