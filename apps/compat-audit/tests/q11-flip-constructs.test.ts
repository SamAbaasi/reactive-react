// The constructs apps/flip uses, compiled with `runOnce: false` -- the older
// reactive-wrapping path, which is now opt-out rather than the default.
//
// This file exists to keep that path honest while it is still supported, and to
// record why the default moved. Each case asserts what the legacy path actually
// produces, including where that is wrong: a getter leaking into an attribute,
// a provider value that never reaches its consumer, a conditional that renders
// the wrong branch from the first frame.
//
// The same constructs compiled with the default options are in
// runonce-constructs.test.ts, where they are asserted to be correct. If either
// side changes, one of these two files fails and the difference has to be
// re-recorded deliberately.
import { describe, it, expect } from 'vitest'
import { compile } from './harness'
import { h, list, mount } from '@rrjs/renderer'
import * as compat from '@rrjs/react-compat'

interface Probe {
  container: HTMLElement
  error: Error | null
  bump: (value?: unknown) => void
}

function probe(source: string, name: string): Probe {
  const container = document.createElement('div')
  document.body.appendChild(container)
  let bump: (value?: unknown) => void = () => {}
  try {
    const code = compile(source)
    const c = compat as unknown as Record<string, unknown>
    const Component = new Function(
      'h', 'list', 'useState', 'useEffect', 'useMemo', 'useRef',
      'useContext', 'createContext', '__register',
      `${code}\nreturn ${name};`,
    )(h, list, c.useState, c.useEffect, c.useMemo, c.useRef, c.useContext,
      c.createContext, (fn: (value?: unknown) => void) => { bump = fn })
    mount(Component as never, container)
    return { container, error: null, bump }
  } catch (err) {
    return { container, error: err as Error, bump }
  }
}

const txt = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()

describe('apps/flip constructs on the legacy path (runOnce: false)', () => {
  describe('works', () => {
    it('renders {props.children}', () => {
      const p = probe(`function Wrap(props) { return <div className="wrap">{props.children}</div>; }
        function Case() { return <Wrap><span>inner</span></Wrap>; }`, 'Case')
      expect(p.error).toBeNull()
      expect(txt(p.container)).toBe('inner')
      expect(p.container.querySelector('div.wrap > span')).not.toBeNull()
    })

    it('renders className from a ternary on a plain prop', () => {
      const p = probe(`function Row(props) { return <li className={props.done ? 'issue done' : 'issue'}>x</li>; }
        function Case() { return <ul><Row done={true} /></ul>; }`, 'Case')
      expect(p.error).toBeNull()
      expect(p.container.querySelector('li')?.className).toBe('issue done')
    })

    it('renders boolean and focus attributes', () => {
      const p = probe(`function Case() { return <input autoFocus disabled />; }`, 'Case')
      expect(p.error).toBeNull()
      const input = p.container.querySelector('input') as HTMLInputElement
      expect(input.disabled).toBe(true)
      expect(input.hasAttribute('autofocus')).toBe(true)
    })

    it('renders a mapped list bound to a variable', () => {
      const p = probe(`function Case() { const rows = [{id:1,t:'a'},{id:2,t:'b'}];
        const items = rows.map(r => <li key={r.id}>{r.t}</li>); return <ul>{items}</ul>; }`, 'Case')
      expect(p.error).toBeNull()
      expect(p.container.querySelectorAll('li').length).toBe(2)
      expect(txt(p.container)).toBe('ab')
    })

    it('takes an early return for an empty list', () => {
      const p = probe(`function Case() { const xs = []; if (xs.length === 0) return <p>Nothing here yet.</p>; return <ul/>; }`, 'Case')
      expect(p.error).toBeNull()
      expect(txt(p.container)).toBe('Nothing here yet.')
    })

    it('mounts a component with useEffect(fn, [])', () => {
      const p = probe(`function Case() { const [v] = useState('ok'); useEffect(() => { return () => {}; }, []); return <p>{v}</p>; }`, 'Case')
      expect(p.error).toBeNull()
      expect(txt(p.container)).toBe('ok')
    })
  })

  describe('is wrong, which is why the default moved', () => {
    it('throws when state is used as a value outside JSX', () => {
      // `items` is a getter here, so `items.filter` is not a function.
      const p = probe(`function Case() {
        const [items, setItems] = useState([{ id: 1, done: true }]);
        const done = items.filter(i => i.done).length;
        return <p>{done}</p>;
      }`, 'Case')
      expect(p.error).not.toBeNull()
      expect(p.error!.message).toMatch(/items\.filter is not a function/)
    })

    it('gives a consumer the default context value, not the provided one', () => {
      const p = probe(`const Ctx = createContext({ n: 'default' });
        function Child() { const v = useContext(Ctx); return <span>{v.n}</span>; }
        function Case() { return <Ctx.Provider value={{ n: 'provided' }}><Child /></Ctx.Provider>; }`, 'Case')
      expect(p.error).toBeNull()
      expect(txt(p.container)).toBe('default')
    })

    it('renders nothing for a logical-AND conditional, before and after a change', () => {
      const p = probe(`function Case() {
        const [route, setRoute] = useState('board');
        __register(setRoute);
        return <div>{route === 'board' && <span>BOARD</span>}</div>;
      }`, 'Case')
      expect(p.error).toBeNull()
      expect(txt(p.container)).toBe('')
      p.bump('stats')
      expect(txt(p.container)).toBe('')
    })

    it('picks the wrong ternary branch from the first frame and never changes it', () => {
      const p = probe(`function Case() {
        const [n, setN] = useState(0);
        __register(setN);
        return <div>{n === 0 ? <span>ZERO</span> : <em>OTHER</em>}</div>;
      }`, 'Case')
      expect(p.error).toBeNull()
      expect(txt(p.container)).toBe('OTHER')
      p.bump(1)
      expect(txt(p.container)).toBe('OTHER')
    })

    it('concatenates the getter source into an attribute', () => {
      const p = probe(`function Case() {
        const [t, setT] = useState('dark');
        return <div className={"theme-" + t}>x</div>;
      }`, 'Case')
      expect(p.error).toBeNull()
      const className = p.container.querySelector('div')?.className ?? ''
      expect(className.startsWith('theme-')).toBe(true)
      expect(className).not.toBe('theme-dark')
      expect(className).toMatch(/=>/)
    })
  })
})
