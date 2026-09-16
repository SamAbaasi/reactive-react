import { expect, it, vi } from 'vitest'
import { transformSync } from '@babel/core'
import plugin from '@rrjs/babel-plugin'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { h, mount, choose } from '@rrjs/renderer'
import { createContext, derive, forwardRef, useContext, useRef, useState } from '@rrjs/react-compat'
import { assertArchitecture, assertNoReactiveWork, captureRuntime } from '../../../scripts/acceptance/gates.mjs'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

const source = `function Child({ label }) {
  childEntered();
  const [local, setLocal] = useState(0);
  exposeChild(setLocal);
  return <button onClick={() => setLocal(local + 1)}>{label}:{local}</button>;
}
function App() {
  parentEntered();
  const [parent, setParent] = useState(0);
  exposeParent(setParent);
  return <section><output>{parent}</output><Child label={parent} /></section>;
}`

function compile(input: string, native: boolean): string {
  return transformSync(input, {
    plugins: native ? [] : [[plugin, { runOnce: true, injectImports: false }]],
    presets: native ? [['@babel/preset-react', { runtime: 'classic', pragma: 'h' }]] : [],
    configFile: false,
    babelrc: false,
  })!.code!
}

it('preserves a stateful local child across parent updates with static props', async () => {
  const traces: string[][] = []
  for (const native of [true, false]) {
    const parentEntered = vi.fn()
    const childEntered = vi.fn()
    let setParent: (value: number) => void = () => {}
    let setChild: (value: number) => void = () => {}
    const code = compile(source, native)
    const App = new Function('h', 'choose', 'derive', 'useState', 'parentEntered', 'childEntered',
      'exposeParent', 'exposeChild', `${code}; return App`)(
        native ? React.createElement : h, choose, derive, native ? React.useState : useState,
        parentEntered, childEntered, (set: typeof setParent) => { setParent = set },
        (set: typeof setChild) => { setChild = set },
      )
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = native ? createRoot(host) : null
    const capture = native ? null : captureRuntime()
    let dispose = () => {}
    const values: string[] = []
    try {
      await React.act(async () => {
        if (root) { root.render(React.createElement(App)); dispose = () => root.unmount() }
        else dispose = mount(App, host)
      })
      const button = host.querySelector('button')!
      const output = host.querySelector('output')!
      values.push(host.textContent!)
      await React.act(async () => setChild(1))
      values.push(host.textContent!)
      await React.act(async () => setParent(1))
      values.push(host.textContent!)
      expect(host.querySelector('button')).toBe(button)
      expect(host.querySelector('output')).toBe(output)
      expect(button.textContent).toBe('1:1')
      await React.act(async () => dispose())
      dispose = () => {}
      if (capture) {
        expect(parentEntered).toHaveBeenCalledTimes(1)
        expect(childEntered).toHaveBeenCalledTimes(1)
        assertArchitecture(capture.events, { instances: 2, bodyExecutions: 2 })
        const end = capture.events.length
        setParent(2)
        setChild(2)
        assertNoReactiveWork(capture.events, end)
      }
      traces.push(values)
    } finally {
      await React.act(async () => dispose())
      capture?.stop()
      host.remove()
    }
  }
  expect(traces[1]).toEqual(traces[0])
  expect(traces[1]).toEqual(['00:0', '00:1', '11:1'])
})

it('rejects component inputs outside the static local-function scope', () => {
  const transform = (input: string) => compile(input, false)
  expect(() => transform(`function Child({value}){return <p>{value}</p>} function App(){return <Child value={{n:1}}/>} `))
    .toThrow(/static scalars or direct reactive bindings/)
  expect(() => transform(`function Child({children}){return <p>{children}</p>} function App(){return <Child><b>x</b><i>y</i></Child>} `))
    .toThrow(/multiple and spread component children/)
  expect(() => transform(`function App(){return <Library.Child/>}`))
    .toThrow(/member components require wrapper/)
})

