// Q3 — exact coverage matrix for @rrjs/babel-plugin + renderer on the legacy
// path (`runOnce: false`), which is now opt-out rather than the default.
//
// For each call site: is a getter auto-called, left as a raw function, or
// silently mis-handled? And separately — is the binding REACTIVE, i.e. does it
// update when the signal changes? Those are two different questions and the
// interesting failures are the ones that render correctly and then never update.
//
// Every row asserts the behaviour it records, including the wrong ones. That is
// deliberate: while this path is still supported it should not drift unnoticed,
// and the rows that are wrong here are the reason the default moved. The same
// call sites under the default options are asserted to be correct in
// runonce-constructs.test.ts.
import { describe, it, expect, afterAll } from 'vitest'
import { compile, record, printMatrix } from './harness'
import { h, list, mount } from '@rrjs/renderer'
import * as compat from '@rrjs/react-compat'

const GETTER_SOURCE_MARKER = 'getCurrentObserver'

interface Probe {
  container: HTMLElement
  bump: () => void
  log: string[]
}

/** Mounts `body` as a component with a signal `value` and a `bump()` that changes it. */
function probe(body: string): Probe {
  const src = `
    function Case() {
      const [value, setValue] = useState('A');
      __register(() => setValue('B'));
      ${body}
    }`
  const code = compile(src)
  const log: string[] = []
  let bump: () => void = () => {}
  const factory = new Function(
    'h', 'list', 'useState', 'useEffect', 'useMemo', 'useRef', '__register', '__log',
    `${code}\nreturn Case;`
  )
  const Case = factory(
    h, list, compat.useState, compat.useEffect, compat.useMemo, compat.useRef,
    (fn: () => void) => { bump = fn },
    (s: string) => log.push(s)
  )
  const container = document.createElement('div')
  document.body.appendChild(container)
  mount(Case as never, container)
  return { container, bump, log }
}


// Passive effects are queued on a MessageChannel (react-compat/src/instance.ts).
// Posting on our own channel is delivered FIFO after the library's, so this waits
// for the flush rather than racing a timer against it.
function afterEffects(): Promise<void> {
  return new Promise(resolve => {
    const ch = new MessageChannel()
    ch.port1.onmessage = () => setTimeout(resolve, 0)
    ch.port2.postMessage(null)
  })
}

const txt = (c: HTMLElement) => (c.textContent ?? '').replace(/\s+/g, ' ').trim()

function classify(before: string, after: string): string {
  if (before.includes(GETTER_SOURCE_MARKER) || after.includes(GETTER_SOURCE_MARKER)) return 'RAW FUNCTION'
  if (before === 'A' && after === 'B') return 'auto-called, reactive'
  if (before === 'A' && after === 'A') return 'auto-called, NOT reactive'
  return 'mis-handled'
}

