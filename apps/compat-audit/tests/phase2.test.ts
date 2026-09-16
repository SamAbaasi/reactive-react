import { expect, it, vi } from 'vitest'
import { transformSync } from '@babel/core'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import plugin from '@rrjs/babel-plugin'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import * as renderer from '@rrjs/renderer'
import { useState, derive } from '@rrjs/react-compat'
import { captureRuntime, assertArchitecture, assertNoReactiveWork } from '../../../scripts/acceptance/gates.mjs'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

it('compiles the unchanged production RunOnce source with its pure helper', () => {
  const source = readFileSync(resolve(process.cwd(), '../flip/src/RunOnce.tsx'), 'utf8')
  const code = transformSync(source, {
    filename: 'RunOnce.tsx',
    plugins: [[plugin, { runOnce: true }]],
    presets: ['@babel/preset-typescript'],
    configFile: false, babelrc: false,
  })!.code!

  expect(code).toMatch(/derive\(\(\) => isVisible\(count\(\)\)\)/)
})

it('rejects an effectful counted helper even when it has one state argument', () => {
  const source = `let calls=0; function visible(value){calls++; return value>0}
    function App(){const [value,setValue]=useState(0);
      const shown=visible(value); return <button onClick={()=>setValue(value+1)}>{shown ? value : 'hidden'}</button>}`

  expect(() => transformSync(source, {
    plugins: [[plugin, { runOnce: true, injectImports: false }]],
    configFile: false, babelrc: false,
  })).toThrow(/derived calls, mutations, and JSX need further compiler analysis/)
})

const cases = [
  ['logical', `return <section>{shown && (data ? <input defaultValue={data.name}/> : <b>missing</b>)}<output>{n}</output></section>`],
  ['root conditional', `return shown ? <><input defaultValue="typed"/><output>{n}</output></> : null`],
  ['nested', `return <section>{shown ? (data ? <input data-count={n} defaultValue={data.name}/> : <b>missing</b>) : <i>hidden</i>}<output>{n}</output></section>`],
  ['fragment', `return <><output>{n}</output>{shown ? <><input defaultValue="typed"/><b>{n}</b></> : null}<footer>end</footer></>`],
  ['early return', `if (!shown) return null; return <><input defaultValue="typed"/><output>{n}</output></>`],
] as const

it.each(cases)('matches React for %s updates, identity and disposal', async (_name, body) => {
  const source = `function App(){ entered(); const [shown,setShown]=useState(false);
    const [data,setData]=useState(null); const [n,setN]=useState(0);
    expose({setShown,setData,setN}); ${body} }`
  const traces: string[][] = []
  for (const native of [true, false]) {
    const code = transformSync(source, {
      plugins: native ? [] : [[plugin, { runOnce: true, injectImports: false }]],
      presets: native ? [['@babel/preset-react', { runtime: 'classic', pragma: 'h' }]] : [],
      configFile: false, babelrc: false,
    })!.code!
    const entered = vi.fn()
    let setters: any
    const App = new Function('React', 'h', 'choose', 'useState', 'derive', 'entered', 'expose', `${code}; return App`)(React, native ? React.createElement : renderer.h, (renderer as any).choose, native ? React.useState : useState, derive, entered, (value: any) => { setters = value })
    const host = document.createElement('div')
    document.body.appendChild(host)
    const capture = native ? null : captureRuntime()
    const root = native ? createRoot(host) : null
    let dispose = () => {}
    const trace: string[] = []
    const snapshot = () => trace.push(host.textContent + '|' + (host.querySelector('input')?.value ?? '-'))
    try {
      await React.act(async () => { if (root) { root.render(React.createElement(App)); dispose = () => root.unmount() } else dispose = renderer.mount(App, host) })
      snapshot()
      await React.act(async () => setters.setShown(true))
      snapshot()
      await React.act(async () => setters.setData({name:'ready'}))
      const input = host.querySelector('input')!
      expect(input).not.toBeNull()
      input.value = 'edited'; input.focus(); input.setSelectionRange(1, 3)
      await React.act(async () => setters.setN(1))
      expect(host.querySelector('input')).toBe(input)
      expect(input.value).toBe('edited')
      expect(document.activeElement).toBe(input)
      expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3])
      snapshot()
      await React.act(async () => setters.setShown(false))
      expect(host.querySelector('input')).toBeNull()
      snapshot()
      await React.act(async () => setters.setData(null))
      await React.act(async () => setters.setN(2))
      snapshot()
      await React.act(async () => setters.setShown(true))
      snapshot()
      await React.act(async () => dispose()); dispose = () => {}
      expect(host.childNodes).toHaveLength(0)
      if (capture) {
        assertArchitecture(capture.events, { bodyExecutions: entered.mock.calls.length })
        const end = capture.events.length
        setters.setN(3); setters.setShown(false)
        assertNoReactiveWork(capture.events, end)
      }
      traces.push(trace)
    } finally { await React.act(async () => dispose()); capture?.stop(); host.remove() }
  }
  expect(traces[1]).toEqual(traces[0])
})

