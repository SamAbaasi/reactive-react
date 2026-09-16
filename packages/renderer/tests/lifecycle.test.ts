import { expect, it, vi } from 'vitest'
import { createSignal } from '@rrjs/signals'
import { derive, getCurrentInstance, useEffect, useLayoutEffect, useRef } from '@rrjs/react-compat'
import { h, mount } from '../src/index'
import { captureRuntime, assertArchitecture, assertNoReactiveWork } from '../../../scripts/acceptance/gates.mjs'

it('disposes detached bindings when evaluating a new branch fails', () => {
  const [visible, setVisible] = createSignal(false)
  const [value, setValue] = createSignal(0)
  const binding = vi.fn(() => String(value()))
  const host = document.createElement('div')
  const capture = captureRuntime()
  const dispose = mount(() => h('section', null, () => {
    if (!visible()) return 'previous'
    h('span', { title: binding })
    throw new Error('branch evaluation')
  }), host)
  try {
    expect(() => setVisible(true)).toThrow('branch evaluation')
    expect(binding).toHaveBeenCalledTimes(1)
    setValue(1)
    expect(binding).toHaveBeenCalledTimes(1)
    expect(host.textContent).toBe('previous')
    setVisible(false)
    dispose()
    assertArchitecture(capture.events)
  } finally { capture.stop() }
})

it('releases a new branch after commit failure and recovers on a later selection', () => {
  const [visible, setVisible] = createSignal(false)
  const [value, setValue] = createSignal(0)
  const host = document.createElement('div')
  const capture = captureRuntime()
  const cleanup = vi.fn()
  function Child() {
    derive(() => value())
    useLayoutEffect(() => cleanup, [])
    useLayoutEffect(() => { throw new Error('branch commit') }, [])
    return h('span', null, () => value())
  }
  const dispose = mount(() => h('section', null, () => visible() ? h(Child, null) : 'empty'), host)
  try {
    expect(() => setVisible(true)).toThrow('branch commit')
    expect(host.querySelector('span')).toBeNull()
    expect(cleanup).toHaveBeenCalledTimes(1)
    const end = capture.events.length
    setValue(1)
    assertNoReactiveWork(capture.events, end)
    setVisible(false)
    expect(host.textContent).toBe('empty')
    dispose()
    assertArchitecture(capture.events, { instances: 2 })
  } finally { capture.stop() }
})

it('releases a mounted tree when layout commit fails and cancels pending passive work', async () => {
  const [value, setValue] = createSignal(0)
  const cleanup = vi.fn()
  const passive = vi.fn()
  const failure = new Error('layout failed')
  const host = document.createElement('div')
  const capture = captureRuntime()
  try {
    expect(() => mount(() => {
      derive(() => value() * 2)
      useLayoutEffect(() => cleanup, [])
      useLayoutEffect(() => { throw failure }, [])
      useEffect(passive, [])
      return h('output', null, () => value())
    }, host)).toThrow(failure)
    expect(host.childNodes).toHaveLength(0)
    expect(cleanup).toHaveBeenCalledTimes(1)
    assertArchitecture(capture.events)
    const end = capture.events.length
    setValue(1)
    await flushPassive()
    assertNoReactiveWork(capture.events, end)
    expect(passive).not.toHaveBeenCalled()
  } finally { capture.stop() }
})