describe('Q3 — plugin coverage matrix', () => {
  it('JSX child', () => {
    const p = probe(`return <div>{value}</div>;`)
    const before = txt(p.container)
    p.bump()
    const after = txt(p.container)
    record('JSX child {value}', classify(before, after), `before="${before.slice(0, 40)}" after="${after.slice(0, 40)}"`)
    expect(classify(before, after)).toBe('auto-called, reactive')
  })

  it('JSX attribute', () => {
    const p = probe(`return <div id={value}>x</div>;`)
    const read = () => p.container.querySelector('div')?.getAttribute('id') ?? '(none)'
    const before = read()
    p.bump()
    const after = read()
    record('JSX attribute id={value}', classify(before, after), `before="${before.slice(0, 40)}" after="${after.slice(0, 40)}"`)
    expect(classify(before, after)).toBe('auto-called, reactive')
  })

  it('JSX template literal', () => {
    const p = probe('return <div>{`n=${value}`}</div>;')
    const before = txt(p.container)
    p.bump()
    const after = txt(p.container)
    const norm = (s: string) => s.replace(/^n=/, '')
    record('JSX template literal', classify(norm(before), norm(after)), `before="${before.slice(0, 40)}" after="${after.slice(0, 40)}"`)
    // The getter is interpolated as a function, so its source text lands in the DOM.
    expect(classify(norm(before), norm(after))).toBe('RAW FUNCTION')
  })

  it('JSX conditional expression', () => {
    const p = probe(`return <div>{value === 'A' ? 'is-A' : 'is-B'}</div>;`)
    const before = txt(p.container)
    p.bump()
    const after = txt(p.container)
    record(
      'JSX conditional',
      before === 'is-A' && after === 'is-B' ? 'auto-called, reactive'
        : before === 'is-A' ? 'auto-called, NOT reactive' : 'mis-handled',
      `before="${before}" after="${after}"`
    )
    // Neither branch is re-evaluated: the wrong one is chosen and then kept.
    expect(before).toBe('is-B')
    expect(after).toBe('is-B')
  })

  it('nested object prop (style)', () => {
    const p = probe(`return <div style={{ color: value === 'A' ? 'red' : 'blue' }}>x</div>;`)
    const read = () => (p.container.querySelector('div') as HTMLElement)?.style.color ?? '(none)'
    const before = read()
    p.bump()
    const after = read()
    record(
      'nested object prop style={{k: v}}',
      before === 'red' && after === 'blue' ? 'auto-called, reactive'
        : before === 'red' ? 'auto-called, NOT reactive' : `mis-handled`,
      `before="${before}" after="${after}"`
    )
    expect(before).toBe('blue')
    expect(after).toBe('blue')
  })

  it('value passed as a prop to a child component', () => {
    const p = probe(`
      function Child(props) { return <span>{props.v}</span>; }
      return <div><Child v={value} /></div>;`)
    const before = txt(p.container)
    p.bump()
    const after = txt(p.container)
    record('prop to child component', classify(before, after), `before="${before.slice(0, 40)}" after="${after.slice(0, 40)}"`)
    expect(classify(before, after)).toBe('auto-called, reactive')
  })

  it('event handler body reading the value', () => {
    const p = probe(`
      return <div>
        <button onClick={() => __log('handler saw: ' + value)}>go</button>
      </div>;`)
    ;(p.container.querySelector('button') as HTMLElement).click()
    const seen = p.log[0] ?? '(nothing)'
    const isRaw = seen.includes(GETTER_SOURCE_MARKER)
    record(
      'event handler body',
      isRaw ? 'RAW FUNCTION' : seen.endsWith('A') ? 'auto-called' : 'mis-handled',
      isRaw ? 'value used as a value yields the getter source' : `saw "${seen.slice(0, 40)}"`
    )
    expect(isRaw).toBe(true)
    expect(seen).toContain(GETTER_SOURCE_MARKER)
  })

  it('plain statement outside JSX', () => {
    const p = probe(`
      const doubled = value + value;
      return <div>{doubled}</div>;`)
    const before = txt(p.container)
    const isRaw = before.includes(GETTER_SOURCE_MARKER)
    record(
      'plain statement outside JSX',
      isRaw ? 'RAW FUNCTION' : before === 'AA' ? 'auto-called' : 'mis-handled',
      isRaw ? 'concatenated the getter source instead of the value' : `rendered "${before.slice(0, 40)}"`
    )
    expect(isRaw).toBe(true)
    expect(before).not.toBe('AA')
  })

  it('useEffect deps array', async () => {
    const p = probe(`
      useEffect(() => { __log('effect:' + value()); }, [value]);
      return <div>{value}</div>;`)
    await afterEffects()
    const runsBefore = p.log.length
    p.bump()
    await afterEffects()
    const runsAfter = p.log.length
    record(
      'useEffect deps [value]',
      runsAfter > runsBefore ? 'reactive (re-runs)' : 'NOT reactive (never re-runs)',
      `effect runs: ${runsBefore} -> ${runsAfter}; deps hold the getter, whose identity never changes`
    )
    expect(runsBefore).toBe(1)
    expect(runsAfter).toBe(runsBefore)
  })

  it('useEffect deps array with value() called', async () => {
    const p = probe(`
      useEffect(() => { __log('effect:' + value()); }, [value()]);
      return <div>{value}</div>;`)
    await afterEffects()
    const runsBefore = p.log.length
    p.bump()
    await afterEffects()
    const runsAfter = p.log.length
    record(
      'useEffect deps [value()]',
      runsAfter > runsBefore ? 'reactive (re-runs)' : 'NOT reactive (never re-runs)',
      `effect runs: ${runsBefore} -> ${runsAfter} (components run once, so deps are only ever evaluated once)`
    )
    expect(runsBefore).toBe(1)
    expect(runsAfter).toBe(runsBefore)
  })

  it('useMemo deps array', () => {
    const p = probe(`
      const upper = useMemo(() => value().toUpperCase() + '!', [value]);
      return <div>{upper}</div>;`)
    const before = txt(p.container)
    p.bump()
    const after = txt(p.container)
    record(
      'useMemo deps [value]',
      before === 'A!' && after === 'B!' ? 'reactive' : before === 'A!' ? 'NOT reactive' : 'mis-handled',
      `before="${before.slice(0, 30)}" after="${after.slice(0, 30)}"`
    )
    expect(before).toBe('A!')
    expect(after).toBe('B!')
  })

  it('inline .map() in JSX (the rewrite path)', () => {
    const p = probe(`
      const rows = [{ id: 1, n: 'x' }, { id: 2, n: 'y' }];
      return <ul>{rows.map(r => <li key={r.id}>{r.n}</li>)}</ul>;`)
    const n = p.container.querySelectorAll('li').length
    record('inline .map() with key', n === 2 ? 'rewritten to list()' : 'mis-handled', `li count=${n}`)
    expect(n).toBe(2)
  })

  it('.map() via a variable', () => {
    const p = probe(`
      const rows = [{ id: 1, n: 'x' }, { id: 2, n: 'y' }];
      const items = rows.map(r => <li key={r.id}>{r.n}</li>);
      return <ul>{items}</ul>;`)
    const n = p.container.querySelectorAll('li').length
    record('.map() via a variable', n === 2 ? 'rewritten to list()' : 'STRINGIFIED', `li count=${n}, text="${txt(p.container).slice(0, 40)}"`)
    expect(n).toBe(2)
    expect(txt(p.container)).toBe('xy')
  })

  it('.map() without a key', () => {
    const p = probe(`
      const rows = ['x', 'y'];
      return <ul>{rows.map(r => <li>{r}</li>)}</ul>;`)
    const n = p.container.querySelectorAll('li').length
    record('.map() without key', n === 2 ? 'renders (not list())' : 'STRINGIFIED', `li count=${n}, text="${txt(p.container).slice(0, 40)}"`)
    expect(n).toBe(2)
    expect(txt(p.container)).toBe('xy')
  })

  it('JSX spread attributes', () => {
    const p = probe(`
      const props = { id: 'spread-id', title: 'T' };
      return <div {...props}>x</div>;`)
    const el = p.container.querySelector('div')
    const id = el?.getAttribute('id') ?? '(none)'
    record('JSX spread {...props}', id === 'spread-id' ? 'supported' : 'NOT SUPPORTED', `id="${id}" title="${el?.getAttribute('title') ?? '(none)'}"`)
    expect(id).toBe('spread-id')
    expect(el?.getAttribute('title')).toBe('T')
  })

  afterAll(() => printMatrix('Q3 — plugin/renderer coverage matrix'))
})
