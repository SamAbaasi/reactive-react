import { describe, it, expect } from 'vitest'
import { transformSync } from '@babel/core'
import plugin from '../src/index'

// These cases cover the older reactive-wrapping path, which is now opt-out
// rather than the default, so each transform selects it explicitly.
function transform(code: string, options: Record<string, unknown> = {}): string {
  const result = transformSync(code, {
    plugins: [[plugin, { runOnce: false, ...options }]],
    parserOpts: { plugins: ['jsx'] },
    generatorOpts: { compact: true, retainLines: false },
  })
  return result?.code ?? ''
}

describe('static content — no thunks needed', () => {
  it('rewrites an aliased named createPortal import for the strict target', () => {
    const out = transform(`import { createPortal as portal } from 'react-dom'; const x = portal(<div />, target)`, { runOnce: true })
    expect(out).toMatch(/import\{createPortal as portal(?:,h as _h)?\}from"@rrjs\/renderer"/)
  })

  it('rejects default, namespace and unrelated react-dom imports in strict mode', () => {
    expect(() => transform(`import ReactDOM from 'react-dom'`, { runOnce: true })).toThrow(/named createPortal import/)
    expect(() => transform(`import * as ReactDOM from 'react-dom'`, { runOnce: true })).toThrow(/named createPortal import/)
    expect(() => transform(`import { flushSync } from 'react-dom'`, { runOnce: true })).toThrow(/only named createPortal/)
  })

  it('rejects changing portal targets, portal keys and unproven target expressions', () => {
    expect(() => transform(`function App(){ const [target] = useState(first); return createPortal(<div />, target) }`, { runOnce: true })).toThrow(/changing createPortal targets|state-dependent component control flow/)
    expect(() => transform(`const x = createPortal(<div />, target, 'key')`, { runOnce: true })).toThrow(/createPortal keys are unsupported/)
    expect(() => transform(`const x = createPortal(<div />, document.body)`, { runOnce: true })).toThrow(/stable identifier/)
  })

  it('does not classify a same-spelled local helper as the portal primitive', () => {
    const out = transform(`function createPortal(value){ return value } function App(){ return flag && createPortal(<div />, target) }`, { runOnce: true })
    expect(out).not.toContain('choose(')
  })

  it('marks SVG descendants while returning foreignObject children to HTML', () => {
    const out = transform(`const x = <svg><g><circle /></g><foreignObject><div /></foreignObject></svg>`)
    expect(out.match(/"__rrjsNamespace":"svg"/g)).toHaveLength(4)
    expect(out).toContain(`h("div",null)`)
  })

  it('rejects an SVG-only intrinsic without an in-module svg ancestor', () => {
    expect(() => transform(`const x = <circle />`)).toThrow(/SVG intrinsic.*requires an <svg> ancestor/)
  })

  it('rejects a component child whose SVG namespace cannot cross the component boundary', () => {
    expect(() => transform(`const x = <svg><Icon /></svg>`)).toThrow(/cross-component namespace/)
  })

  it('transforms a div with static text', () => {
    const out = transform(`const x = <div>hello</div>`)
    expect(out).toContain(`h("div",null,"hello")`)
  })

  it('transforms a div with static attribute', () => {
    const out = transform(`const x = <div id="main" />`)
    expect(out).toContain(`h("div",{"id":"main"})`)
  })

  it('does not wrap string literals', () => {
    const out = transform(`const x = <div title={"hi"} />`)
    expect(out).toContain(`h("div",{"title":"hi"})`)
  })

  it('does not wrap number literals', () => {
    const out = transform(`const x = <div tabIndex={0} />`)
    expect(out).toContain(`h("div",{"tabIndex":0})`)
  })

  it('does not wrap boolean literals', () => {
    const out = transform(`const x = <input disabled={true} />`)
    expect(out).toContain(`h("input",{"disabled":true})`)
  })
})

describe('dynamic content — must be wrapped in thunks', () => {
  it('wraps variable text children', () => {
    const out = transform(`const x = <div>{count}</div>`)
    expect(out).toContain(`()=>count`)
  })

  it('wraps variable attribute values', () => {
    const out = transform(`const x = <div id={cls} />`)
    expect(out).toContain(`"id":()=>cls`)
  })

  it('wraps complex expressions in children', () => {
    const out = transform(`const x = <div>{count() * 2}</div>`)
    expect(out).toContain(`()=>count()*2`)
  })

  it('wraps ternary expressions', () => {
    const out = transform(`const x = <div className={active ? 'on' : 'off'} />`)
    expect(out).toContain(`"className":()=>active?'on':'off'`)
  })
})