it('completes branch replacement after old-branch cleanup throws', () => {
  const [visible, setVisible] = createSignal(true)
  const [value, setValue] = createSignal(0)
  const cleanup = vi.fn().mockImplementationOnce(() => { throw new Error('branch cleanup') })
  const host = document.createElement('div')
  const capture = captureRuntime()
  function Child() {
    getCurrentInstance().cleanup.push(cleanup)
    derive(() => value() + 1)
    return h('span', null, () => value())
  }
  const dispose = mount(() => h('section', null, () => visible() ? h(Child, null) : h('output', null, () => value())), host)
  try {
    expect(() => setVisible(false)).toThrow('branch cleanup')
    expect(host.querySelector('span')).toBeNull()
    expect(host.querySelector('output')?.textContent).toBe('0')
    setValue(1)
    expect(host.querySelector('output')?.textContent).toBe('1')
    setVisible(true)
    expect(host.querySelector('span')?.textContent).toBe('1')
    dispose()
    assertArchitecture(capture.events, { instances: 3 })
    const end = capture.events.length
    setValue(2)
    assertNoReactiveWork(capture.events, end)
  } finally { capture.stop() }
})

it('reports multiple cleanup failures after releasing hooks, derivations and DOM', () => {
  const [value, setValue] = createSignal(0)
  const hookFailure = new Error('hook cleanup')
  const ownerFailure = new Error('owner cleanup')
  const hookCleanup = vi.fn(() => { throw hookFailure })
  const ownerCleanup = vi.fn(() => { throw ownerFailure })
  const host = document.createElement('div')
  const capture = captureRuntime()
  const dispose = mount(() => {
    useLayoutEffect(() => hookCleanup, [])
    getCurrentInstance().cleanup.push(ownerCleanup)
    derive(() => value() + 1)
    return h('output', null, () => value())
  }, host)
  try {
    let caught: unknown
    try { dispose() } catch (error) { caught = error }
    expect(caught).toBeInstanceOf(AggregateError)
    expect((caught as AggregateError).errors).toEqual([hookFailure, ownerFailure])
    expect(host.childNodes).toHaveLength(0)
    dispose()
    expect(hookCleanup).toHaveBeenCalledTimes(1)
    expect(ownerCleanup).toHaveBeenCalledTimes(1)
    assertArchitecture(capture.events)
    const end = capture.events.length
    setValue(1)
    assertNoReactiveWork(capture.events, end)
  } finally { capture.stop() }
})

it.each([false, true])('tears down all resources after a cleanup throws (array root: %s)', arrayRoot => {
  const [value, setValue] = createSignal(0)
  const failure = new Error('owner cleanup failed')
  const cleanup = vi.fn(() => { throw failure })
  const entered = vi.fn()
  const capture = captureRuntime()
  const host = document.createElement('div')
  function Child() {
    entered()
    getCurrentInstance().cleanup.push(cleanup)
    derive(() => value() * 2)
    return h('span', null, () => value())
  }
  function App() {
    entered()
    derive(() => value() + 1)
    const children = [h(Child, null), h('output', null, () => value())]
    return arrayRoot ? children : h('section', null, ...children)
  }
  const dispose = mount(App, host)
  try {
    expect(dispose).toThrow(failure)
    expect(host.childNodes).toHaveLength(0)
    expect(dispose).not.toThrow()
    expect(cleanup).toHaveBeenCalledTimes(1)
    assertArchitecture(capture.events, { instances: 2, bodyExecutions: entered.mock.calls.length })
    const end = capture.events.length
    setValue(1)
    assertNoReactiveWork(capture.events, end)
  } finally { capture.stop() }
})

it('disposes derivations and detached child bindings after component construction fails', async () => {
  const [value, setValue] = createSignal(0)
  const derived = vi.fn(() => value() * 2)
  const attribute = vi.fn(() => String(value()))
  const committed = vi.fn()
  const entered = vi.fn()
  function Child() {
    useEffect(committed, [])
    return h('span', { title: attribute }, 'detached')
  }
  function App() {
    entered()
    derive(derived)
    h(Child, null)
    throw new Error('construction failed')
  }
  const host = document.createElement('div')
  const capture = captureRuntime()
  try {
    expect(() => mount(App, host)).toThrow('construction failed')
    assertArchitecture(capture.events, { instances: 2 })
    const end = capture.events.length
    setValue(1)
    assertNoReactiveWork(capture.events, end)
  } finally { capture.stop() }
  expect(derived).toHaveBeenCalledTimes(1)
  expect(attribute).toHaveBeenCalledTimes(1)
  await flushPassive()
  expect(derived).toHaveBeenCalledTimes(1)
  expect(attribute).toHaveBeenCalledTimes(1)
  expect(entered).toHaveBeenCalledTimes(1)
  expect(committed).not.toHaveBeenCalled()
  expect(host.childNodes).toHaveLength(0)
  const dispose = mount(() => h('output', null, () => value()), host)
  setValue(2)
  expect(host.textContent).toBe('2')
  dispose()
})

