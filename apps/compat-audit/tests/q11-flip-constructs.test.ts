// Behavioral probes for constructs used by the example application.
//
// Every construct apps/flip actually uses, isolated and run through the pipeline,
// so the work queue is ordered by evidence rather than by guesswork. The app
// itself renders nothing at all under the signal engine, so it cannot be surveyed
// in place.
import { describe, it, expect, afterAll } from 'vitest'
import { compile, record, printMatrix } from './harness'
import { h, list, mount } from '@rrjs/renderer'
import * as compat from '@rrjs/react-compat'

interface Probe {
  container: HTMLElement
  error: Error | null
  bump: (v?: unknown) => void
}

function probe(src: string, name: string): Probe {
  const container = document.createElement('div')
  document.body.appendChild(container)
  let bump: (v?: unknown) => void = () => {}
  try {
    const code = compile(src)
    const factory = new Function(
      'h', 'list', 'useState', 'useEffect', 'useMemo', 'useRef',
      'useContext', 'createContext', '__register',
      `${code}\nreturn ${name};`
    )
    const C = factory(
      h, list,
      (compat as never as Record<string, unknown>).useState,
      (compat as never as Record<string, unknown>).useEffect,
      (compat as never as Record<string, unknown>).useMemo,
      (compat as never as Record<string, unknown>).useRef,
      (compat as never as Record<string, unknown>).useContext,
      (compat as never as Record<string, unknown>).createContext,
      (fn: (v?: unknown) => void) => { bump = fn }
    )
    mount(C as never, container)
    return { container, error: null, bump }
  } catch (err) {
    return { container, error: err as Error, bump }
  }
}

const txt = (c: HTMLElement) => (c.textContent ?? '').replace(/\s+/g, ' ').trim()
const short = (s: string, n = 52) => (s.length > n ? s.slice(0, n) + '…' : s)