describe('event handlers — never wrapped', () => {
  it('does not wrap onClick', () => {
    const out = transform(`const x = <button onClick={handler}>click</button>`)
    expect(out).toContain(`"onClick":handler`)
    expect(out).not.toContain(`"onClick":()=>handler`)
  })

  it('does not wrap onInput', () => {
    const out = transform(`const x = <input onInput={fn} />`)
    expect(out).toContain(`"onInput":fn`)
  })

  it('does not wrap inline arrow event handlers', () => {
    const out = transform(`const x = <button onClick={() => setCount(c => c + 1)} />`)
    expect(out).toContain(`"onClick":()=>setCount(c=>c+1)`)
  })
})

describe('components — uppercase tags pass as identifiers', () => {
  it('transforms a component tag', () => {
    const out = transform(`const x = <Counter />`)
    expect(out).toContain(`h(Counter,null)`)
    expect(out).not.toContain(`"Counter"`)
  })

  it('passes props to components', () => {
    const out = transform(`const x = <Counter initial={0} />`)
    expect(out).toContain(`h(Counter,{"initial":0})`)
  })

it('passes dynamic props to components UNWRAPPED — component receives plain value', () => {
  // Native elements get reactive bindings via thunks.
  // Components are user-defined functions that expect plain props.
  // Wrapping component props in thunks would corrupt the prop's type
  // (e.g. <TodoItem todo={todo} /> — TodoItem expects a Todo, not a getter).
  const out = transform(`const x = <Greeting name={user.name} />`)
  expect(out).toContain(`"name":user.name`)
  expect(out).not.toContain(`"name":()=>user.name`)
})

it('passes static props to components as-is', () => {
  const out = transform(`const x = <Greeting count={42} flag={true} />`)
  expect(out).toContain(`"count":42`)
  expect(out).toContain(`"flag":true`)
})

it('native elements still get reactive bindings (thunks) for dynamic props', () => {
  // Confirm we didn't accidentally break native element behavior
  const out = transform(`const x = <div id={dynamicId} />`)
  expect(out).toContain(`"id":()=>dynamicId`)
})
})

describe('nesting', () => {
  it('handles nested elements', () => {
    const out = transform(`const x = <div><span>hi</span></div>`)
    // addNamed may bind the factory as `h` or `_h`; the nested call shape is the claim.
    expect(out).toMatch(/h\("div",null,_?h\("span",null,"hi"\)\)/)
  })

  it('mixes static and dynamic children', () => {
    const out = transform(`const x = <div>Count: {count}</div>`)
    expect(out).toContain(`"Count: "`)
    expect(out).toContain(`()=>count`)
  })
})

describe('full counter component', () => {
  it('transforms a realistic counter', () => {
    const input = `
      function Counter() {
        return (
          <button onClick={() => setCount(count() + 1)}>
            {count}
          </button>
        )
      }
    `
    const out = transform(input)
    expect(out).toContain(`h("button"`)
    expect(out).toContain(`"onClick":()=>setCount(count()+1)`)
    expect(out).toContain(`()=>count`)
  })

  describe('list-as-JSX transform', () => {
  it('rewrites items.map with keyed JSX to a list() call', () => {
    const out = transform(`
      const x = <ul>{todos.map(todo => <li key={todo.id}>{todo.text}</li>)}</ul>
    `)
    expect(out).toContain('list(')
    expect(out).toContain('()=>todos')
    expect(out).toContain('todo=>todo.id')
  })

  it('handles block-bodied arrow functions', () => {
    const out = transform(`
      const x = <ul>{todos.map(todo => { return <li key={todo.id}>{todo.text}</li> })}</ul>
    `)
    expect(out).toContain('list(')
    expect(out).toContain('()=>todos')
    expect(out).toContain('todo=>todo.id')
  })

  it('does NOT transform .map without a key prop', () => {
    const out = transform(`
      const x = <ul>{items.map(i => <li>{i}</li>)}</ul>
    `)
    expect(out).not.toContain('list(')
  })

  it('does NOT transform .map that returns non-JSX', () => {
    const out = transform(`
      const x = <ul>{items.map(i => i * 2)}</ul>
    `)
    expect(out).not.toContain('list(')
  })

  it('does NOT transform map called on something other than .map', () => {
    const out = transform(`
      const x = <ul>{items.forEach(i => <li key={i}>{i}</li>)}</ul>
    `)
    expect(out).not.toContain('list(')
  })

  it('does NOT transform .map with no arguments', () => {
    const out = transform(`
      const x = <ul>{items.map()}</ul>
    `)
    expect(out).not.toContain('list(')
  })

  it('preserves complex key expressions', () => {
    const out = transform(`
      const x = <ul>{users.map(u => <li key={u.id + '-' + u.name}>{u.name}</li>)}</ul>
    `)
    expect(out).toContain('list(')
    expect(out).toContain("u.id+'-'+u.name")
  })

  it('handles property access on the source array', () => {
    const out = transform(`
      const x = <ul>{state.todos.map(t => <li key={t.id}>{t.text}</li>)}</ul>
    `)
    expect(out).toContain('list(')
    expect(out).toContain('()=>state.todos')
  })

  it('handles function call as source', () => {
    const out = transform(`
      const x = <ul>{getTodos().map(t => <li key={t.id}>{t.text}</li>)}</ul>
    `)
    expect(out).toContain('list(')
    expect(out).toContain('()=>getTodos()')
  })

  it('does NOT transform destructured parameters', () => {
    // For safety; destructured params would need more analysis to handle correctly
    const out = transform(`
      const x = <ul>{items.map(({id, text}) => <li key={id}>{text}</li>)}</ul>
    `)
    expect(out).not.toContain('list(')
  })
})
})