it('owns effects and cleanup when a component returns a DocumentFragment', () => {
  const mounted = vi.fn()
  const cleanup = vi.fn()
  function App() {
    useLayoutEffect(() => { mounted(); return cleanup }, [])
    const fragment = document.createDocumentFragment()
    fragment.appendChild(document.createTextNode('fragment'))
    return fragment
  }
  const host = document.createElement('div')
  const dispose = mount(App, host)
  expect(host.textContent).toBe('fragment')
  expect(mounted).toHaveBeenCalledTimes(1)
  dispose()
  expect(host.textContent).toBe('')
  expect(cleanup).toHaveBeenCalledTimes(1)
})

it('normalizes nested component return arrays without dropping zero', () => {
  const host = document.createElement('div')
  const dispose = mount(() => ['start', [0, false, null, h('b', null, 'end')]], host)
  expect(host.textContent).toBe('start0end')
  dispose()
  expect(host.childNodes.length).toBe(0)
})

function flushPassive(): Promise<void> {
  return new Promise(resolve => {
    const channel = new MessageChannel()
    channel.port1.onmessage = () => {
      channel.port1.close()
      channel.port2.close()
      setTimeout(resolve, 0)
    }
    channel.port2.postMessage(null)
  })
}

it('runs layout effects after the component DOM is attached', () => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const states: boolean[] = []
  function Child() {
    const ref = useRef<HTMLElement | null>(null)
    useLayoutEffect(() => { states.push(ref.current!.isConnected) }, [])
    return h('span', { ref }, 'child')
  }
  const dispose = mount(() => h('section', null, h(Child, null)), host)
  expect(states).toEqual([true])
  dispose()
  host.remove()
})

it('cleans up every component when wrappers share a DOM root', () => {
  const inner = vi.fn()
  const outer = vi.fn()
  function Inner() {
    useLayoutEffect(() => inner, [])
    return h('div', null, 'shared root')
  }
  function Outer() {
    useLayoutEffect(() => outer, [])
    return h(Inner, null)
  }
  const dispose = mount(Outer, document.createElement('div'))
  dispose()
  dispose()
  expect(inner).toHaveBeenCalledTimes(1)
  expect(outer).toHaveBeenCalledTimes(1)
})

it('does not execute a queued passive effect after unmount', async () => {
  const run = vi.fn()
  function App() {
    useEffect(run, [])
    return h('span', null, 'x')
  }
  const dispose = mount(App, document.createElement('div'))
  dispose()
  await flushPassive()
  expect(run).not.toHaveBeenCalled()
})

it('commits effects for children inserted after initial mount', () => {
  const [visible, setVisible] = createSignal(false)
  const connected: boolean[] = []
  const cleanup = vi.fn()
  function Child() {
    const ref = useRef<HTMLElement | null>(null)
    useLayoutEffect(() => { connected.push(ref.current!.isConnected); return cleanup }, [])
    return h('span', { ref }, 'child')
  }
  const host = document.createElement('div')
  document.body.appendChild(host)
  const dispose = mount(() => h('div', null, () => visible() ? h(Child, null) : null), host)
  setVisible(true)
  expect(connected).toEqual([true])
  setVisible(false)
  expect(cleanup).toHaveBeenCalledTimes(1)
  dispose()
  host.remove()
})
