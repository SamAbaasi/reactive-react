// useEffect with no dependency argument.
//
// React re-runs such an effect after every render. Nothing here renders twice,
// so the compiler gives the effect the dependency list its callback implies:
// every reactive binding the callback reads. That re-runs it exactly when
// something it depends on changes, and never for a render it has no stake in.
//
// The divergence from React is real and asserted at the bottom of this file
// rather than described and left untested.
import { beforeEach, describe, it, expect } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { run, text, click, compileDefault } from './harness'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
// Passive effects flush on a queue, and a busy queue in a full-suite run takes
// longer than one macrotask. Poll for the value instead of guessing a delay.
async function until(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 40 && !predicate(); attempt++) {
    await new Promise<void>(resolve => setTimeout(resolve, 5))
  }
  expect(predicate()).toBe(true)
}
const titleIs = (value: string) => () => document.title === value
const titleHas = (value: string) => () => document.title.includes(value)

describe('useEffect(fn) without a dependency array', () => {
  // document.title is shared across test files in one worker, so every case
  // starts from a known value rather than inheriting one.
  beforeEach(() => { document.title = '' })

  it('re-runs when state the callback reads changes', async () => {
    const m = run(`function E(){ const [n,setN]=useState(0); useEffect(()=>{ document.title='runs:'+n; }); return <button onClick={()=>setN(n+1)}>{n}</button>; }`, 'E', compileDefault)
    expect(m.error).toBeNull()
    await until(titleIs('runs:0'))
    click(m.container, 'button')
    await until(titleIs('runs:1'))
    expect(text(m.container)).toBe('1')
  })

  it('re-runs when a derived value the callback reads changes', async () => {
    const m = run(`function E(){ const [n,setN]=useState(1); const doubled=n*2; useEffect(()=>{ document.title='d:'+doubled; }); return <button onClick={()=>setN(n+1)}>{n}</button>; }`, 'E', compileDefault)
    expect(m.error).toBeNull()
    await until(titleIs('d:2'))
    click(m.container, 'button')
    await until(titleIs('d:4'))
  })

  it('runs cleanup before each re-run, with that run\'s values', async () => {
    const m = run(`function E(){ const [n,setN]=useState(0); useEffect(()=>{ document.title+='setup'+n+';'; return ()=>{ document.title+='cleanup'+n+';'; }; }); return <button onClick={()=>setN(n+1)}>{n}</button>; }`, 'E', compileDefault)
    expect(m.error).toBeNull()
    await until(titleHas('setup0;'))
    click(m.container, 'button')
    await until(titleHas('setup1;'))
    expect(document.title).toContain('cleanup0;')
    expect(document.title.indexOf('cleanup0;')).toBeLessThan(document.title.indexOf('setup1;'))
  })

  it('compiles the inferred list as live reads, not getter identities', () => {
    // A bare `[n]` would hold the getter, whose identity never changes, so the
    // effect would silently never re-run. Assert the emitted shape.
    const code = compileDefault(`function E(){ const [n,setN]=useState(0); useEffect(()=>{ document.title=''+n; }); return <button onClick={()=>setN(n+1)}>{n}</button>; }`)
    expect(code).toContain('() => [n()]')
  })

  it('runs once when the callback reads nothing reactive — and React does not', async () => {
    // Documented divergence, measured against React 19 in the same run.
    const Comp = () => {
      const [n, setN] = React.useState(0)
      React.useEffect(() => { document.title = (document.title || '') + 'x' })
      return React.createElement('button', { onClick: () => setN(n + 1) }, String(n))
    }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await React.act(async () => { root.render(React.createElement(Comp)) })
    await React.act(async () => { host.querySelector('button')!.click() })
    const reactTitle = document.title

    document.title = ''
    const m = run(`function E(){ const [n,setN]=useState(0); useEffect(()=>{ document.title=(document.title||'')+'x'; }); return <button onClick={()=>setN(n+1)}>{n}</button>; }`, 'E', compileDefault)
    expect(m.error).toBeNull()
    await until(titleIs('x'))
    click(m.container, 'button')
    // Give it the same chance to run again that the React side had.
    await new Promise<void>(resolve => setTimeout(resolve, 25))

    expect(reactTitle).toBe('xx')
    expect(document.title).toBe('x')
    await React.act(async () => { root.unmount() })
  })
})
