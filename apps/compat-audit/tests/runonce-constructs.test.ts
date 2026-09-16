// Ordinary React constructs compiled through runOnce: true, asserted.
//
// This file is a gate, not a survey. Every case states the exact DOM result it
// expects, or the exact diagnostic it expects the compiler to raise. A case
// that starts passing for a new reason, or stops rejecting, fails here and has
// to be re-recorded deliberately -- unsupported forms cannot drift into looking
// supported, and supported forms cannot silently regress.
import { describe, it, expect } from 'vitest'
import { transformSync } from '@babel/core'
import plugin from '@rrjs/babel-plugin'
import * as renderer from '@rrjs/renderer'
const { h, list, mount, choose } = renderer
import * as compat from '@rrjs/react-compat'

function compile(src: string): string {
  return transformSync(src, {
    plugins: [[plugin, { runOnce: true, injectImports: false }]],
    configFile: false, babelrc: false, sourceType: 'script',
  })!.code!
}

// No `runOnce` key at all: whatever the plugin defaults to is what runs.
function compileWithDefaults(src: string): string {
  return transformSync(src, {
    plugins: [[plugin, { injectImports: false }]],
    configFile: false, babelrc: false, sourceType: 'script',
  })!.code!
}

interface Mounted { container: HTMLElement; bump: (v?: unknown) => void }

function render(src: string, name: string, compiler: (s: string) => string = compile): Mounted {
  const container = document.createElement('div')
  document.body.appendChild(container)
  let bump: (v?: unknown) => void = () => {}
  const c = compat as unknown as Record<string, unknown>
  const r = renderer as unknown as Record<string, unknown>
  const helpers = ['operationList', 'listAppend', 'listPrepend', 'listClear',
    'listTruncate', 'listSplice', 'listReverse', 'listFilter', 'listSort',
    'listMap', 'listMove']
  const names = ['h', 'list', 'choose', 'derive', 'useState', 'useEffect',
    'useMemo', 'useRef', 'useContext', 'createContext', '__register', ...helpers]
  const values = [h, list, choose, c.derive, c.useState, c.useEffect, c.useMemo,
    c.useRef, c.useContext, c.createContext,
    (fn: (v?: unknown) => void) => { bump = fn }, ...helpers.map(n => r[n])]
  const C = new Function(...names, `${compiler(src)}
return ${name};`)(...values)
  mount(C as never, container)
  return { container, bump }
}

const txt = (c: HTMLElement) => (c.textContent ?? '').replace(/\s+/g, ' ').trim()
const cls = (c: HTMLElement, sel: string) => c.querySelector(sel)?.className ?? '(none)'

