import { afterEach, expect, it, vi } from 'vitest'
import { transformSync } from '@babel/core'
import plugin from '@rrjs/babel-plugin'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { h, mount, choose } from '@rrjs/renderer'
import { derive, useEffect, useState } from '@rrjs/react-compat'
import { assertArchitecture, assertNoReactiveWork, captureRuntime } from '../../../scripts/acceptance/gates.mjs'

const source = `function App() {
  entered();
  const [count, setCount] = useState(0);
  useEffect(() => {
    trace.push('effect:' + count);
    return () => trace.push('cleanup:' + count);
  }, []);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}`

const disposers: Array<() => Promise<void>> = []
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
afterEach(async () => { for (const dispose of disposers.splice(0)) await dispose() })

function compile(native: boolean, input = source): string {
  return transformSync(input, {
    plugins: native ? [] : [[plugin, { runOnce: true, injectImports: false }]],
    presets: native ? [['@babel/preset-react', { runtime: 'classic', pragma: 'h' }]] : [],
    configFile: false,
    babelrc: false,
  })!.code!
}

async function waitForTrace(trace: string[], length: number): Promise<void> {
  for (let attempt = 0; attempt < 20 && trace.length < length; attempt++) {
    await new Promise<void>(resolve => setTimeout(resolve, 5))
  }
  expect(trace).toHaveLength(length)
}

it('matches React mount and cleanup for identical-source useEffect(callback, [])', async () => {
  const traces: string[][] = []
  for (const native of [true, false]) {
    const trace: string[] = []
    const entered = vi.fn()
    const code = compile(native)
    const App = new Function('h', 'choose', 'derive', 'useEffect', 'useState', 'entered', 'trace', `${code}; return App`)(
      native ? React.createElement : h, choose, derive, native ? React.useEffect : useEffect,
      native ? React.useState : useState, entered, trace,
    )
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = native ? createRoot(host) : null
    const capture = native ? null : captureRuntime()
    let dispose = () => {}
    try {
      await React.act(async () => {
        if (root) { root.render(React.createElement(App)); dispose = () => root.unmount() }
        else dispose = mount(App, host)
      })
      await waitForTrace(trace, 1)
      expect(trace).toEqual(['effect:0'])
      const button = host.querySelector('button')!
      await React.act(async () => button.click())
      expect(host.querySelector('button')).toBe(button)
      expect(button.textContent).toBe('1')
      expect(trace).toEqual(['effect:0'])
      await React.act(async () => dispose())
      dispose = () => {}
      expect(trace).toEqual(['effect:0', 'cleanup:0'])
      if (capture) {
        expect(entered).toHaveBeenCalledTimes(1)
        assertArchitecture(capture.events, { bodyExecutions: 1 })
        const end = capture.events.length
        await new Promise<void>(resolve => setTimeout(resolve, 5))
        assertNoReactiveWork(capture.events, end)
      }
      traces.push(trace)
    } finally {
      await React.act(async () => dispose())
      capture?.stop()
      host.remove()
    }
  }

  expect(traces[1]).toEqual(traces[0])
})

it('cancels target passive work when unmounted before its queued flush (target invariant)', async () => {
  const trace: string[] = []
  const entered = vi.fn()
  const App = new Function('h', 'choose', 'derive', 'useEffect', 'useState', 'entered', 'trace', `${compile(false)}; return App`)(
    h, choose, derive, useEffect, useState, entered, trace,
  )
  const host = document.createElement('div')
  const capture = captureRuntime()
  const dispose = mount(App, host)
  dispose()
  const end = capture.events.length
  await new Promise<void>(resolve => setTimeout(resolve, 10))
  expect(trace).toEqual([])
  expect(entered).toHaveBeenCalledTimes(1)
  assertArchitecture(capture.events, { bodyExecutions: 1 })
  assertNoReactiveWork(capture.events, end)
  capture.stop()
})

