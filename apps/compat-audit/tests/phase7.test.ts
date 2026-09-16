import { expect, it, vi } from 'vitest'
import { transformSync } from '@babel/core'
import reactiveReact from '@rrjs/babel-plugin'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { choose, h, mount } from '@rrjs/renderer'
import { derive, useState } from '@rrjs/react-compat'
import { assertArchitecture, assertNoReactiveWork, captureRuntime } from '../../../scripts/acceptance/gates.mjs'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

const source = `
function SvgApp() {
  entered();
  const [radius, setRadius] = useState(4);
  const [shown, setShown] = useState(true);
  expose({ setRadius, setShown });
  return <section>
    <svg data-kind="svg" viewBox="0 0 40 20" className={radius > 4 ? 'large' : 'small'}>
      <g data-kind="group" strokeWidth={radius}>
        <circle data-kind="circle" id="dot" cx={radius} cy="5" r={radius} onClick={() => setRadius(radius + 1)} />
        <text data-kind="text">{radius}</text>
        {shown && <use data-kind="use" href="#dot" xlinkHref="#dot" />}
        <foreignObject data-kind="foreign" x="20" y="0" width="20" height="20">
          <div data-kind="html" className="inside">html:{radius}</div>
        </foreignObject>
      </g>
    </svg>
  </section>;
}`

function compile(react: boolean): string {
  return transformSync(source, {
    filename: 'SvgApp.tsx',
    plugins: react ? [] : [[reactiveReact, { runOnce: true, injectImports: false }]],
    presets: react ? [['@babel/preset-react', { runtime: 'classic', pragma: 'h' }]] : [],
    configFile: false,
    babelrc: false,
  })!.code!
}

function snapshot(host: HTMLElement) {
  const names = ['svg', 'group', 'circle', 'text', 'use', 'foreign', 'html']
  const nodes = names.map(name => host.querySelector(`[data-kind="${name}"]`)!)
  const circle = host.querySelector('circle')!
  const group = host.querySelector('g')!
  const use = host.querySelector('use')
  return {
    namespaces: nodes.map((node, index) => node?.namespaceURI ?? `missing:${names[index]}`),
    viewBox: host.querySelector('svg')!.getAttribute('viewBox'),
    className: host.querySelector('svg')!.getAttribute('class'),
    radius: [circle.getAttribute('cx'), circle.getAttribute('r')],
    strokeWidth: group.getAttribute('stroke-width'),
    href: use?.getAttribute('href') ?? null,
    xlinkHref: use?.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? null,
    text: host.textContent,
  }
}

it('matches React SVG/foreignObject namespaces, attributes, identity and disposal', async () => {
  const traces: ReturnType<typeof snapshot>[][] = []
  for (const react of [true, false]) {
    const entered = vi.fn()
    let controls: { setRadius(value: number): void; setShown(value: boolean): void }
    const App = new Function('h', 'useState', 'choose', 'derive', 'entered', 'expose', `${compile(react)}; return SvgApp`)(
      react ? React.createElement : h,
      react ? React.useState : useState,
      choose,
      derive,
      entered,
      (value: typeof controls) => { controls = value },
    )
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = react ? createRoot(host) : null
    const capture = react ? null : captureRuntime()
    let dispose = () => {}
    const run: ReturnType<typeof snapshot>[] = []
    try {
      await React.act(async () => {
        if (root) { root.render(React.createElement(App)); dispose = () => root.unmount() }
        else dispose = mount(App, host)
      })
      const svg = host.querySelector('svg')
      const circle = host.querySelector('circle')
      const html = host.querySelector('foreignObject div')
      run.push(snapshot(host))
      await React.act(async () => controls!.setRadius(6))
      expect(host.querySelector('svg')).toBe(svg)
      expect(host.querySelector('circle')).toBe(circle)
      expect(host.querySelector('foreignObject div')).toBe(html)
      run.push(snapshot(host))
      await React.act(async () => controls!.setShown(false))
      run.push(snapshot(host))
      await React.act(async () => controls!.setShown(true))
      await React.act(async () => host.querySelector('circle')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
      run.push(snapshot(host))
      expect(entered).toHaveBeenCalledTimes(react ? 5 : 1)
      await React.act(async () => dispose()); dispose = () => {}
      if (capture) {
        assertArchitecture(capture.events, { bodyExecutions: entered.mock.calls.length })
        const end = capture.events.length
        controls!.setRadius(12)
        controls!.setShown(false)
        assertNoReactiveWork(capture.events, end)
      }
      traces.push(run)
    } finally {
      await React.act(async () => dispose())
      capture?.stop()
      host.remove()
    }
  }
  expect(traces[1]).toEqual(traces[0])
})

it('rejects SVG-only intrinsics without an in-module svg namespace context', () => {
  expect(() => transformSync(`function Circle(){ return <circle r="2"/> }`, {
    plugins: [[reactiveReact, { runOnce: true, injectImports: false }]],
    configFile: false,
    babelrc: false,
  })).toThrow(/SVG intrinsic.*requires an <svg> ancestor/)
})