it('retains a common native element across conditional arms', async () => {
  const source = `function App(){ entered(); const [side,setSide]=useState(false); expose(setSide);
    return <section>{side ? <input placeholder="yes"/> : <input placeholder="no"/>}</section> }`
  for (const native of [true, false]) {
    const code = transformSync(source, {
      plugins: native ? [] : [[plugin, {runOnce:true, injectImports:false}]],
      presets: native ? [['@babel/preset-react', {runtime:'classic', pragma:'h'}]] : [],
      configFile:false, babelrc:false,
    })!.code!
    let setSide: any
    const entered = vi.fn()
    const App = new Function('h','choose','useState','derive','entered','expose',`${code};return App`)(native ? React.createElement : renderer.h, (renderer as any).choose, native ? React.useState : useState, derive, entered, (set: any) => {setSide=set})
    const host = document.createElement('div')
    const root = native ? createRoot(host) : null
    const capture = native ? null : captureRuntime()
    let dispose = () => {}
    try {
      await React.act(async()=>{if(root){root.render(React.createElement(App));dispose=()=>root.unmount()}else dispose=renderer.mount(App,host)})
      const input = host.querySelector('input')!
      input.value='edited'
      await React.act(async()=>setSide(true))
      expect(host.querySelector('input')).toBe(input)
      expect(input.value).toBe('edited')
      expect(input.placeholder).toBe('yes')
      await React.act(async()=>dispose());dispose=()=>{}
      if(capture) assertArchitecture(capture.events,{bodyExecutions:entered.mock.calls.length})
    } finally {await React.act(async()=>dispose());capture?.stop()}
  }
})

it('keeps a nested same-tag condition gated by its inactive data branch', async () => {
  const source = `function App(){ entered(); const [data,setData]=useState(null); expose(setData);
    return <section>{data ? (data.ready ? <b>yes</b> : <b>no</b>) : null}</section> }`
  const traces: string[][] = []
  for (const native of [true, false]) {
    const code = transformSync(source, {
      plugins: native ? [] : [[plugin, { runOnce: true, injectImports: false }]],
      presets: native ? [['@babel/preset-react', { runtime: 'classic', pragma: 'h' }]] : [],
      configFile: false, babelrc: false,
    })!.code!
    let setData: any
    const entered = vi.fn()
    const App = new Function('h', 'choose', 'useState', 'derive', 'entered', 'expose', `${code};return App`)(
      native ? React.createElement : renderer.h, (renderer as any).choose,
      native ? React.useState : useState, derive, entered, (set: any) => { setData = set },
    )
    const host = document.createElement('div'), root = native ? createRoot(host) : null
    const capture = native ? null : captureRuntime()
    let dispose = () => {}
    try {
      await React.act(async () => { if (root) { root.render(React.createElement(App)); dispose = () => root.unmount() } else dispose = renderer.mount(App, host) })
      const values = [host.innerHTML]
      expect(host.querySelector('b')).toBeNull()
      await React.act(async () => setData({ ready: false }))
      const bold = host.querySelector('b')!
      expect(bold.textContent).toBe('no')
      values.push(host.innerHTML)
      await React.act(async () => setData({ ready: true }))
      expect(host.querySelector('b')).toBe(bold)
      expect(bold.textContent).toBe('yes')
      values.push(host.innerHTML)
      await React.act(async () => setData(null))
      expect(host.querySelector('b')).toBeNull()
      values.push(host.innerHTML)
      traces.push(values)
      await React.act(async () => dispose()); dispose = () => {}
      if (capture) assertArchitecture(capture.events, { bodyExecutions: entered.mock.calls.length })
    } finally { await React.act(async () => dispose()); capture?.stop() }
  }
  expect(traces[1]).toEqual(traces[0])
})

