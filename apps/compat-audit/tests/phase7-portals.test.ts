import { expect, it, vi } from 'vitest'
import { transformSync } from '@babel/core'
import reactiveReact from '@rrjs/babel-plugin'
import * as React from 'react'
import { createPortal as createReactPortal } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { choose, createPortal, h, mount } from '@rrjs/renderer'
import { createContext, derive, useContext, useState } from '@rrjs/react-compat'
import { assertArchitecture, assertNoReactiveWork, captureRuntime } from '../../../scripts/acceptance/gates.mjs'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

const source = `
const PortalContext = createContext('default');
function PortalChild() {
  childEntered();
  const context = useContext(PortalContext);
  return <span>{context}</span>;
}
function PortalApp() {
  entered();
  const [count, setCount] = useState(0);
  const [shown, setShown] = useState(true);
  expose({ setCount, setShown });
  return <PortalContext.Provider value="owner">
    <main><span data-kind="inline">inline:{count}</span>{shown && createPortal(
      <button data-kind="portal" title={count} onClick={() => setCount(count + 1)}
        ref={portalRef}>{count}:<PortalChild /></button>,
      target
    )}</main>
  </PortalContext.Provider>;
}`

function compile(react: boolean): string {
  return transformSync(source, {
    filename: 'PortalApp.tsx',
    plugins: react ? [] : [[reactiveReact, { runOnce: true, injectImports: false }]],
    presets: react ? [['@babel/preset-react', { runtime: 'classic', pragma: 'h' }]] : [],
    configFile: false,
    babelrc: false,
  })!.code!
}

const settle = () => new Promise(resolve => setTimeout(resolve, 10))

it('matches direct portal placement, context, updates, events, identity and owner cleanup', async () => {
  const traces: unknown[][] = []
  for (const react of [true, false]) {
    const entered = vi.fn()
    const childEntered = vi.fn()
    const refLog: string[] = []
    let controls: { setCount(value: number): void; setShown(value: boolean): void }
    const target = document.createElement('aside')
    const host = document.createElement('div')
    document.body.append(host, target)
    const App = new Function(
      'h', 'useState', 'createContext', 'useContext', 'choose', 'derive',
      'createPortal', 'target', 'entered', 'childEntered', 'expose', 'portalRef',
      `${compile(react)}; return PortalApp`,
    )(
      react ? React.createElement : h,
      react ? React.useState : useState,
      react ? React.createContext : createContext,
      react ? React.useContext : useContext,
      choose,
      derive,
      react ? createReactPortal : createPortal,
      target,
      entered,
      childEntered,
      (value: typeof controls) => { controls = value },
      (node: Element | null) => { refLog.push(node ? 'attach' : 'detach') },
    )
    const root = react ? createRoot(host) : null
    const capture = react ? null : captureRuntime()
    let dispose = () => {}
    const snapshots: unknown[] = []
    const snapshot = (label: string) => ({
      label,
      host: host.textContent,
      target: target.textContent,
      title: target.querySelector('button')?.title ?? null,
      portalCount: target.querySelectorAll('[data-kind="portal"]').length,
    })
    try {
      await React.act(async () => {
        if (root) { root.render(React.createElement(App)); dispose = () => root.unmount() }
        else dispose = mount(App, host)
      })
      await settle()
      const initialButton = target.querySelector('button')
      snapshots.push(snapshot('initial'))
      await React.act(async () => controls!.setCount(2))
      expect(target.querySelector('button')).toBe(initialButton)
      snapshots.push(snapshot('owner-update'))
      await React.act(async () => target.querySelector('button')!.click())
      expect(target.querySelector('button')).toBe(initialButton)
      snapshots.push(snapshot('portal-event'))
      await React.act(async () => controls!.setShown(false))
      await settle()
      snapshots.push(snapshot('hidden'))
      await React.act(async () => controls!.setShown(true))
      await settle()
      const restoredButton = target.querySelector('button')!
      expect(restoredButton).not.toBe(initialButton)
      snapshots.push(snapshot('restored'))
      expect(refLog).toEqual(['attach', 'detach', 'attach'])
      if (!react) {
        expect(entered).toHaveBeenCalledTimes(1)
        expect(childEntered).toHaveBeenCalledTimes(2)
      }
      await React.act(async () => dispose()); dispose = () => {}
      await settle()
      expect(target.childNodes).toHaveLength(0)
      expect(refLog).toEqual(['attach', 'detach', 'attach', 'detach'])
      if (capture) {
        assertArchitecture(capture.events, { instances: 3, bodyExecutions: 3 })
        const end = capture.events.length
        restoredButton.click()
        controls!.setCount(8)
        assertNoReactiveWork(capture.events, end)
      }
      traces.push(snapshots)
    } finally {
      await React.act(async () => dispose())
      capture?.stop()
      host.remove()
      target.remove()
    }
  }
  expect(traces[1]).toEqual(traces[0])
})

it('rejects unsupported react-dom import shapes and portal keys', () => {
  const transform = (input: string) => transformSync(input, {
    plugins: [[reactiveReact, { runOnce: true, injectImports: false }]],
    configFile: false,
    babelrc: false,
  })
  expect(() => transform(`import ReactDOM from 'react-dom'`)).toThrow(/named createPortal import/)
  expect(() => transform(`import * as ReactDOM from 'react-dom'`)).toThrow(/named createPortal import/)
  expect(() => createPortal('child', document.createElement('aside'), 'key' as never)).toThrow(/keys/)
})
