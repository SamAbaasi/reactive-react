import { expect, it, vi } from 'vitest'
import { transformSync } from '@babel/core'
import * as t from '@babel/types'
import plugin from '@rrjs/babel-plugin'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import * as compat from '@rrjs/react-compat'
import { h, mount } from '@rrjs/renderer'
import { assertArchitecture, assertNoReactiveWork, captureRuntime, hash } from '../../../scripts/acceptance/gates.mjs'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

function compile(source: string, native: boolean) {
  const code = transformSync(source, {
    plugins: native ? [] : [[plugin, { runOnce: true, injectImports: false }]],
    presets: native ? [['@babel/preset-react', { runtime: 'classic', pragma: 'h' }]] : [],
    configFile: false, babelrc: false,
  })!.code!
  // Module wiring only, after each independent component compiler has run.
  return transformSync(code, {
    plugins: [() => ({ visitor: { ImportDeclaration(path: any) {
      const module = t.memberExpression(t.identifier('modules'), t.stringLiteral(path.node.source.value), true)
      path.replaceWith(t.variableDeclaration('const', path.node.specifiers.map((specifier: any) =>
        t.variableDeclarator(specifier.local, t.isImportSpecifier(specifier)
          ? t.memberExpression(module, t.stringLiteral(specifier.imported.name ?? specifier.imported.value), true)
          : module))))
    } } })], configFile: false, babelrc: false,
  })!.code!
}

it('preserves imported hook aliases, transitive locals and shadowed callback bindings', async () => {
  const source = `import { useState as state } from 'react';
    function App(){ entered(); const [count,setCount]=state(0);
      const alias=count; const doubled=alias*2;
      return <div><button onClick={()=>{ const count=3; setCount(previous=>previous+count); }}>add</button>
      <output>{count}:{doubled}</output></div>; }`
  const traces: string[][] = []
  const sourceHashes: string[] = []
  for (const native of [true, false]) {
    sourceHashes.push(hash(source))
    const entered = vi.fn()
    const App = new Function('h', 'derive', 'modules', 'entered', `${compile(source, native)}; return App`)(native ? React.createElement : h, compat.derive, { react: native ? React : compat }, entered)
    const host = document.createElement('div')
    const root = native ? createRoot(host) : null
    const capture = native ? null : captureRuntime()
    let dispose = () => {}
    try {
      await React.act(async () => {
        if (root) { root.render(React.createElement(App)); dispose = () => root.unmount() }
        else dispose = mount(App, host)
      })
      const output = host.querySelector('output')!
      const button = host.querySelector('button')!
      const values = [output.textContent!]
      for (let i = 0; i < 2; i++) {
        await React.act(async () => button.click())
        values.push(output.textContent!)
        expect(host.querySelector('output')).toBe(output)
        expect(host.querySelector('button')).toBe(button)
      }
      await React.act(async () => dispose())
      dispose = () => {}
      if (capture) {
        assertArchitecture(capture.events, { bodyExecutions: entered.mock.calls.length })
        const end = capture.events.length
        button.click()
        assertNoReactiveWork(capture.events, end)
      }
      traces.push(values)
    } finally { await React.act(async () => dispose()); capture?.stop() }
  }
  expect(sourceHashes[0]).toBe(sourceHashes[1])
  expect(traces[1]).toEqual(traces[0])
  expect(traces[1]).toEqual(['0:0', '3:6', '6:12'])
})

it.each([
  ['destructuring', `const [state]=useState({n:1}); const {n}=state; return <p>{n}</p>`],
  ['writes', `let [n]=useState(1); n++; return <p>{n}</p>`],
  ['namespace hook', `const [n]=React.useState(1); return <p>{n}</p>`],
  ['custom hook', `const [n]=useCounter(); return <p>{n}</p>`],
  ['opaque derivation', `const [n]=useState(1); const result=external(n); return <p>{result}</p>`],
  ['escaped snapshot', `const [n]=useState(1); const handler=()=>n; expose(handler); return <p>{n}</p>`],
])('diagnoses unsupported %s without counting rejection as compatibility', (_name, body) => {
  const source = `function App(){${body}}`
  expect(() => compile(source, true)).not.toThrow()
  expect(() => compile(source, false)).toThrow(/runOnce:/)
})