it('retains an input across unkeyed fragment conditional arms', async () => {
  const source = `function App(){ entered(); const [side,setSide]=useState(false); expose(setSide);
    return <section>{side ? <><input placeholder="yes"/></> : <><input placeholder="no"/></>}</section> }`
  const traces: string[][] = []
  for (const native of [true, false]) {
    const code = transformSync(source, {
      plugins: native ? [] : [[plugin, { runOnce: true, injectImports: false }]],
      presets: native ? [['@babel/preset-react', { runtime: 'classic', pragma: 'h' }]] : [],
      configFile: false, babelrc: false,
    })!.code!
    let setSide: any
    const entered = vi.fn()
    const App = new Function('React', 'h', 'choose', 'useState', 'derive', 'entered', 'expose', `${code};return App`)(
      React, native ? React.createElement : renderer.h, (renderer as any).choose,
      native ? React.useState : useState, derive, entered, (set: any) => { setSide = set },
    )
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = native ? createRoot(host) : null
    const capture = native ? null : captureRuntime()
    let dispose = () => {}
    try {
      await React.act(async () => { if (root) { root.render(React.createElement(App)); dispose = () => root.unmount() } else dispose = renderer.mount(App, host) })
      const input = host.querySelector('input')!
      input.value = 'edited'
      input.focus()
      input.setSelectionRange(1, 4)
      const values = [host.innerHTML]
      await React.act(async () => setSide(true))
      expect(host.querySelector('input')).toBe(input)
      expect(input.value).toBe('edited')
      expect(input.placeholder).toBe('yes')
      expect(document.activeElement).toBe(input)
      expect([input.selectionStart, input.selectionEnd]).toEqual([1, 4])
      values.push(host.innerHTML)
      traces.push(values)
      await React.act(async () => dispose()); dispose = () => {}
      if (capture) assertArchitecture(capture.events, { bodyExecutions: entered.mock.calls.length })
    } finally { await React.act(async () => dispose()); capture?.stop(); host.remove() }
  }
  expect(traces[1]).toEqual(traces[0])
})

it('compiles a pure local helper, arrays and objects without duplicating helper calls', async () => {
  const source = `function twice(value){return value*2}
    function App(){entered();const [n,setN]=useState(1); expose(setN);
      const values=[n,n+1]; const record={value:values[0]}; const doubled=twice(record.value);
      return <output>{doubled}</output>}`
  const traces: any[] = []
  for(const native of [true,false]) {
    const code=transformSync(source,{
      plugins:native?[]:[[plugin,{runOnce:true,injectImports:false}]],
      presets:native?[['@babel/preset-react',{runtime:'classic',pragma:'h'}]]:[],
      configFile:false,babelrc:false,
    })!.code!
    let setN:any
    const entered=vi.fn(), calls=vi.fn()
    // Transparent post-compilation helper instrumentation, identical on both targets.
    const App=new Function('h','useState','derive','entered','expose','calls',`${code}; const original=twice; twice=(...args)=>{calls(...args);return original(...args)};return App`)(native?React.createElement:renderer.h,native?React.useState:useState,derive,entered,(set:any)=>{setN=set},calls)
    const host=document.createElement('div'), root=native?createRoot(host):null
    const capture=native?null:captureRuntime()
    let dispose=()=>{}
    try {
      await React.act(async()=>{if(root){root.render(React.createElement(App));dispose=()=>root.unmount()}else dispose=renderer.mount(App,host)})
      const output=host.querySelector('output')!
      const values=[host.textContent]
      await React.act(async()=>setN(2));values.push(host.textContent)
      expect(host.querySelector('output')).toBe(output)
      expect(values).toEqual(['2','4'])
      expect(calls.mock.calls).toEqual([[1],[2]])
      traces.push(values)
      await React.act(async()=>dispose());dispose=()=>{}
      if(capture){assertArchitecture(capture.events,{bodyExecutions:entered.mock.calls.length});const end=capture.events.length;setN(3);assertNoReactiveWork(capture.events,end)}
    } finally {await React.act(async()=>dispose());capture?.stop()}
  }
  expect(traces[1]).toEqual(traces[0])
})