it('matches React when an empty effect captures state declared later', async () => {
  const input = `function App() {
    useEffect(() => {
      trace.push('effect:' + count);
      return () => trace.push('cleanup:' + count);
    }, []);
    const [count] = useState(7);
    return <output>{count}</output>;
  }`
  const traces: string[][] = []
  for (const native of [true, false]) {
    const trace: string[] = []
    const code = compile(native, input)
    const App = new Function('h', 'useEffect', 'useState', 'trace', `${code}; return App`)(
      native ? React.createElement : h, native ? React.useEffect : useEffect,
      native ? React.useState : useState, trace,
    )
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = native ? createRoot(host) : null
    let dispose = () => {}
    try {
      await React.act(async () => {
        if (root) { root.render(React.createElement(App)); dispose = () => root.unmount() }
        else dispose = mount(App, host)
      })
      await waitForTrace(trace, 1)
      await React.act(async () => dispose())
      dispose = () => {}
      expect(trace).toEqual(['effect:7', 'cleanup:7'])
      traces.push(trace)
    } finally {
      await React.act(async () => dispose())
      host.remove()
    }
  }
  expect(traces[1]).toEqual(traces[0])
})

it('matches React cleanup order for multiple empty effects', async () => {
  const input = `function App() {
    const [count] = useState(0);
    useEffect(() => { trace.push('effect:A'); return () => trace.push('cleanup:A') }, []);
    useEffect(() => { trace.push('effect:B'); return () => trace.push('cleanup:B') }, []);
    return <output>{count}</output>;
  }`
  const traces: string[][] = []
  for (const native of [true, false]) {
    const trace: string[] = []
    const code = compile(native, input)
    const App = new Function('h', 'useEffect', 'useState', 'trace', `${code}; return App`)(
      native ? React.createElement : h, native ? React.useEffect : useEffect,
      native ? React.useState : useState, trace,
    )
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = native ? createRoot(host) : null
    let dispose = () => {}
    try {
      await React.act(async () => {
        if (root) { root.render(React.createElement(App)); dispose = () => root.unmount() }
        else dispose = mount(App, host)
      })
      await waitForTrace(trace, 2)
      await React.act(async () => dispose())
      dispose = () => {}
      expect(trace).toEqual(['effect:A', 'effect:B', 'cleanup:A', 'cleanup:B'])
      traces.push(trace)
    } finally {
      await React.act(async () => dispose())
      host.remove()
    }
  }
  expect(traces[1]).toEqual(traces[0])
})

it('matches React cleanup and setup when a direct state dependency changes', async () => {
  const input = `function App() {
    const [count, setCount] = useState(0);
    useEffect(() => {
      trace.push('effect:' + count);
      return () => trace.push('cleanup:' + count);
    }, [count]);
    return <button onClick={() => setCount(count + 1)}>{count}</button>;
  }`
  const traces: string[][] = []
  for (const native of [true, false]) {
    const trace: string[] = []
    const code = compile(native, input)
    const App = new Function('h', 'useEffect', 'useState', 'trace', `${code}; return App`)(
      native ? React.createElement : h, native ? React.useEffect : useEffect,
      native ? React.useState : useState, trace,
    )
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = native ? createRoot(host) : null
    let dispose = () => {}
    try {
      await React.act(async () => {
        if (root) { root.render(React.createElement(App)); dispose = () => root.unmount() }
        else dispose = mount(App, host)
      })
      await waitForTrace(trace, 1)
      await React.act(async () => host.querySelector('button')!.click())
      await waitForTrace(trace, 3)
      expect(trace).toEqual(['effect:0', 'cleanup:0', 'effect:1'])
      await React.act(async () => dispose())
      dispose = () => {}
      expect(trace).toEqual(['effect:0', 'cleanup:0', 'effect:1', 'cleanup:1'])
      traces.push(trace)
    } finally {
      await React.act(async () => dispose())
      host.remove()
    }
  }
  expect(traces[1]).toEqual(traces[0])
})

it('keeps unsupported effect forms outside the changing-dependency slice', () => {
  const compileCase = (body: string) => transformSync(`function App(){ const [count] = useState(0); ${body}; return <p>{count}</p> }`, {
    plugins: [[plugin, { runOnce: true, injectImports: false }]], configFile: false, babelrc: false,
  })
  expect(() => compileCase(`useEffect(effectCallback, [])`)).toThrow(/requires an inline callback/)
  // A dependency array that is not a literal cannot be read at compile time.
  expect(() => compileCase(`const deps=[count]; useEffect(() => {}, deps)`)).toThrow(/literal dependency array/)
  expect(() => compileCase(`useEffect(() => {}, [], 1)`)).toThrow(/callback and an optional dependency array/)
  // Omitting the array entirely is supported: the list is inferred from what
  // the callback reads, which for an empty callback is nothing.
  expect(() => compileCase(`useEffect(() => {})`)).not.toThrow()
})