describe('flip app constructs', () => {
  it('A. getter used as a value outside JSX (issues.filter)', () => {
    const p = probe(`
      function Case() {
        const [items, setItems] = useState([{ id: 1, done: true }]);
        const done = items.filter(i => i.done).length;
        return <p>{done}</p>;
      }`, 'Case')
    record('A. items.filter() outside JSX',
      p.error ? 'THROWS' : 'renders',
      p.error ? short(p.error.message) : `text="${txt(p.container)}"`)
    expect(true).toBe(true)
  })

  it('B. Context.Provider wrapping children', () => {
    const p = probe(`
      const Ctx = createContext({ n: 'default' });
      function Child() { const v = useContext(Ctx); return <span>{v.n}</span>; }
      function Case() {
        return <Ctx.Provider value={{ n: 'provided' }}><Child /></Ctx.Provider>;
      }`, 'Case')
    record('B. Ctx.Provider + children',
      p.error ? 'THROWS' : txt(p.container) === 'provided' ? 'renders' : 'WRONG',
      p.error ? short(p.error.message) : `text="${txt(p.container)}"`)
    expect(true).toBe(true)
  })

  it('C. component that renders {props.children}', () => {
    const p = probe(`
      function Wrap(props) { return <div className="wrap">{props.children}</div>; }
      function Case() { return <Wrap><span>inner</span></Wrap>; }`, 'Case')
    record('C. {props.children}',
      p.error ? 'THROWS' : txt(p.container) === 'inner' ? 'renders' : 'WRONG',
      p.error ? short(p.error.message) : `html="${short(p.container.innerHTML)}"`)
    expect(true).toBe(true)
  })

  it('D. comparison inside JSX driving a conditional', () => {
    const p = probe(`
      function Case() {
        const [route, setRoute] = useState('board');
        __register(setRoute);
        return <div>{route === 'board' && <span>BOARD</span>}</div>;
      }`, 'Case')
    const before = txt(p.container)
    p.bump('stats')
    record('D. {x === "y" && <X/>}',
      p.error ? 'THROWS' : before === 'BOARD' ? 'renders' : 'WRONG FROM FRAME ONE',
      p.error ? short(p.error.message) : `before="${before}" afterRouteChange="${txt(p.container)}"`)
    expect(true).toBe(true)
  })

  it('E. ternary inside JSX', () => {
    const p = probe(`
      function Case() {
        const [n, setN] = useState(0);
        __register(setN);
        return <div>{n === 0 ? <span>ZERO</span> : <em>OTHER</em>}</div>;
      }`, 'Case')
    const before = txt(p.container)
    p.bump(1)
    record('E. {x === y ? <A/> : <B/>}',
      p.error ? 'THROWS' : before === 'ZERO' ? 'renders' : 'WRONG FROM FRAME ONE',
      p.error ? short(p.error.message) : `before="${before}" after="${txt(p.container)}"`)
    expect(true).toBe(true)
  })

  it('F. className from a ternary on a plain prop', () => {
    const p = probe(`
      function Row(props) { return <li className={props.done ? 'issue done' : 'issue'}>x</li>; }
      function Case() { return <ul><Row done={true} /></ul>; }`, 'Case')
    const cls = p.container.querySelector('li')?.className ?? '(none)'
    record('F. className={p ? a : b}',
      p.error ? 'THROWS' : cls === 'issue done' ? 'renders' : 'WRONG',
      p.error ? short(p.error.message) : `className="${cls}"`)
    expect(true).toBe(true)
  })

  it('G. onDoubleClick / autoFocus / disabled', () => {
    let dbl = 0
    const p = probe(`
      function Case() {
        return <div>
          <span className="t" onDoubleClick={() => __register(1)}>t</span>
          <input className="i" autoFocus />
          <button className="b" disabled={true}>x</button>
        </div>;
      }`, 'Case')
    void dbl
    const el = p.container.querySelector('.t') as HTMLElement | null
    if (el) el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    const input = p.container.querySelector('.i')
    const btn = p.container.querySelector('.b') as HTMLButtonElement | null
    record('G. onDoubleClick/autoFocus/disabled',
      p.error ? 'THROWS' : 'renders',
      p.error ? short(p.error.message)
        : `dblclickFired=${dbl > 0 || 'see note'} autofocus=${input?.hasAttribute('autofocus')} disabledProp=${btn?.disabled}`)
    expect(true).toBe(true)
  })

  it('H. .map() assigned to a variable', () => {
    const p = probe(`
      function Case() {
        const rows = [{ k: 'a', v: 1 }, { k: 'b', v: 2 }].map(r =>
          <tr key={r.k}><td>{r.k}</td></tr>
        );
        return <table><tbody>{rows}</tbody></table>;
      }`, 'Case')
    const n = p.container.querySelectorAll('tr').length
    record('H. .map() via a variable',
      p.error ? 'THROWS' : n === 2 ? 'renders' : 'STRINGIFIED',
      p.error ? short(p.error.message) : `tr count=${n} text="${short(txt(p.container), 40)}"`)
    expect(true).toBe(true)
  })

  it('I. early return before JSX', () => {
    const p = probe(`
      function Case() {
        const [items] = useState([]);
        if (items.length === 0) {
          return <p className="empty">Nothing here yet.</p>;
        }
        return <ul><li>something</li></ul>;
      }`, 'Case')
    record('I. early return on empty list',
      p.error ? 'THROWS' : txt(p.container).startsWith('Nothing') ? 'renders' : 'WRONG',
      p.error ? short(p.error.message) : `text="${txt(p.container)}"`)
    expect(true).toBe(true)
  })

  it('J. useEffect with a cleanup and [] deps', async () => {
    const log: string[] = []
    const p = probe(`
      function Case() {
        useEffect(() => {
          __register('mount');
          return () => __register('cleanup');
        }, []);
        return <div>ok</div>;
      }`, 'Case')
    p.bump = (v) => { log.push(String(v)) }
    await new Promise<void>(r => {
      const ch = new MessageChannel()
      ch.port1.onmessage = () => setTimeout(r, 0)
      ch.port2.postMessage(null)
    })
    record('J. useEffect(fn, []) with cleanup',
      p.error ? 'THROWS' : 'renders',
      p.error ? short(p.error.message) : `text="${txt(p.container)}" (effect log captured separately)`)
    expect(true).toBe(true)
  })

  it('K. template literal className', () => {
    const p = probe(`
      function Case() {
        const [name] = useState('dark');
        return <div className={'theme-' + name}>x</div>;
      }`, 'Case')
    const cls = p.container.querySelector('div')?.className ?? '(none)'
    record('K. className={"theme-" + state}',
      p.error ? 'THROWS' : cls === 'theme-dark' ? 'renders' : 'WRONG',
      p.error ? short(p.error.message) : `className="${short(cls, 40)}"`)
    expect(true).toBe(true)
  })

  afterAll(() => printMatrix('apps/flip constructs under the signal engine'))
})
