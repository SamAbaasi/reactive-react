import { describe, it, expect } from 'vitest'
import { transformSync } from '@babel/core'
import plugin from '../src/index'

function transform(code: string): string {
  const result = transformSync(code, {
    plugins: [plugin],
    parserOpts: { plugins: ['jsx'] },
    generatorOpts: { compact: true, retainLines: false },
  })
  return result?.code ?? ''
}

describe('static content — no thunks needed', () => {
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
    expect(out).toContain(`h("div",null,h("span",null,"hi"))`)
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