it('constructs one component child lazily inside its owner scope', async () => {
  const input = `function Inner(){ innerEntered(); const [n,setN]=useState(0); expose(setN); return <button>{n}</button> }
    function Wrap({children}){ wrapEntered(); return <div>{children}</div> }
    function App(){ appEntered(); return <Wrap><Inner/></Wrap> }`
  const traces: string[][] = []
  for (const native of [true, false]) {
    let setInner: (value: number) => void = () => {}
    const entered = [vi.fn(), vi.fn(), vi.fn()]
    const code = compile(input, native)
    const App = new Function('h','choose','derive','useState','appEntered','wrapEntered','innerEntered','expose',`${code};return App`)(
      native ? React.createElement : h, choose, derive, native ? React.useState : useState,
      entered[0], entered[1], entered[2], (set: typeof setInner) => { setInner = set })
    const host = document.createElement('div')
    const root = native ? createRoot(host) : null
    const capture = native ? null : captureRuntime()
    let dispose = () => {}
    try {
      await React.act(async()=>{if(root){root.render(React.createElement(App));dispose=()=>root.unmount()}else dispose=mount(App,host)})
      const button = host.querySelector('button')!
      const values = [host.textContent!]
      await React.act(async()=>setInner(1))
      values.push(host.textContent!)
      expect(host.querySelector('button')).toBe(button)
      await React.act(async()=>dispose()); dispose=()=>{}
      if(capture) {
        for(const called of entered) expect(called).toHaveBeenCalledTimes(1)
        assertArchitecture(capture.events,{instances:3,bodyExecutions:3})
      }
      traces.push(values)
    } finally {await React.act(async()=>dispose());capture?.stop();host.remove()}
  }
  expect(traces[1]).toEqual(traces[0])
  expect(traces[1]).toEqual(['0','1'])
})

it('passes a render-prop argument and updates its reactive result', async () => {
  const input = `function Render({children}){ const [n,setN]=useState(1); exposeChild(setN); return <output>{children(n)}</output> }
    function App(){ const [prefix,setPrefix]=useState('a'); exposeParent(setPrefix); return <Render>{value => prefix + ':' + value}</Render> }`
  const traces: string[][] = []
  for (const native of [true, false]) {
    let setParent: (value: string) => void = () => {}
    let setChild: (value: number) => void = () => {}
    const code = compile(input, native)
    const App = new Function('h','choose','derive','useState','exposeParent','exposeChild',`${code};return App`)(
      native ? React.createElement : h, choose, derive, native ? React.useState : useState,
      (set: typeof setParent) => { setParent = set }, (set: typeof setChild) => { setChild = set })
    const host = document.createElement('div')
    const root = native ? createRoot(host) : null
    let dispose = () => {}
    try {
      await React.act(async()=>{if(root){root.render(React.createElement(App));dispose=()=>root.unmount()}else dispose=mount(App,host)})
      const values = [host.textContent!]
      await React.act(async()=>setChild(2)); values.push(host.textContent!)
      await React.act(async()=>setParent('b')); values.push(host.textContent!)
      traces.push(values)
    } finally {await React.act(async()=>dispose());host.remove()}
  }
  expect(traces[1]).toEqual(traces[0])
  expect(traces[1]).toEqual(['a:1','a:2','b:2'])
})

