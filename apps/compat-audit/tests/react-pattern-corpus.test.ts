// How far "ordinary React" actually goes on the default compiler path.
//
// Patterns a React developer writes without thinking about them, compiled with
// the plugin's defaults and no adaptation, each asserted against the result it
// actually produces. Where the behaviour differs from React the reference is run
// in the same test rather than described.
//
// This file exists so the supported surface has a number that cannot drift
// quietly. A pattern that starts working must be moved up; one that stops
// working fails here. It does not make the set complete: a finite corpus never
// establishes P4.
import { describe, it, expect } from 'vitest'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { run, text, click, compileDefault } from './harness'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

const mount = (source: string, component = 'C') => {
  const result = run(source, component, compileDefault)
  if (result.error) throw result.error
  return result
}
const press = (r: ReturnType<typeof mount>) => click(r.container, 'button')

describe('ordinary React patterns on the default path', () => {
  it('useState with two independent bindings', () => {
    const r = mount(`function C(){ const [a,sa]=useState(1); const [b,sb]=useState(2); return <button onClick={()=>{sa(a+1);sb(b+1);}}>{a}-{b}</button>; }`)
    expect(text(r.container)).toBe('1-2')
    press(r)
    expect(text(r.container)).toBe('2-3')
  })

  it('functional updater', () => {
    const r = mount(`function C(){ const [n,setN]=useState(0); return <button onClick={()=>setN(c=>c+1)}>{n}</button>; }`)
    press(r)
    expect(text(r.container)).toBe('1')
  })

  it('two setters in one event share React\'s snapshot', () => {
    const r = mount(`function C(){ const [n,setN]=useState(0); return <button onClick={()=>{setN(n+1);setN(n+1);}}>{n}</button>; }`)
    press(r)
    // Both reads see the value captured when the handler ran, as in React.
    expect(text(r.container)).toBe('1')
  })

  it('fragment', () => {
    const r = mount(`function C(){ return <><span>a</span><span>b</span></>; }`)
    expect(text(r.container)).toBe('ab')
    expect(r.container.querySelectorAll('span').length).toBe(2)
  })

  it('component nested two levels deep', () => {
    const r = mount(`function A({v}){ return <i>{v}</i>; } function B({v}){ return <A v={v}/>; } function C(){ return <B v="x"/>; }`)
    expect(text(r.container)).toBe('x')
    expect(r.container.querySelector('i')).not.toBeNull()
  })

  it('default prop value', () => {
    const r = mount(`function A({v='d'}){ return <i>{v}</i>; } function C(){ return <A/>; }`)
    expect(text(r.container)).toBe('d')
  })

  it('nested ternary', () => {
    const r = mount(`function C(){ const [n,setN]=useState(0); return <button onClick={()=>setN(n+1)}>{n===0?'z':n===1?'o':'m'}</button>; }`)
    expect(text(r.container)).toBe('z')
    press(r)
    expect(text(r.container)).toBe('o')
  })

  it('object-valued state', () => {
    const r = mount(`function C(){ const [o,setO]=useState({k:1}); return <button onClick={()=>setO({k:o.k+1})}>{o.k}</button>; }`)
    expect(text(r.container)).toBe('1')
    press(r)
    expect(text(r.container)).toBe('2')
  })

  it('indexing into array state', () => {
    const r = mount(`function C(){ const [xs,setXs]=useState([1,2]); return <button onClick={()=>setXs([...xs,3])}>{xs[0]}</button>; }`)
    expect(text(r.container)).toBe('1')
  })

  it('boolean attribute driven by state', () => {
    const r = mount(`function C(){ const [d,setD]=useState(false); return <button disabled={d} onClick={()=>setD(true)}>go</button>; }`)
    const button = r.container.querySelector('button') as HTMLButtonElement
    expect(button.disabled).toBe(false)
    press(r)
    expect(button.disabled).toBe(true)
  })

  it('numeric style value carries its unit, and updates', () => {
    // `style.width = 10` is dropped by the DOM. React writes pixels for a length
    // and leaves unitless properties bare; these assert both, and the update.
    const r = mount(`function C(){ const [w,setW]=useState(10); return <div style={{width:w,opacity:1,zIndex:3}} onClick={()=>setW(20)}>x</div>; }`)
    const el = r.container.querySelector('div') as HTMLElement
    expect(el.style.width).toBe('10px')
    expect(el.style.opacity).toBe('1')
    expect(el.style.zIndex).toBe('3')
    el.click()
    expect(el.style.width).toBe('20px')
  })

  it('event argument reaches the setter', () => {
    const r = mount(`function C(){ const [v,setV]=useState(''); return <div><input value={v} onInput={e=>setV(e.target.value)}/><p>{v}</p></div>; }`)
    const input = r.container.querySelector('input') as HTMLInputElement
    input.value = 'typed'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    expect(text(r.container.querySelector('p') as HTMLElement)).toBe('typed')
  })

  it('className chosen by a conditional', () => {
    const r = mount(`function C(){ const [a,setA]=useState(false); return <div className={a?'on':'off'} onClick={()=>setA(true)}>x</div>; }`)
    expect(r.container.querySelector('div')?.className).toBe('off')
  })

  it('filtering state to a derived count', () => {
    const r = mount(`function C(){ const [xs,setXs]=useState([{id:'a',done:false}]); const open=xs.filter(i=>!i.done).length; return <button onClick={()=>setXs([...xs,{id:'b',done:false}])}>{open}</button>; }`)
    expect(text(r.container)).toBe('1')
    press(r)
    expect(text(r.container)).toBe('2')
  })

  it('useMemo, which the architecture makes redundant, still computes', () => {
    // The body runs once, so a derived expression is already a computation that
    // recomputes when its reads change. useMemo unwraps to that expression.
    const r = mount(`function C(){ const [n,setN]=useState(2); const d=useMemo(()=>n*2,[n]); return <button onClick={()=>setN(n+1)}>{d}</button>; }`)
    expect(text(r.container)).toBe('4')
    press(r)
    expect(text(r.container)).toBe('6')
  })

  it('useCallback, whose identity guarantee is already free, still works', () => {
    const r = mount(`function C(){ const [n,setN]=useState(0); const cb=useCallback(()=>setN(n+1),[n]); return <button onClick={cb}>{n}</button>; }`)
    expect(text(r.container)).toBe('0')
    press(r)
    expect(text(r.container)).toBe('1')
  })

  it("useReducer, including React's queued dispatch order", async () => {
    // React queues dispatches and applies them in sequence, so two in one
    // handler move the state twice. Compiled to a functional updater, which has
    // the same behaviour. React is run here too rather than trusted.
    const source = `function C(){ const [s,d]=useReducer((a,x)=>a+x,0); return <button onClick={()=>{d(1);d(1);}}>{s}</button>; }`
    const target = mount(source)
    expect(text(target.container)).toBe('0')
    press(target)
    expect(text(target.container)).toBe('2')

    const Reference = () => {
      const [s, d] = React.useReducer((a: number, x: number) => a + x, 0)
      return React.createElement('button', { onClick: () => { d(1); d(1) } }, String(s))
    }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await React.act(async () => { root.render(React.createElement(Reference)) })
    expect(host.textContent).toBe('0')
    await React.act(async () => { host.querySelector('button')!.click() })
    expect(host.textContent).toBe('2')
    await React.act(async () => { root.unmount() })
  })

  it('useReducer with a lazy initialiser', () => {
    const r = mount(`function C(){ const [s,d]=useReducer(a=>a,5,x=>x*3); return <button onClick={()=>d()}>{s}</button>; }`)
    expect(text(r.container)).toBe('15')
  })

  it('useReducer with a named reducer and object state', () => {
    const r = mount(`function reduce(a,x){ return {n:a.n+x}; } function C(){ const [s,d]=useReducer(reduce,{n:0}); return <button onClick={()=>d(2)}>{s.n}</button>; }`)
    expect(text(r.container)).toBe('0')
    press(r)
    expect(text(r.container)).toBe('2')
  })

  it('context consumer under a provider', () => {
    const r = mount(`const X=createContext('d'); function K(){ return <i>{useContext(X)}</i>; } function C(){ return <X.Provider value="p"><K/></X.Provider>; }`)
    expect(text(r.container)).toBe('p')
  })
})

describe('where dependency arrays stop meaning what React means', () => {
  it('a useMemo list that understates its reads freezes in React and stays live here', async () => {
    // React recomputes only when a listed dependency changes, so `[]` freezes
    // the first result. Here the dependency list is dropped and the expression
    // tracks what it actually reads, so the value keeps up. Both sides are
    // measured in this test rather than described in a comment.
    const source = `function C(){ const [n,setN]=useState(1); const d=useMemo(()=>n*10,[]); return <button onClick={()=>setN(n+1)}>{d}</button>; }`
    const target = mount(source)
    expect(text(target.container)).toBe('10')
    press(target)
    expect(text(target.container)).toBe('20')

    const Reference = () => {
      const [n, setN] = React.useState(1)
      const d = React.useMemo(() => n * 10, [])
      return React.createElement('button', { onClick: () => setN(n + 1) }, String(d))
    }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await React.act(async () => { root.render(React.createElement(Reference)) })
    expect(host.textContent).toBe('10')
    await React.act(async () => { host.querySelector('button')!.click() })
    expect(host.textContent).toBe('10')
    await React.act(async () => { root.unmount() })
  })
})