it('evaluates chained and sibling helpers in source declaration order after a shared update', async () => {
  const source = `function first(value){return value}
    function chained(value){return value}
    function direct(value){return value}
    function App(){entered();const [n,setN]=useState(0); expose(setN);
      const a=first(n); const b=chained(a); const c=direct(n);
      return <output>{a},{b},{c}</output>}`
  const traces: Array<{ values: string[]; initial: unknown[][]; updated: unknown[][] }> = []
  for (const native of [true, false]) {
    const code = transformSync(source, {
      plugins: native ? [] : [[plugin, { runOnce: true, injectImports: false }]],
      presets: native ? [['@babel/preset-react', { runtime: 'classic', pragma: 'h' }]] : [],
      configFile: false, babelrc: false,
    })!.code!
    const entered = vi.fn(), calls = vi.fn()
    let setN: any
    const App = new Function('h', 'useState', 'derive', 'entered', 'expose', 'calls', `${code}; const _first=first; first=(...args)=>{calls('first',...args);return _first(...args)}; const _chained=chained; chained=(...args)=>{calls('chained',...args);return _chained(...args)}; const _direct=direct; direct=(...args)=>{calls('direct',...args);return _direct(...args)}; return App`)(
      native ? React.createElement : renderer.h, native ? React.useState : useState, derive, entered, (set: any) => { setN = set }, calls,
    )
    const host = document.createElement('div'), root = native ? createRoot(host) : null
    const capture = native ? null : captureRuntime()
    let dispose = () => {}
    try {
      await React.act(async () => { if (root) { root.render(React.createElement(App)); dispose = () => root.unmount() } else dispose = renderer.mount(App, host) })
      const output = host.querySelector('output')!
      const initial = calls.mock.calls.map(call => [...call])
      const values = [host.textContent!]
      expect(initial).toEqual([['first', 0], ['chained', 0], ['direct', 0]])
      await React.act(async () => setN(1))
      const updated = calls.mock.calls.slice(initial.length).map(call => [...call])
      values.push(host.textContent!)
      expect(host.querySelector('output')).toBe(output)
      expect(values).toEqual(['0,0,0', '1,1,1'])
      expect(updated).toEqual([['first', 1], ['chained', 1], ['direct', 1]])
      expect(updated).not.toEqual([['first', 1], ['direct', 1], ['chained', 1]])
      traces.push({ values, initial, updated })
      await React.act(async () => dispose()); dispose = () => {}
      if (capture) {
        assertArchitecture(capture.events, { bodyExecutions: entered.mock.calls.length })
        const end = capture.events.length
        setN(2)
        assertNoReactiveWork(capture.events, end)
      }
    } finally { await React.act(async () => dispose()); capture?.stop() }
  }
  expect(traces[1]).toEqual(traces[0])
})

it('evaluates a helper-backed logical condition once and never reads its inactive null branch', async () => {
  const source = `function positive(value){ calls(value); return value > 0 }
    function App(){ entered(); const [model,setModel]=useState({n:0,data:null}); expose(setModel);
      return <section>{positive(model.n) && <output>{model.data.name}</output>}</section> }`
  const traces: Array<{ html: string[]; calls: unknown[][] }> = []
  for (const native of [true, false]) {
    const code = transformSync(source, {
      plugins: native ? [] : [[plugin, { runOnce: true, injectImports: false }]],
      presets: native ? [['@babel/preset-react', { runtime: 'classic', pragma: 'h' }]] : [],
      configFile: false, babelrc: false,
    })!.code!
    const entered = vi.fn(), calls = vi.fn()
    let setters: any
    const App = new Function('h', 'choose', 'useState', 'derive', 'entered', 'expose', 'calls', `${code};return App`)(
      native ? React.createElement : renderer.h, (renderer as any).choose,
      native ? React.useState : useState, derive, entered,
      (value: any) => { setters = value }, calls,
    )
    const host = document.createElement('div'), root = native ? createRoot(host) : null
    const capture = native ? null : captureRuntime()
    let dispose = () => {}
    try {
      await React.act(async () => { if (root) { root.render(React.createElement(App)); dispose = () => root.unmount() } else dispose = renderer.mount(App, host) })
      const html = [host.innerHTML]
      expect(calls.mock.calls).toEqual([[0]])
      await React.act(async () => setters({ n: 1, data: { name: 'ready' } }))
      html.push(host.innerHTML)
      expect(calls.mock.calls).toEqual([[0], [1]])
      await React.act(async () => setters({ n: -1, data: null }))
      html.push(host.innerHTML)
      expect(calls.mock.calls).toEqual([[0], [1], [-1]])
      await React.act(async () => dispose()); dispose = () => {}
      if (capture) {
        assertArchitecture(capture.events, { bodyExecutions: entered.mock.calls.length })
        const end = capture.events.length
        setters({ n: 2, data: { name: 'disposed' } })
        assertNoReactiveWork(capture.events, end)
      }
      traces.push({ html, calls: calls.mock.calls })
    } finally { await React.act(async () => dispose()); capture?.stop() }
  }
  expect(traces[1]).toEqual(traces[0])
})