it('propagates a changing provider value to a stateful consumer', async () => {
  const input = `const Ctx=createContext('default');
    function Child(){ childEntered(); const value=useContext(Ctx); const [local,setLocal]=useState(0); exposeChild(setLocal); return <button>{value}:{local}</button> }
    function App(){ appEntered(); const [value,setValue]=useState('a'); exposeParent(setValue); return <Ctx.Provider value={value}><Child/></Ctx.Provider> }`
  const traces: string[][] = []
  for (const native of [true, false]) {
    let setParent: (value: string) => void = () => {}
    let setChild: (value: number) => void = () => {}
    const entered = [vi.fn(), vi.fn()]
    const code = compile(input, native)
    const App = new Function('h','choose','derive','useState','useContext','createContext','appEntered','childEntered','exposeParent','exposeChild',`${code};return App`)(
      native ? React.createElement : h, choose, derive, native ? React.useState : useState,
      native ? React.useContext : useContext, native ? React.createContext : createContext,
      entered[0], entered[1], (set: typeof setParent) => { setParent = set },
      (set: typeof setChild) => { setChild = set })
    const host = document.createElement('div')
    const root = native ? createRoot(host) : null
    const capture = native ? null : captureRuntime()
    let dispose = () => {}
    try {
      await React.act(async()=>{if(root){root.render(React.createElement(App));dispose=()=>root.unmount()}else dispose=mount(App,host)})
      const button = host.querySelector('button')!, values = [host.textContent!]
      await React.act(async()=>setChild(1)); values.push(host.textContent!)
      await React.act(async()=>setParent('b')); values.push(host.textContent!)
      expect(host.querySelector('button')).toBe(button)
      await React.act(async()=>dispose()); dispose=()=>{}
      if(capture){expect(entered[0]).toHaveBeenCalledTimes(1);expect(entered[1]).toHaveBeenCalledTimes(1);assertArchitecture(capture.events,{instances:2,bodyExecutions:2})}
      traces.push(values)
    } finally {await React.act(async()=>dispose());capture?.stop();host.remove()}
  }
  expect(traces[1]).toEqual(traces[0])
  expect(traces[1]).toEqual(['a:0','a:1','b:1'])
})

it('restores provider scope when a conditional consumer mounts later', async () => {
  const input = `const Ctx=createContext('default');
    function Child(){ const value=useContext(Ctx); return <output>{value}</output> }
    function App(){ const [shown,setShown]=useState(false); const [value,setValue]=useState('inside'); expose(setShown,setValue); return <Ctx.Provider value={value}><section>{shown && <Child/>}</section></Ctx.Provider> }`
  const traces: string[][] = []
  for (const native of [true,false]) {
    let setShown:(value:boolean)=>void=()=>{},setValue:(value:string)=>void=()=>{}
    const code=compile(input,native)
    const App=new Function('h','choose','derive','useState','useContext','createContext','expose',`${code};return App`)(
      native?React.createElement:h,choose,derive,native?React.useState:useState,native?React.useContext:useContext,
      native?React.createContext:createContext,(a:typeof setShown,b:typeof setValue)=>{setShown=a;setValue=b})
    const host=document.createElement('div'),root=native?createRoot(host):null;let dispose=()=>{}
    try {
      await React.act(async()=>{if(root){root.render(React.createElement(App));dispose=()=>root.unmount()}else dispose=mount(App,host)})
      const values=[host.textContent!]
      await React.act(async()=>setShown(true));values.push(host.textContent!)
      const output=host.querySelector('output')!
      await React.act(async()=>setValue('changed'));values.push(host.textContent!)
      expect(host.querySelector('output')).toBe(output)
      traces.push(values)
    } finally {await React.act(async()=>dispose());host.remove()}
  }
  expect(traces[1]).toEqual(traces[0])
  expect(traces[1]).toEqual(['','inside','changed'])
})

it('supports static default props and inline callback props', async () => {
  const input = `function Child({label='fallback',onAction}){ childEntered(); return <button onClick={onAction}>{label}</button> }
    function App(){ appEntered(); const [count,setCount]=useState(0); return <section><output>{count}</output><Child onAction={()=>setCount(count+1)}/></section> }`
  const traces: string[][]=[]
  for(const native of [true,false]){
    const entered=[vi.fn(),vi.fn()]
    const code=compile(input,native)
    const App=new Function('h','choose','derive','useState','appEntered','childEntered','expose',`${code};return App`)(
      native?React.createElement:h,choose,derive,native?React.useState:useState,entered[0],entered[1],()=>{})
    const host=document.createElement('div'),root=native?createRoot(host):null;let dispose=()=>{}
    try{
      await React.act(async()=>{if(root){root.render(React.createElement(App));dispose=()=>root.unmount()}else dispose=mount(App,host)})
      const button=host.querySelector('button')!,values=[host.textContent!]
      await React.act(async()=>button.click());values.push(host.textContent!)
      await React.act(async()=>button.click());values.push(host.textContent!)
      expect(host.querySelector('button')).toBe(button)
      if(!native){expect(entered[0]).toHaveBeenCalledTimes(1);expect(entered[1]).toHaveBeenCalledTimes(1)}
      traces.push(values)
    }finally{await React.act(async()=>dispose());host.remove()}
  }
  expect(traces[1]).toEqual(traces[0])
  expect(traces[1]).toEqual(['0fallback','1fallback','2fallback'])
})

