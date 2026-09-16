import { afterEach, expect, it, vi } from 'vitest'
import { transformSync } from '@babel/core'
import plugin from '@rrjs/babel-plugin'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { h, mount, choose } from '@rrjs/renderer'
import { derive, useState } from '@rrjs/react-compat'
import { captureRuntime, assertArchitecture, assertNoReactiveWork } from '../../../scripts/acceptance/gates.mjs'

const disposers: Array<() => Promise<void>> = []
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
afterEach(async () => { for (const dispose of disposers.splice(0)) await dispose() })

function compile(source: string, native = false): string {
  return transformSync(source, {
    plugins: native ? [] : [[plugin, { runOnce: true, injectImports: false }]],
    presets: native ? [['@babel/preset-react', { runtime: 'classic', pragma: 'h' }]] : [],
    configFile: false, babelrc: false,
  })!.code!
}

it('preserves function-valued state through the unchanged-source compiler path', async () => {
  const source = `function App() {
    entered();
    const [value, setValue] = useState(() => initial);
    return <div><button onClick={() => setValue(() => replacement)}>replace</button><output>{value.name}</output></div>;
  }`
  const traces: string[][] = []
  for (const native of [true, false]) {
    const invoked = vi.fn()
    function initial() { invoked() }
    function replacement() { invoked() }
    const entered = vi.fn()
    const App = new Function('choose', 'h', 'useState', 'derive', 'entered', 'initial', 'replacement', `${compile(source, native)}; return App`)(choose, native ? React.createElement : h, native ? React.useState : useState, derive, entered, initial, replacement)
    const host = document.createElement('div')
    const root = native ? createRoot(host) : null
    const capture = native ? null : captureRuntime()
    let dispose = () => {}
    try {
      await React.act(async () => {
        if (root) { root.render(React.createElement(App)); dispose = () => root.unmount() }
        else dispose = mount(App, host)
      })
      const button = host.querySelector('button')!
      const output = host.querySelector('output')!
      const values = [output.textContent!]
      await React.act(async () => button.click())
      values.push(output.textContent!)
      expect(host.querySelector('output')).toBe(output)
      expect(host.querySelector('button')).toBe(button)
      expect(invoked).not.toHaveBeenCalled()
      await React.act(async () => dispose())
      dispose = () => {}
      if (capture) {
        assertArchitecture(capture.events, { bodyExecutions: entered.mock.calls.length })
        const end = capture.events.length
        button.click()
        assertNoReactiveWork(capture.events, end)
        expect(host.textContent).toBe('')
      }
      traces.push(values)
    } finally {
      await React.act(async () => dispose())
      capture?.stop()
    }
  }
  expect(traces[1]).toEqual(traces[0])
  expect(traces[1]).toEqual(['initial', 'replacement'])
})

it('updates unchanged state arithmetic and derived locals while executing the component once', async () => {
  const source = `function App() {
    entered();
    const [count, setCount] = useState(0);
    const alias = count;
    const doubled = alias * 2;
    const label = doubled > 2 ? 'large' : 'small';
    return <div><button onClick={() => { setCount(count + 1); setCount(count + 1); }}>add</button>
      <output>{count}:{doubled}:{label}</output><aside>{count > 0 ? <input/> : null}</aside></div>;
  }`
  const traces: string[][] = []
  for (const native of [true, false]) {
    const entered = vi.fn()
    const forbiddenReconciler = vi.fn(() => { throw new Error('Keyed reconciler called') })
    const code = compile(source, native)
    const App = new Function('choose', 'h', 'useState', 'derive', 'entered', 'list', `${code}; return App`)(choose, native ? React.createElement : h, native ? React.useState : useState, derive, entered, forbiddenReconciler)
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = native ? createRoot(host) : null
    let dispose: () => void
    await React.act(async () => { if (root) { root.render(React.createElement(App)); dispose = () => root.unmount() } else dispose = mount(App, host) })
    disposers.push(async () => { await React.act(async () => dispose()); host.remove() })
    const button = host.querySelector('button')!
    const output = host.querySelector('output')!
    const values = [output.textContent!]
    let retainedInput: HTMLInputElement | null = null
    for (let i = 0; i < 3; i++) {
      await React.act(async () => button.click())
      values.push(output.textContent!)
      expect(host.querySelector('button')).toBe(button)
      expect(host.querySelector('output')).toBe(output)
      if (i === 0) { retainedInput = host.querySelector('input')!; retainedInput.value = 'typed' }
      else { expect(host.querySelector('input')).toBe(retainedInput); expect(retainedInput!.value).toBe('typed') }
    }
    if (!native) { expect(entered).toHaveBeenCalledTimes(1); expect(forbiddenReconciler).not.toHaveBeenCalled(); expect(code).not.toMatch(/\blist\s*\(/) }
    traces.push(values)
  }
  expect(traces[1]).toEqual(traces[0])
  expect(traces[1]).toEqual(['0:0:small', '1:2:small', '2:4:large', '3:6:large'])
})

it('rejects unproven lists and effect forms instead of silently using a different architecture', () => {
  expect(() => compile(`function App(){ const [items] = useState([]); return <ul>{items.map(item => <li key={item.id}>{item.name}</li>)}</ul> }`)).toThrow(/runOnce:/)
  expect(() => compile(`function App(){ const [count] = useState(0); useEffect(() => {}); return <p>{count}</p> }`)).toThrow(/runOnce:/)
  expect(() => compile(`function App(){ const [count] = useState(0); if(count) { performWork(); return <p>yes</p>; } return <p>no</p> }`)).toThrow(/runOnce:/)
  expect(() => compile(`function App(){ const [count] = React.useState(0); return <p>{count}</p> }`)).toThrow(/namespace/)
  expect(() => compile(`function App(){ const [count] = useState(0); const handler=()=>alert(count); expose(handler); return <p>{count}</p> }`)).toThrow(/escaping/)
})

it('disposes compiler-created derivations when their component is unmounted', async () => {
  let set: (n: number) => void = () => {}
  const evaluate = vi.fn()
  const code = compile(`function App(){ const [n, setN] = useState(1); expose(setN); const doubled = n * 2; return <output>{doubled}</output> }`)
  const App = new Function('choose', 'h', 'useState', 'derive', 'expose', `${code}; return App`)(choose, h, useState, (fn: () => any) => derive(() => { evaluate(); return fn() }), (setter: typeof set) => { set = setter })
  const host = document.createElement('div')
  const dispose = mount(App, host)
  expect(host.textContent).toBe('2')
  set(2)
  expect(host.textContent).toBe('4')
  dispose()
  const before = evaluate.mock.calls.length
  set(3)
  expect(evaluate).toHaveBeenCalledTimes(before)
  expect(host.textContent).toBe('')
})