it('evaluates a same-element branch test once while retaining the element', async () => {
  const source = `function side(value){ calls(value); return value > 0 }
    function App(){ entered(); const [n,setN]=useState(0); expose(setN);
      return side(n) ? <output data-side="yes">yes</output> : <output data-side="no">no</output> }`
  const traces: Array<{ values: string[]; calls: unknown[][] }> = []
  for (const native of [true, false]) {
    const code = transformSync(source, {
      plugins: native ? [] : [[plugin, { runOnce: true, injectImports: false }]],
      presets: native ? [['@babel/preset-react', { runtime: 'classic', pragma: 'h' }]] : [],
      configFile: false, babelrc: false,
    })!.code!
    const entered = vi.fn(), calls = vi.fn()
    let setN: any
    const App = new Function('h', 'choose', 'useState', 'derive', 'entered', 'expose', 'calls', `${code};return App`)(
      native ? React.createElement : renderer.h, (renderer as any).choose,
      native ? React.useState : useState, derive, entered, (set: any) => { setN = set }, calls,
    )
    const host = document.createElement('div'), root = native ? createRoot(host) : null
    const capture = native ? null : captureRuntime()
    let dispose = () => {}
    try {
      await React.act(async () => { if (root) { root.render(React.createElement(App)); dispose = () => root.unmount() } else dispose = renderer.mount(App, host) })
      const output = host.querySelector('output')!
      const values = [output.outerHTML]
      expect(calls.mock.calls).toEqual([[0]])
      await React.act(async () => setN(1)); values.push(output.outerHTML)
      expect(host.querySelector('output')).toBe(output)
      expect(calls.mock.calls).toEqual([[0], [1]])
      await React.act(async () => setN(2)); values.push(output.outerHTML)
      expect(host.querySelector('output')).toBe(output)
      expect(calls.mock.calls).toEqual([[0], [1], [2]])
      await React.act(async () => dispose()); dispose = () => {}
      if (capture) assertArchitecture(capture.events, { bodyExecutions: entered.mock.calls.length })
      traces.push({ values, calls: calls.mock.calls })
    } finally { await React.act(async () => dispose()); capture?.stop() }
  }
  expect(traces[1]).toEqual(traces[0])
})

it('uses lexical bindings when helper parameters shadow reactive names', async () => {
  const source = `function increment(n){ return n + 1 }
    function App(){ entered(); const [n,setN]=useState(1); expose(setN);
      const next=increment(n); return <output>{next}</output> }`
  const results: Array<{ values: string[]; calls: unknown[][] }> = []
  for (const native of [true, false]) {
    const code = transformSync(source, {
      plugins: native ? [] : [[plugin, { runOnce: true, injectImports: false }]],
      presets: native ? [['@babel/preset-react', { runtime: 'classic', pragma: 'h' }]] : [],
      configFile: false, babelrc: false,
    })!.code!
    const calls = vi.fn(), entered = vi.fn()
    let setN: any
    const App = new Function('h', 'choose', 'useState', 'derive', 'entered', 'expose', 'calls', `${code};const original=increment;increment=(...args)=>{calls(...args);return original(...args)};return App`)(
      native ? React.createElement : renderer.h, (renderer as any).choose,
      native ? React.useState : useState, derive, entered, (set: any) => { setN = set }, calls,
    )
    const host = document.createElement('div'), root = native ? createRoot(host) : null
    let dispose = () => {}
    try {
      await React.act(async () => { if (root) { root.render(React.createElement(App)); dispose = () => root.unmount() } else dispose = renderer.mount(App, host) })
      const values = [host.textContent!]
      await React.act(async () => setN(4)); values.push(host.textContent!)
      results.push({ values, calls: calls.mock.calls })
    } finally { await React.act(async () => dispose()) }
  }
  expect(results[1]).toEqual(results[0])
  expect(results[1]).toEqual({ values: ['2', '5'], calls: [[1], [4]] })
})