it('keeps nested provider values isolated while the outer value changes', async () => {
  const input=`const Ctx=createContext('default'); function Child(){const value=useContext(Ctx);return <output>{value}</output>}
    function App(){const [outer,setOuter]=useState('outer');expose(setOuter);return <Ctx.Provider value={outer}><section><Child/><Ctx.Provider value="inner"><Child/></Ctx.Provider></section></Ctx.Provider>}`
  const traces:string[][]=[]
  for(const native of [true,false]){
    let setOuter:(value:string)=>void=()=>{};const code=compile(input,native)
    const App=new Function('h','choose','derive','useState','useContext','createContext','expose',`${code};return App`)(
      native?React.createElement:h,choose,derive,native?React.useState:useState,native?React.useContext:useContext,native?React.createContext:createContext,(set:typeof setOuter)=>{setOuter=set})
    const host=document.createElement('div'),root=native?createRoot(host):null;let dispose=()=>{}
    try{await React.act(async()=>{if(root){root.render(React.createElement(App));dispose=()=>root.unmount()}else dispose=mount(App,host)})
      const outputs=[...host.querySelectorAll('output')],values=[host.textContent!]
      await React.act(async()=>setOuter('changed'));values.push(host.textContent!)
      expect([...host.querySelectorAll('output')]).toEqual(outputs);traces.push(values)
    }finally{await React.act(async()=>dispose());host.remove()}
  }
  expect(traces[1]).toEqual(traces[0]);expect(traces[1]).toEqual(['outerinner','changedinner'])
})

it('isolates context across independent roots', async () => {
  const input=`const Ctx=createContext('default'); function Child(){const value=useContext(Ctx);return <output>{value}</output>}
    function AppA(){return <Ctx.Provider value="A"><Child/></Ctx.Provider>} function AppB(){return <Ctx.Provider value="B"><Child/></Ctx.Provider>}`
  for(const native of [true,false]){
    const code=compile(input,native)
    const [AppA,AppB]=new Function('h','choose','derive','useState','useContext','createContext',`${code};return [AppA,AppB]`)(
      native?React.createElement:h,choose,derive,native?React.useState:useState,native?React.useContext:useContext,native?React.createContext:createContext)
    const hosts=[document.createElement('div'),document.createElement('div')],roots=native?hosts.map(host=>createRoot(host)):[] as any[]
    let disposers:Array<()=>void>=[]
    try{await React.act(async()=>{if(native){roots[0].render(React.createElement(AppA));roots[1].render(React.createElement(AppB));disposers=roots.map(root=>()=>root.unmount())}else disposers=[mount(AppA,hosts[0]),mount(AppB,hosts[1])]})
      expect(hosts.map(host=>host.textContent)).toEqual(['A','B'])
    }finally{await React.act(async()=>{for(const dispose of disposers)dispose()})}
  }
})

it('releases child and parent ownership when child setup throws', () => {
  let setChild:(value:number)=>void=()=>{}
  const input=`function Child(){const [n,setN]=useState(1);expose(setN);const doubled=n*2;throw new Error('child setup')}
    function App(){return <Child/>}`
  const code=compile(input,false)
  const App=new Function('h','choose','derive','useState','expose',`${code};return App`)(h,choose,derive,useState,(set:typeof setChild)=>{setChild=set})
  const capture=captureRuntime(),host=document.createElement('div')
  expect(()=>mount(App,host)).toThrow(/child setup/)
  assertArchitecture(capture.events,{instances:2,bodyExecutions:2})
  const end=capture.events.length;setChild(2);assertNoReactiveWork(capture.events,end);capture.stop()
})