async function reference(source: string, modules: Record<string, unknown> = {}, expose = (_value: any) => {}) {
  const App = new Function('h', 'derive', 'modules', 'expose', `${compile(source, true)}; return App`)(React.createElement, compat.derive, { react: React, ...modules }, expose)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await React.act(async () => root.render(React.createElement(App)))
  return { host, async dispose() { await React.act(async () => root.unmount()); host.remove() } }
}

it('records the external replacement-array feasibility blocker against real keyed identity', async () => {
  const source = `import {useState} from 'react'; import {replacement} from './opaque';
    function App(){ const [rows,setRows]=useState([{id:'a'},{id:'b'}]);
      return <div><button onClick={()=>setRows(replacement())}>replace</button>
      {rows.map(row=><input key={row.id} data-id={row.id} defaultValue={row.id}/>)}</div>; }`
  const app = await reference(source, { './opaque': { replacement: () => [{ id: 'b' }, { id: 'a' }] } })
  try {
    const before = Array.from(app.host.querySelectorAll('input'))
    before[0].value = 'typed'
    before[0].focus()
    before[0].setSelectionRange(1, 3)
    await React.act(async () => app.host.querySelector('button')!.click())
    const after = Array.from(app.host.querySelectorAll('input'))
    expect(after[0]).toBe(before[1])
    expect(after[1]).toBe(before[0])
    expect(after[1].value).toBe('typed')
    expect(document.activeElement).toBe(before[0])
    expect([after[1].selectionStart, after[1].selectionEnd]).toEqual([1, 3])
    expect(() => compile(source, false)).toThrow(/runOnce:.*lists/)
  } finally { await app.dispose() }
})

it('records escaped callback snapshot requirements against React', async () => {
  const source = `import {useState} from 'react'; function App(){const [n,setN]=useState(0);
    expose(()=>n); return <button onClick={()=>setN(n+1)}>{n}</button>}`
  const callbacks: Array<() => number> = []
  const app = await reference(source, {}, callback => callbacks.push(callback))
  try {
    const original = callbacks[0]
    await React.act(async () => app.host.querySelector('button')!.click())
    expect(original()).toBe(0)
    expect(callbacks[callbacks.length - 1]()).toBe(1)
    expect(callbacks[callbacks.length - 1]).not.toBe(original)
    expect(() => compile(source, false)).toThrow(/runOnce:/)
  } finally { await app.dispose() }
})

it('records opaque helper reevaluation requirements against React', async () => {
  const source = `import {useState} from 'react'; import {calculate} from './opaque';
    function App(){const [n,setN]=useState(0); const value=calculate(n);
      return <button onClick={()=>setN(n+1)}>{value}</button>}`
  const calculate = vi.fn((n: number) => n * 2)
  const app = await reference(source, { './opaque': { calculate } })
  try {
    expect(app.host.textContent).toBe('0')
    await React.act(async () => app.host.querySelector('button')!.click())
    expect(app.host.textContent).toBe('2')
    expect(calculate.mock.calls).toEqual([[0], [1]])
    expect(() => compile(source, false)).toThrow(/runOnce:.*derived calls/)
  } finally { await app.dispose() }
})

it.each([
  `import {useState} from 'react'; const state=useState; function App(){const [n]=state(1); return <p>{n}</p>}`,
  `import {useCounter as counter} from './opaque'; function App(){const [n]=counter(); return <p>{n}</p>}`,
])('rejects unanalysed hook indirection across binding/module boundaries: %s', source => {
  expect(() => compile(source, true)).not.toThrow()
  expect(() => compile(source, false)).toThrow(/runOnce:/)
})