it('replaces a same-tag conditional element when its key changes', async () => {
  const source = `function App(){ entered(); const [side,setSide]=useState(false); expose(setSide);
    return <section>{side ? <input key="yes" defaultValue="yes"/> : <input key="no" defaultValue="no"/>}</section> }`
  for (const native of [true, false]) {
    const code = transformSync(source, {
      plugins: native ? [] : [[plugin, { runOnce: true, injectImports: false }]],
      presets: native ? [['@babel/preset-react', { runtime: 'classic', pragma: 'h' }]] : [],
      configFile: false, babelrc: false,
    })!.code!
    const entered = vi.fn()
    let setSide: any
    const App = new Function('h', 'choose', 'useState', 'derive', 'entered', 'expose', `${code};return App`)(
      native ? React.createElement : renderer.h, (renderer as any).choose,
      native ? React.useState : useState, derive, entered, (set: any) => { setSide = set },
    )
    const host = document.createElement('div'), root = native ? createRoot(host) : null
    let dispose = () => {}
    try {
      await React.act(async () => { if (root) { root.render(React.createElement(App)); dispose = () => root.unmount() } else dispose = renderer.mount(App, host) })
      const before = host.querySelector('input')!
      before.value = 'edited'
      await React.act(async () => setSide(true))
      const after = host.querySelector('input')!
      expect(after).not.toBe(before)
      expect(before.isConnected).toBe(false)
      expect(after.value).toBe('yes')
      expect(after.hasAttribute('key')).toBe(false)
      if (!native) expect(entered).toHaveBeenCalledTimes(1)
    } finally { await React.act(async () => dispose()) }
  }
})

it('preserves whitespace and positional child identity across aligned branch children', async () => {
  const source = `function App(){ entered(); const [side,setSide]=useState(false); expose(setSide);
    return side ? <p>A <b>B</b> <input defaultValue="kept"/> C</p>
      : <p>A <i>I</i> <input defaultValue="kept"/> C</p> }`
  const traces: string[][] = []
  for (const native of [true, false]) {
    const code = transformSync(source, {
      plugins: native ? [] : [[plugin, { runOnce: true, injectImports: false }]],
      presets: native ? [['@babel/preset-react', { runtime: 'classic', pragma: 'h' }]] : [],
      configFile: false, babelrc: false,
    })!.code!
    const entered = vi.fn()
    let setSide: any
    const App = new Function('h', 'choose', 'useState', 'derive', 'entered', 'expose', `${code};return App`)(
      native ? React.createElement : renderer.h, (renderer as any).choose,
      native ? React.useState : useState, derive, entered, (set: any) => { setSide = set },
    )
    const host = document.createElement('div'), root = native ? createRoot(host) : null
    let dispose = () => {}
    try {
      await React.act(async () => { if (root) { root.render(React.createElement(App)); dispose = () => root.unmount() } else dispose = renderer.mount(App, host) })
      const paragraph = host.querySelector('p')!, input = host.querySelector('input')!
      input.value = 'edited'
      const values = [paragraph.textContent!]
      await React.act(async () => setSide(true)); values.push(paragraph.textContent!)
      expect(host.querySelector('p')).toBe(paragraph)
      expect(host.querySelector('input')).toBe(input)
      expect(input.value).toBe('edited')
      traces.push(values)
    } finally { await React.act(async () => dispose()) }
  }
  expect(traces[1]).toEqual(traces[0])
  expect(traces[1]).toEqual(['A I  C', 'A B  C'])
})

it('disposes bindings owned only by a removed branch', async () => {
  const source = `function App(){ entered(); const [shown,setShown]=useState(true); const [n,setN]=useState(0);
    expose({setShown,setN}); return <section>{shown ? <output data-value={n}>{n}</output> : null}</section> }`
  const code = transformSync(source, {
    plugins: [[plugin, { runOnce: true, injectImports: false }]],
    configFile: false, babelrc: false,
  })!.code!
  const entered = vi.fn()
  let setters: any
  const App = new Function('h', 'choose', 'useState', 'derive', 'entered', 'expose', `${code};return App`)(
    renderer.h, (renderer as any).choose, useState, derive, entered, (value: any) => { setters = value },
  )
  const host = document.createElement('div'), capture = captureRuntime()
  let dispose = () => {}
  try {
    dispose = renderer.mount(App, host)
    expect(host.textContent).toBe('0')
    const beforeHide = capture.events.length
    setters.setShown(false)
    expect(host.querySelector('output')).toBeNull()
    expect(capture.events.slice(beforeHide).filter(event => event.kind === 'computation-dispose')).toHaveLength(2)
    const afterHide = capture.events.length
    setters.setN(1)
    expect(host.textContent).toBe('')
    expect(capture.events.slice(afterHide).filter(event => event.kind === 'computation-run')).toHaveLength(0)
    expect(entered).toHaveBeenCalledTimes(1)
  } finally { dispose(); capture.stop() }
})
