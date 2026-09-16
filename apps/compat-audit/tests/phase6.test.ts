import { expect, it } from 'vitest'
import * as babel from '@babel/core'
import reactiveReact, { defineModuleContracts, resolveModuleMetadata } from '@rrjs/babel-plugin'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { h, mount } from '@rrjs/renderer'
import { useState } from '@rrjs/react-compat'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

function compile(source: string, moduleMetadata?: Record<string, unknown>): string {
  const result = babel.transformSync(source, {
    filename: 'module.tsx',
    plugins: [[reactiveReact, { runOnce: true, injectImports: false, moduleMetadata }]],
    presets: ['@babel/preset-typescript'],
    parserOpts: { plugins: ['jsx', 'typescript'] },
    configFile: false,
    babelrc: false,
    sourceType: 'module',
  })
  if (!result?.code) throw new Error('babel produced no output')
  return result.code
}

function compileFixture(source: string, react: boolean): string {
  return babel.transformSync(source, {
    filename: 'fixture.tsx',
    plugins: react ? [] : [[reactiveReact, { runOnce: true, injectImports: false }]],
    presets: react ? [['@babel/preset-react', { runtime: 'classic', pragma: 'h' }]] : [],
    configFile: false,
    babelrc: false,
  })!.code!
}

it('uses explicit imported hook and component contracts across a module edge', () => {
  const source = `
    import { useState } from 'react';
    import { useThing } from './context';
    import { Rows } from './Rows';
    export function App() {
      const [rows, setRows] = useState([{ id: 'a' }]);
      const thing = useThing();
      return <section className={thing.name}>
        <button onClick={() => setRows(previous => [...previous, { id: 'b' }])}>add</button>
        <Rows rows={rows} />
      </section>;
    }
  `
  const code = compile(source, {
    importedHooks: ['useThing'],
    importedComponents: { Rows: ['rows'] },
  })
  expect(code).toContain('listAppend')
  expect(code).toContain('thing().name')
  expect(code).toMatch(/["']rows["']:\s*\(\) => rows\(\)/)
})

it('resolves imported contracts by source and export identity through aliases', () => {
  const code = compile(`
    import { useState } from 'react';
    import { useThing as useAliasedThing } from './context';
    import { Rows as AliasedRows } from './Rows';
    export function App() {
      const [rows] = useState([{ id: 'a' }]);
      const thing = useAliasedThing();
      return <section className={thing.name}><AliasedRows rows={rows} /></section>;
    }
  `, {
    imports: {
      './context': { hooks: ['useThing'] },
      './Rows': { components: { Rows: ['rows'] } },
    },
  })
  expect(code).toContain('thing().name')
  expect(code).toMatch(/["']rows["']:\s*\(\) => rows\(\)/)

  expect(() => compile(`
    import { Rows } from './untrusted';
    export function App() { return <Rows label="x" />; }
  `, { imports: { './Rows': { components: { Rows: ['label'] } } } }))
    .toThrow(/only analyzed imported/)
})

it('resolves manifest entries by exact module path and rejects missing or malformed entries', () => {
  const manifest = defineModuleContracts({
    root: 'C:/project/src',
    modules: {
      'features/a/Rows.tsx': { operationProps: ['rows'] },
      'features/b/Rows.tsx': { operationProps: ['items'] },
    },
  })
  expect(resolveModuleMetadata(manifest, 'C:\\project\\src\\features\\a\\Rows.tsx?direct')).toEqual({ operationProps: ['rows'] })
  expect(resolveModuleMetadata(manifest, 'C:/project/src/features/b/Rows.tsx')).toEqual({ operationProps: ['items'] })
  expect(() => resolveModuleMetadata(manifest, 'C:/project/src/Rows.tsx')).toThrow(/no module contract/)
  expect(() => resolveModuleMetadata(manifest, 'C:/other/Rows.tsx')).toThrow(/outside the contract root/)
  expect(() => defineModuleContracts({ root: 'C:/project/src', modules: { './Rows.tsx': {} } }))
    .toThrow(/not normalized/)
})

it('rejects dynamic input types whose onChange event contract could change', () => {
  expect(() => compile(`
    import { useState } from 'react';
    export function Field() {
      const [kind] = useState('text');
      return <input type={kind} onChange={() => {}} />;
    }
  `)).toThrow(/dynamic input type with onChange/)
})

it('compiles an exported operation prop list without keyed reconciliation', () => {
  const source = `
    export function Rows({ rows }: { rows: Array<{ id: string }> }) {
      return <ul>{rows.map((row, index) => <li key={row.id} data-index={index}>{row.id}</li>)}</ul>;
    }
  `
  const code = compile(source, { operationProps: ['rows'] })
  expect(code).toContain('operationList')
  expect(code).not.toMatch(/\blist\s*\(/)
})

it('keeps source-declared static maps out of the keyed reconciler path', () => {
  const source = `
    const choices = ['low', 'high'];
    export function Form() {
      return <select>{choices.map(choice => <option key={choice}>{choice}</option>)}</select>;
    }
  `
  const code = compile(source)
  expect(code).toContain('.map(')
  expect(code).not.toMatch(/\blist\s*\(/)
})

it('preserves ordinary JavaScript value semantics inside fixed array maps', async () => {
  const source = `function FixedValues() {
    const [count, setCount] = useState(1);
    const rows = [{ key: 'fixed', value: count }].map(row =>
      <span key={row.key}>{row.value + 1}</span>);
    return <section><button onClick={() => setCount(count + 1)}>increment</button>{rows}</section>;
  }`
  const Native = new Function('h', 'useState', `${compileFixture(source, true)}; return FixedValues`)(React.createElement, React.useState)
  const nativeHost = document.createElement('div')
  document.body.appendChild(nativeHost)
  const root = createRoot(nativeHost)
  try {
    await React.act(async () => root.render(React.createElement(Native)))
    expect(nativeHost.querySelector('span')!.textContent).toBe('2')
    await React.act(async () => nativeHost.querySelector('button')!.click())
    expect(nativeHost.querySelector('span')!.textContent).toBe('3')
  } finally {
    await React.act(async () => root.unmount())
    nativeHost.remove()
  }

  const Target = new Function('h', 'useState', 'derive', `${compileFixture(source, false)}; return FixedValues`)(h, useState, undefined)
  const targetHost = document.createElement('div')
  document.body.appendChild(targetHost)
  const dispose = mount(Target, targetHost)
  try {
    expect(targetHost.querySelector('span')!.textContent).toBe('2')
    targetHost.querySelector('button')!.click()
    expect(targetHost.querySelector('span')!.textContent).toBe('3')
  } finally {
    dispose()
    targetHost.remove()
  }
})

it('rejects fixed-map reactive shapes that are not value-safe yet', () => {
  expect(() => compileFixture(`function App() {
    const [count] = useState(1);
    return <p>{[{ value: count }].map(({ value }) => <span key="x">{value}</span>)}</p>;
  }`, false)).toThrow(/identifier parameter/)
  expect(() => compileFixture(`function App() {
    const [count] = useState(1);
    return <p>{[count].map(value => <span key="x">{value + 1}</span>)}</p>;
  }`, false)).toThrow(/reactive primitive fixed-map elements/)
  expect(() => compileFixture(`function App() {
    const [count] = useState(1);
    return <p>{[{ key: count, value: count }].map(row => <span key={row.key}>{row.value}</span>)}</p>;
  }`, false)).toThrow(/reactive fixed-map keys/)
})

it('rejects a module const array whose membership escapes through an alias', () => {
  expect(() => compile(`
    const choices = ['low', 'high'];
    const mutable = choices;
    mutable.push('urgent');
    export function Form() {
      return <select>{choices.map(choice => <option key={choice}>{choice}</option>)}</select>;
    }
  `)).toThrow(/lists require direct operation compilation/)
})

it('rejects a parent mapper that changes an imported operation prop key', () => {
  expect(() => compile(`
    import { useState } from 'react';
    import { Rows } from './Rows';
    export function App() {
      const [rows, setRows] = useState([{ id: 'a', title: 'A' }]);
      return <section>
        <button onClick={() => setRows(rows.map(row => ({ ...row, id: 'changed' })))}>change</button>
        <Rows rows={rows} />
      </section>;
    }
  `, {
    importedComponents: { Rows: { props: ['rows'], operationKeys: { rows: 'id' } } },
  })).toThrow(/imported operation prop rows must preserve JSX key id/)
})

it('requires an exported operation list to use its contracted key', () => {
  expect(() => compile(`
    export function Rows({ rows }: { rows: Array<{ id: string, slug: string }> }) {
      return <ul>{rows.map(row => <li key={row.slug}>{row.id}</li>)}</ul>;
    }
  `, { operationProps: ['rows'], operationKeyProps: { rows: 'id' } }))
    .toThrow(/operation prop rows must use direct JSX key id/)
})