// The plugin's default path. These assert the default itself, not a path a
// caller selected, so a silent flip of PluginOptions.runOnce fails here.
describe('default options compile the runOnce path', () => {
  const withDefaults = (code: string) => transformSync(code, {
    plugins: [plugin],
    parserOpts: { plugins: ['jsx'] },
    configFile: false,
    babelrc: false,
  })!.code!
  const legacy = (code: string) => transformSync(code, {
    plugins: [[plugin, { runOnce: false }]],
    parserOpts: { plugins: ['jsx'] },
    configFile: false,
    babelrc: false,
  })!.code!

  const source = `function Case(){ const [xs,setXs]=useState([{id:'a'}]); return <section><button onClick={()=>setXs([...xs,{id:'b'}])}>add</button><ul>{xs.map(x=><li key={x.id}>{x.id}</li>)}</ul></section>; }`

  it('compiles a keyed list into direct operations by default', () => {
    const out = withDefaults(source)
    expect(out).toContain('operationList')
    expect(out).toContain('listAppend')
  })

  it('still compiles the reconciling list() path when runOnce is false', () => {
    const out = legacy(source)
    expect(out).toContain('list(')
    expect(out).not.toContain('operationList')
  })

  it('applies runOnce rejections by default', () => {
    // A runOnce-only diagnostic: reaching it proves the default took that path.
    expect(() => withDefaults(`const x = createPortal(<div />, target, 'key')`))
      .toThrow(/createPortal keys are unsupported/)
  })

  it('cleans JSX text the way React does, on both paths', () => {
    // React's transform drops whitespace that touches a line break and joins the
    // remaining lines with one space. apps/compat-audit/tests/jsx-text.test.ts
    // compares the rendered result with React itself.
    const text = `function Case(){ const [name]=useState('Light'); return <p>{name} theme\n      <b>\n        Hello\n        world\n      </b></p>; }`
    for (const out of [withDefaults(text), legacy(text)]) {
      expect(out).toContain('" theme"')
      expect(out).toContain('"Hello world"')
      expect(out).not.toMatch(/"[^"]*\\n[^"]*"/)
    }
  })
})

// useReducer, useMemo and useCallback are rewritten before the import check runs.
// Ordinary React imports its hooks, so an import of a rewritten hook must still compile.
describe('runOnce: supported hooks imported from react', () => {
  it.each([
    ['useReducer', `import { useReducer } from 'react'; function C(){ const [s,d]=useReducer((a,x)=>a+x,0); return <b onClick={()=>d(1)}>{s}</b> }`],
    ['useMemo', `import { useMemo } from 'react'; function C({ n }){ const m=useMemo(()=>n*2,[n]); return <b>{m}</b> }`],
    ['useCallback', `import { useCallback, useState } from 'react'; function C(){ const [n,setN]=useState(0); const f=useCallback(()=>setN(n+1),[n]); return <b onClick={f}>{n}</b> }`],
  ])('compiles an imported %s', (_name, source) => {
    expect(() => transform(source, { runOnce: true })).not.toThrow()
  })

  it('still refuses an imported hook it does not support', () => {
    expect(() => transform(`import { useTransition } from 'react'; function C(){ const [p,s]=useTransition(); return <b>{p}</b> }`, { runOnce: true }))
      .toThrow(/imported custom or unsupported hooks|not supported/)
  })
})