it('forwards a connected ref through a local wrapper while its prop updates', async () => {
  const input=`const Child=forwardRef(function Child({label},ref){childEntered();return <label><span>{label}</span><input ref={ref}/></label>});
    function App(){appEntered();const [label,setLabel]=useState('a');const ref=useRef(null);expose(setLabel,ref);return <Child label={label} ref={ref}/>} `
  const traces:string[][]=[]
  for(const native of [true,false]){
    let setLabel:(value:string)=>void=()=>{},ref:{current:HTMLInputElement|null}={current:null};const entered=[vi.fn(),vi.fn()]
    const code=compile(input,native)
    const App=new Function('h','choose','derive','useState','useRef','forwardRef','appEntered','childEntered','expose',`${code};return App`)(
      native?React.createElement:h,choose,derive,native?React.useState:useState,native?React.useRef:useRef,native?React.forwardRef:forwardRef,
      entered[0],entered[1],(set:typeof setLabel,value:typeof ref)=>{setLabel=set;ref=value})
    const host=document.createElement('div');document.body.appendChild(host);const root=native?createRoot(host):null;let dispose=()=>{}
    try{await React.act(async()=>{if(root){root.render(React.createElement(App));dispose=()=>root.unmount()}else dispose=mount(App,host)})
      const inputNode=host.querySelector('input')!;expect(ref.current).toBe(inputNode);expect(inputNode.isConnected).toBe(true)
      const values=[host.textContent!];await React.act(async()=>setLabel('b'));values.push(host.textContent!)
      expect(host.querySelector('input')).toBe(inputNode);expect(ref.current).toBe(inputNode)
      await React.act(async()=>dispose());dispose=()=>{};expect(ref.current).toBeNull()
      if(!native){expect(entered[0]).toHaveBeenCalledTimes(1);expect(entered[1]).toHaveBeenCalledTimes(1)}
      traces.push(values)
    }finally{await React.act(async()=>dispose());host.remove()}
  }
  expect(traces[1]).toEqual(traces[0]);expect(traces[1]).toEqual(['a','b'])
})

it('integrates a direct local custom hook without replaying the component', async () => {
  const input=`function useCounter(){const [count,setCount]=useState(0);return [count,setCount]}
    function App(){entered();const [count,setCount]=useCounter();return <button onClick={()=>setCount(count+1)}>{count}</button>}`
  const traces:string[][]=[]
  for(const native of [true,false]){
    const entered=vi.fn(),code=compile(input,native)
    const App=new Function('h','choose','derive','useState','entered',`${code};return App`)(native?React.createElement:h,choose,derive,native?React.useState:useState,entered)
    const host=document.createElement('div'),root=native?createRoot(host):null,capture=native?null:captureRuntime();let dispose=()=>{}
    try{await React.act(async()=>{if(root){root.render(React.createElement(App));dispose=()=>root.unmount()}else dispose=mount(App,host)})
      const button=host.querySelector('button')!,values=[host.textContent!]
      await React.act(async()=>button.click());values.push(host.textContent!)
      await React.act(async()=>button.click());values.push(host.textContent!)
      expect(host.querySelector('button')).toBe(button)
      await React.act(async()=>dispose());dispose=()=>{}
      if(capture){expect(entered).toHaveBeenCalledTimes(1);assertArchitecture(capture.events,{instances:1,bodyExecutions:1})}
      traces.push(values)
    }finally{await React.act(async()=>dispose());capture?.stop();host.remove()}
  }
  expect(traces[1]).toEqual(traces[0]);expect(traces[1]).toEqual(['0','1','2'])
})