describe('runOnce: supported ordinary React constructs', () => {
  it('calls a state getter used as a value outside JSX', () => {
    const m = render(`function Case(){ const [items,setItems]=useState([{id:1,done:true},{id:2,done:false}]); const done=items.filter(i=>i.done).length; return <p>{done}</p>; }`, 'Case')
    expect(txt(m.container)).toBe('1')
  })

  it('renders and updates a logical-AND conditional', () => {
    const m = render(`function Case(){ const [route,setRoute]=useState('board'); __register(setRoute); return <div>{route==='board' && <span>BOARD</span>}</div>; }`, 'Case')
    expect(txt(m.container)).toBe('BOARD')
    m.bump('stats')
    expect(txt(m.container)).toBe('')
  })

  it('renders and updates a ternary', () => {
    const m = render(`function Case(){ const [n,setN]=useState(0); __register(setN); return <div>{n===0 ? <span>ZERO</span> : <em>OTHER</em>}</div>; }`, 'Case')
    expect(txt(m.container)).toBe('ZERO')
    expect(m.container.querySelector('span')).not.toBeNull()
    m.bump(1)
    expect(txt(m.container)).toBe('OTHER')
    expect(m.container.querySelector('em')).not.toBeNull()
  })

  it('updates an attribute built by string concatenation', () => {
    const m = render(`function Case(){ const [t,setT]=useState('dark'); __register(setT); return <div className={"theme-"+t}>x</div>; }`, 'Case')
    expect(cls(m.container, 'div')).toBe('theme-dark')
    m.bump('light')
    expect(cls(m.container, 'div')).toBe('theme-light')
  })

  it('updates a template literal child', () => {
    const m = render('function Case(){ const [v,setV]=useState("A"); __register(setV); return <div>{`n=${v}`}</div>; }', 'Case')
    expect(txt(m.container)).toBe('n=A')
    m.bump('B')
    expect(txt(m.container)).toBe('n=B')
  })

  it('updates a nested object style prop', () => {
    const m = render(`function Case(){ const [c,setC]=useState('blue'); __register(setC); return <div style={{backgroundColor:c}}>x</div>; }`, 'Case')
    const el = () => m.container.querySelector('div') as HTMLElement
    expect(el().style.backgroundColor).toBe('blue')
    m.bump('red')
    expect(el().style.backgroundColor).toBe('red')
  })

  it('takes an early return before the main tree', () => {
    const m = render(`function Case(){ const [xs,setXs]=useState([]); if (xs.length === 0) return <p>Nothing here yet.</p>; return <ul/>; }`, 'Case')
    expect(txt(m.container)).toBe('Nothing here yet.')
    expect(m.container.querySelector('p')).not.toBeNull()
  })

  // Normalised from `function C(props)` into the destructured form the rest of
  // the compiler analyses. These two cases are the reason that pass exists.
  it('reads props.children from a non-destructured props parameter', () => {
    const m = render(`function Wrap(props){ return <div className="wrap">{props.children}</div>; } function Case(){ return <Wrap><span>inner</span></Wrap>; }`, 'Case')
    expect(txt(m.container)).toBe('inner')
    expect(cls(m.container, 'div')).toBe('wrap')
    expect(m.container.querySelector('div > span')).not.toBeNull()
  })

  it('reads a named prop from a non-destructured props parameter', () => {
    const m = render(`function Row(props){ return <li className={props.done ? 'issue done' : 'issue'}>x</li>; } function Case(){ return <ul><Row done={true}/></ul>; }`, 'Case')
    expect(cls(m.container, 'li')).toBe('issue done')
  })

  it('leaves a list mapper parameter alone while normalising component props', () => {
    // An anonymous mapper has no declared name, so the props pass skips it.
    // Removing that requirement rewrites the item parameter and breaks lists.
    const m = render(`function Case(){ const [xs,setXs]=useState([{id:'a',t:'a'},{id:'b',t:'b'}]); return <section><button onClick={()=>setXs([...xs,{id:'c',t:'c'}])}>add</button><ul>{xs.map(x=><li key={x.id}>{x.t}</li>)}</ul></section>; }`, 'Case')
    const rows = () => txt(m.container.querySelector('ul') as HTMLElement)
    expect(m.container.querySelectorAll('li').length).toBe(2)
    expect(rows()).toBe('ab')
    const firstRow = m.container.querySelector('li')
    m.container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(rows()).toBe('abc')
    // the mapper still reads `x.t`; a rewritten parameter would have thrown above
    expect(m.container.querySelector('li')).toBe(firstRow)
  })

  it('passes an object-literal provider value to a consumer', () => {
    const m = render(`const Ctx=createContext({n:'default'}); function Child(){ const v=useContext(Ctx); return <span>{v.n}</span>; } function Case(){ return <Ctx.Provider value={{n:'provided'}}><Child/></Ctx.Provider>; }`, 'Case')
    expect(txt(m.container)).toBe('provided')
  })

  it('updates a consumer when an owned binding inside a provider object changes', () => {
    const m = render(`const Ctx=createContext({n:'default'}); function Child(){ const v=useContext(Ctx); return <span>{v.n}</span>; } function Case(){ const [n,setN]=useState('first'); __register(setN); return <Ctx.Provider value={{n}}><Child/></Ctx.Provider>; }`, 'Case')
    expect(txt(m.container)).toBe('first')
    m.bump('second')
    expect(txt(m.container)).toBe('second')
  })

  it('keeps direct list operations when the map is bound to a name first', () => {
    const src = `function Case(){ const [xs,setXs]=useState([{id:'a',t:'a'},{id:'b',t:'b'}]); const rows=xs.map(x=><li key={x.id}>{x.t}</li>); return <section><button onClick={()=>setXs([...xs,{id:'c',t:'c'}])}>add</button><ul>{rows}</ul></section>; }`
    // Same compiled shape as writing the map inline: a direct append, not a
    // rebuild of the rows.
    expect(compile(src)).toContain('listAppend')
    expect(compile(src)).toContain('operationList')
    const m = render(src, 'Case')
    const rows = () => txt(m.container.querySelector('ul') as HTMLElement)
    expect(rows()).toBe('ab')
    const firstRow = m.container.querySelector('li')
    m.container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(rows()).toBe('abc')
    expect(m.container.querySelector('li')).toBe(firstRow)
  })

  it('leaves a named list binding alone when it is used more than once', () => {
    expect(() => compile(`function Case(){ const [xs,setXs]=useState([{id:'a',t:'a'}]); const rows=xs.map(x=><li key={x.id}>{x.t}</li>); return <div><ul>{rows}</ul><ol>{rows}</ol></div>; }`))
      .toThrow(/runOnce:/)
  })

  it('renders a fixed array declared inside the component', () => {
    // Ordinary React writes the data next to the markup. The body runs once and
    // nothing mutates the binding, so the rows can be emitted directly.
    const m = render(`function List(){ const people=[{id:0,name:'Creola'},{id:1,name:'Mario'},{id:2,name:'Mohammad'}]; const items=people.map(p=><li key={p.id}>{p.name}</li>); return <ul>{items}</ul>; }`, 'List', compileWithDefaults)
    expect(m.container.querySelectorAll('li').length).toBe(3)
    expect(txt(m.container)).toBe('CreolaMarioMohammad')
  })

  // A literal that reads anything reactive is rewritten into a derived binding
  // before the list rule sees it, so it is no longer a fixed array and is
  // refused rather than emitted once and left stale. These pin that boundary
  // for each kind of reactive source.
  it.each([
    ['state', `function L(){ const [n,setN]=useState('x'); const xs=[{id:0,label:n}]; return <ul>{xs.map(x=><li key={x.id}>{x.label}</li>)}</ul>; }`],
    ['a derived value', `function L(){ const [n,setN]=useState(1); const d=n*2; const xs=[{id:0,v:d}]; return <ul>{xs.map(x=><li key={x.id}>{x.v}</li>)}</ul>; }`],
    ['a prop', `function Inner({label}){ const xs=[{id:0,v:label}]; return <ul>{xs.map(x=><li key={x.id}>{x.v}</li>)}</ul>; } function L(){ const [n,setN]=useState('p'); return <Inner label={n}/>; }`],
    ['context', `const Ctx=createContext('d'); function Child(){ const v=useContext(Ctx); const xs=[{id:0,v:v}]; return <ul>{xs.map(x=><li key={x.id}>{x.v}</li>)}</ul>; } function L(){ return <Ctx.Provider value={'p'}><Child/></Ctx.Provider>; }`],
  ])('refuses a fixed array whose contents read %s', (_kind, source) => {
    expect(() => compileWithDefaults(source)).toThrow(/lists require direct operation compilation/)
  })

  it('leaves a named lower-case JSX helper parameter alone', () => {
    // The props pass only claims capitalised bindings. `row` is a plain helper
    // whose parameter carries data, not props, so its `o.t` reads must survive
    // compilation untouched. Dropping the capitalisation check rewrites them.
    const code = compile(`function Case(){ return <div>{row({t:'x'})}</div>; } function row(o){ return <em>{o.t}</em>; }`)
    expect(code).toContain('o.t')
    expect(code).toContain('function row(o)')
    expect(code).not.toMatch(/function row\(\s*\{/)
  })
})

describe('runOnce: forms the compiler rejects rather than mis-compiling', () => {
  it('rejects a props parameter that escapes instead of guessing its shape', () => {
    expect(() => compile(`function Inner(p){ return <i>{p.a}</i>; } function Row(props){ return <Inner {...props}/>; } function Case(){ return <Row a={1}/>; }`))
      .toThrow(/runOnce:/)
  })
})

describe('the documented example, compiled with default plugin options', () => {
  // README shows this component. The default path follows React value
  // semantics, so assert both that the React spelling works and that the older
  // getter spelling is refused at build time rather than crashing on click.
  const getterStyle = `function Counter(){ const [count,setCount]=useState(0); return <button onClick={()=>setCount(count()+1)}>Clicked {count} times</button>; }`
  const valueStyle = `function Counter(){ const [count,setCount]=useState(0); return <button onClick={()=>setCount(count+1)}>Clicked {count} times</button>; }`

  it('renders and updates the ordinary React spelling', () => {
    const m = render(valueStyle, 'Counter', compileWithDefaults)
    expect(txt(m.container)).toBe('Clicked 0 times')
    m.container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(txt(m.container)).toBe('Clicked 1 times')
  })

  it('refuses the getter spelling at build time instead of at the first click', () => {
    expect(() => compileWithDefaults(getterStyle))
      .toThrow(/state is a value here, so `count\(\)` calls it; read `count` instead/)
  })

  it('still accepts calling state that genuinely holds a function', () => {
    // The diagnostic only fires when the initial value plainly cannot be
    // called, so a function-valued state is left alone.
    expect(() => compileWithDefaults(`function Case(){ const [fn,setFn]=useState(()=>()=>'x'); return <p>{fn()}</p>; }`))
      .not.toThrow(/state is a value here/)
  })
})
