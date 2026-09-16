import { expect, it } from 'vitest'
import { transformSync } from '@babel/core'
import plugin from '@rrjs/babel-plugin'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { h, listAppend, listClear, listFilter, listMap, listMove, listPrepend, listReverse, listSort, listSplice, listTruncate, mount, operationList } from '@rrjs/renderer'
import { useState } from '@rrjs/react-compat'
import { createSignal } from '@rrjs/signals'
import { assertArchitecture, captureRuntime } from '../../../scripts/acceptance/gates.mjs'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

it('matches native default sort ordering and undefined handling', () => {
  const sparse = ['ä', , 'Z', undefined, 'a'] as Array<string | undefined>
  const expected = Array.from(sparse)
  expected.sort()
  expect(listSort(sparse)).toEqual(expected)

  const calls: Array<[string | undefined, string | undefined]> = []
  const compared = listSort(sparse, (left, right) => {
    calls.push([left, right])
    return String(left).localeCompare(String(right))
  })
  const nativeCalls: Array<[string | undefined, string | undefined]> = []
  const native = Array.from(sparse)
  native.sort((left, right) => {
    nativeCalls.push([left, right])
    return String(left).localeCompare(String(right))
  })
  expect(compared).toEqual(native)
  expect(calls).toEqual(nativeCalls)
})

it('matches native splice coercion for NaN and infinities', () => {
  const previous = ['a', 'b', 'c']
  const native = (start: number, remove: number, ...inserted: string[]) => {
    const next = [...previous]
    next.splice(start, remove, ...inserted)
    return next
  }
  expect(listSplice(previous, Infinity, 1, 'x')).toEqual(native(Infinity, 1, 'x'))
  expect(listSplice(previous, -Infinity, 1, 'x')).toEqual(native(-Infinity, 1, 'x'))
  expect(listSplice(previous, Number.NaN, Number.NaN, 'x')).toEqual(native(Number.NaN, Number.NaN, 'x'))
  expect(listSplice(previous, 1, Infinity)).toEqual(native(1, Infinity))
  expect(listSplice(previous, 1, -Infinity, 'x')).toEqual(native(1, -Infinity, 'x'))
})

it('keeps 100 seeded direct-operation updates aligned with an array model', () => {
  let seed = 0x5eed1234
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed
  }
  type Row = { id: string; value: number }
  let serial = 3
  let model: Row[] = [
    { id: 'r0', value: 0 },
    { id: 'r1', value: 1 },
    { id: 'r2', value: 2 },
  ]
  let operationCurrent = model
  const [rows, setRows] = createSignal(operationCurrent)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const capture = captureRuntime()
  let dispose = () => {}
  try {
    dispose = mount(() => operationList(rows, (row, index) => h('span', { 'data-index': index }, () => `${row.id}:${row.value}`)), host)
    for (let step = 0; step < 100; step++) {
      const choice = random() % 7
      let next: Row[]
      if (choice === 0 || model.length === 0) {
        const row = { id: `r${serial}`, value: serial++ }
        next = listAppend(operationCurrent, row)
        model = [...model, row]
      } else if (choice === 1) {
        const row = { id: `r${serial}`, value: serial++ }
        next = listPrepend(operationCurrent, row)
        model = [row, ...model]
      } else if (choice === 2) {
        const length = random() % (model.length + 1)
        next = listTruncate(operationCurrent, length)
        model = model.slice(0, length)
      } else if (choice === 3) {
        const start = random() % (model.length + 1)
        const remove = random() % 3
        const row = { id: `r${serial}`, value: serial++ }
        next = listSplice(operationCurrent, start, remove, row)
        model = [...model]
        model.splice(start, remove, row)
      } else if (choice === 4) {
        next = listReverse(operationCurrent)
        model = [...model].reverse()
      } else if (choice === 5) {
        next = listSort(operationCurrent, (left, right) => left.id.localeCompare(right.id))
        model = [...model].sort((left, right) => left.id.localeCompare(right.id))
      } else {
        const parity = random() & 1
        next = listFilter(operationCurrent, row => (row.value & 1) === parity)
        model = model.filter(row => (row.value & 1) === parity)
      }
      operationCurrent = next
      setRows(operationCurrent)
      expect(Array.from(host.querySelectorAll('span'), node => node.textContent)).toEqual(
        model.map(row => `${row.id}:${row.value}`),
      )
      expect(Array.from(host.querySelectorAll('span'), node => node.getAttribute('data-index'))).toEqual(
        model.map((_row, index) => String(index)),
      )
    }
    expect(capture.events.filter(event => event.kind === 'reconciler-enter')).toHaveLength(0)
  } finally {
    dispose()
    capture.stop()
    host.remove()
  }
})

const source = `function App() {
  const [rows, setRows] = useState([{ id: 'a' }, { id: 'b' }]);
  return <section>
    <button onClick={() => setRows(previous => [...previous, { id: 'c' }])}>append</button>
    <button onClick={() => setRows(previous => [{ id: 'z' }, ...previous])}>prepend</button>
    <button onClick={() => setRows(previous => previous.slice(0, -1))}>remove last</button>
    <button onClick={() => setRows(previous => previous.toSpliced(1, 0, { id: 'm' }))}>insert middle</button>
    <button onClick={() => setRows(previous => previous.toSpliced(2, 1))}>remove middle</button>
    <button onClick={() => setRows(previous => previous.toReversed())}>reverse</button>
    <button onClick={() => setRows(previous => previous.toSorted((left, right) => right.id.localeCompare(left.id)))}>sort</button>
    <button onClick={() => setRows(previous => previous.filter(row => row.id !== 'm'))}>filter</button>
    <button onClick={() => setRows([...rows, { id: 'd' }])}>snapshot append</button>
    <button onClick={() => setRows(rows.filter(row => row.id !== 'z'))}>snapshot filter</button>
    <button onClick={() => setRows(rows.map(row => row.id === 'b' ? { ...row, title: 'changed' } : row))}>snapshot map</button>
    <button onClick={() => setRows([])}>clear</button>
    <ul>{rows.map((row, index) => { const label = row.id.toUpperCase(); return <li key={row.id} data-index={index}><input defaultValue={row.id}/>{row.title ?? label}</li>; })}</ul>
    <output>after</output>
  </section>;
}`

function compile(native: boolean): string {
  return transformSync(source, {
    plugins: native ? [] : [[plugin, { runOnce: true, injectImports: false }]],
    presets: native ? [['@babel/preset-react', { runtime: 'classic', pragma: 'h' }]] : [],
    configFile: false,
    babelrc: false,
  })!.code!
}

function compileSource(input: string, native: boolean): string {
  return transformSync(input, {
    plugins: native ? [] : [[plugin, { runOnce: true, injectImports: false }]],
    presets: native ? [['@babel/preset-react', { runtime: 'classic', pragma: 'h' }]] : [],
    configFile: false,
    babelrc: false,
  })!.code!
}

const snapshotReplacementSource = `function SnapshotReplacement() {
  const [rows, setRows] = useState([{ id: 'a' }, { id: 'b' }]);
  const append = id => { globalThis.snapshotOrder.push(id); return { id }; };
  return <section>
    <button onClick={() => {
      setRows([...rows, append('c')]);
      setRows([...rows, append('d')]);
    }}>replace twice</button>
    <ul>{rows.map(row => <li key={row.id}>{row.id}</li>)}</ul>
  </section>;
}`

const shadowedSnapshotSource = `function ShadowedSnapshot() {
  const [rows, setRows] = useState([{ id: 'outer' }]);
  return <section>
    <button onClick={() => {
      const rows = [{ id: 'local' }];
      setRows([...rows, { id: 'next' }]);
    }}>replace</button>
    <ul>{rows.map(row => <li key={row.id}>{row.id}</li>)}</ul>
  </section>;
}`

const keyChangingMapSource = `function KeyChangingMap() {
  const [rows, setRows] = useState([{ id: 'a', title: 'A' }]);
  return <section>
    <button onClick={() => setRows(rows.map(row => ({ ...row, id: 'b', title: 'B' })))}>change key</button>
    <ul>{rows.map(row => <li key={row.id}><input defaultValue={row.id}/>{row.title}</li>)}</ul>
  </section>;
}`

const chainedOperationsSource = `function ChainedOperations() {
  const [rows, setRows] = useState([{ id: 'a' }, { id: 'b' }]);
  return <section>
    <button onClick={() => {
      setRows(previous => [...previous, { id: 'c' }]);
      setRows(previous => [{ id: 'z' }, ...previous]);
      setRows(previous => previous.toReversed());
    }}>chain</button>
    <ul>{rows.map((row, index) => <li key={row.id} data-index={index}>{row.id}</li>)}</ul>
  </section>;
}`

const derivedLocalSource = `function DerivedLocal() {
  const [rows, setRows] = useState([{ id: 'a', title: 'alpha' }]);
  return <section>
    <button onClick={() => setRows(rows.map(row => ({ ...row, title: 'beta' })))}>rename</button>
    <ul>{rows.map(row => { const label = row.title.toUpperCase(); return <li key={row.id}>{label}</li>; })}</ul>
  </section>;
}`

const propListSource = `function PropListApp() {
  const [rows, setRows] = useState([{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }]);
  return <section>
    <button onClick={() => setRows(previous => [...previous, { id: 'c', title: 'C' }])}>append</button>
    <button onClick={() => setRows(rows.map(row => row.id === 'b' ? { ...row, title: 'changed' } : row))}>rename</button>
    <PropRows rows={rows} />
  </section>;
}
function PropRows({ rows }) {
  return <ul>{rows.map((row, index) => <li key={row.id} data-index={index}><input defaultValue={row.id}/>{row.title}</li>)}</ul>;
}`

const copiedMoveSource = `function CopiedMove() {
  const [rows, setRows] = useState([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  const move = (index, direction) => {
    const target = index + direction;
    if (index < 0 || target < 0 || target >= rows.length) return;
    const next = [...rows];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    setRows(next);
  };
  return <section>
    <button onClick={() => move(0, 1)}>move</button>
    <ul>{rows.map((row, index) => <li key={row.id} data-index={index}><input defaultValue={row.id}/>{row.id}</li>)}</ul>
  </section>;
}`
const copiedSliceMoveSource = copiedMoveSource.replace('const next = [...rows];', 'const next = rows.slice();')

it('matches React when two replacement setters consume one event snapshot', async () => {
  const Native = new Function('h', 'useState', `${compileSource(snapshotReplacementSource, true)}; return SnapshotReplacement`)(
    React.createElement,
    React.useState,
  )
  const nativeHost = document.createElement('div')
  document.body.appendChild(nativeHost)
  const root = createRoot(nativeHost)
  try {
    ;(globalThis as any).snapshotOrder = []
    await React.act(async () => root.render(React.createElement(Native)))
    await React.act(async () => nativeHost.querySelector('button')!.click())
    expect(Array.from(nativeHost.querySelectorAll('li'), node => node.textContent)).toEqual(['a', 'b', 'd'])
    expect((globalThis as any).snapshotOrder).toEqual(['c', 'd'])
  } finally {
    await React.act(async () => root.unmount())
    nativeHost.remove()
  }

  const code = compileSource(snapshotReplacementSource, false)
  expect(code).toMatch(/const _rows = rows\(\)/)
  expect(code.match(/listAppend\(_rows,/g)).toHaveLength(2)
  const Target = new Function('h', 'useState', 'operationList', 'listAppend', `${code}; return SnapshotReplacement`)(
    h, useState, operationList, listAppend,
  )
  const targetHost = document.createElement('div')
  document.body.appendChild(targetHost)
  let dispose = () => {}
  try {
    ;(globalThis as any).snapshotOrder = []
    dispose = mount(Target, targetHost)
    const before = Array.from(targetHost.querySelectorAll('li'))
    targetHost.querySelector('button')!.click()
    expect(Array.from(targetHost.querySelectorAll('li'), node => node.textContent)).toEqual(['a', 'b', 'd'])
    expect(Array.from(targetHost.querySelectorAll('li')).slice(0, 2)).toEqual(before)
    expect((globalThis as any).snapshotOrder).toEqual(['c', 'd'])
  } finally {
    dispose()
    targetHost.remove()
  }
})

it('uses lexical binding identity and rejects a shadowed replacement explicitly', async () => {
  const Native = new Function('h', 'useState', `${compileSource(shadowedSnapshotSource, true)}; return ShadowedSnapshot`)(
    React.createElement,
    React.useState,
  )
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    await React.act(async () => root.render(React.createElement(Native)))
    await React.act(async () => host.querySelector('button')!.click())
    expect(Array.from(host.querySelectorAll('li'), node => node.textContent)).toEqual(['local', 'next'])
  } finally {
    await React.act(async () => root.unmount())
    host.remove()
  }

  expect(() => compileSource(shadowedSnapshotSource, false)).toThrow(/array replacement from a non-state snapshot is unsupported without identity matching/)
})

it('rejects a positional listMap when React would replace a changed-key row', async () => {
  const Native = new Function('h', 'useState', `${compileSource(keyChangingMapSource, true)}; return KeyChangingMap`)(
    React.createElement,
    React.useState,
  )
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    await React.act(async () => root.render(React.createElement(Native)))
    const before = host.querySelector('li')
    await React.act(async () => host.querySelector('button')!.click())
    expect(host.querySelector('li')?.textContent).toBe('B')
    expect(host.querySelector('li')).not.toBe(before)
  } finally {
    await React.act(async () => root.unmount())
    host.remove()
  }

  expect(() => compileSource(keyChangingMapSource, false)).toThrow(/listMap must statically preserve the direct-property JSX key/)
})

it('matches a batched chain whose functional updaters have direct predecessors', async () => {
  const Native = new Function('h', 'useState', `${compileSource(chainedOperationsSource, true)}; return ChainedOperations`)(
    React.createElement,
    React.useState,
  )
  const nativeHost = document.createElement('div')
  document.body.appendChild(nativeHost)
  const root = createRoot(nativeHost)
  try {
    await React.act(async () => root.render(React.createElement(Native)))
    await React.act(async () => nativeHost.querySelector('button')!.click())
    expect(Array.from(nativeHost.querySelectorAll('li'), node => node.textContent)).toEqual(['c', 'b', 'a', 'z'])
  } finally {
    await React.act(async () => root.unmount())
    nativeHost.remove()
  }

  const code = compileSource(chainedOperationsSource, false)
  const Target = new Function('h', 'useState', 'operationList', 'listAppend', 'listPrepend', 'listReverse', `${code}; return ChainedOperations`)(
    h, useState, operationList, listAppend, listPrepend, listReverse,
  )
  const targetHost = document.createElement('div')
  document.body.appendChild(targetHost)
  let dispose = () => {}
  try {
    dispose = mount(Target, targetHost)
    const before = Array.from(targetHost.querySelectorAll('li'))
    targetHost.querySelector('button')!.click()
    const after = Array.from(targetHost.querySelectorAll('li'))
    expect(after.map(node => node.textContent)).toEqual(['c', 'b', 'a', 'z'])
    expect(after.map(node => node.getAttribute('data-index'))).toEqual(['0', '1', '2', '3'])
    expect(after[1]).toBe(before[1])
    expect(after[2]).toBe(before[0])
  } finally {
    dispose()
    targetHost.remove()
  }
})

it('rejects item-derived callback locals that a stable-key map can make stale', async () => {
  const Native = new Function('h', 'useState', `${compileSource(derivedLocalSource, true)}; return DerivedLocal`)(
    React.createElement,
    React.useState,
  )
  const nativeHost = document.createElement('div')
  document.body.appendChild(nativeHost)
  const root = createRoot(nativeHost)
  try {
    await React.act(async () => root.render(React.createElement(Native)))
    await React.act(async () => nativeHost.querySelector('button')!.click())
    expect(nativeHost.querySelector('li')?.textContent).toBe('BETA')
  } finally {
    await React.act(async () => root.unmount())
    nativeHost.remove()
  }

  expect(() => compileSource(derivedLocalSource, false)).toThrow(/callback locals derived from mutable item fields/)
})

it('propagates direct list operations through a local component prop', async () => {
  const Native = new Function('h', 'useState', `${compileSource(propListSource, true)}; return PropListApp`)(
    React.createElement,
    React.useState,
  )
  const nativeHost = document.createElement('div')
  document.body.appendChild(nativeHost)
  const root = createRoot(nativeHost)
  try {
    await React.act(async () => root.render(React.createElement(Native)))
    const before = Array.from(nativeHost.querySelectorAll('li'))
    await React.act(async () => nativeHost.querySelectorAll('button')[0].click())
    await React.act(async () => nativeHost.querySelectorAll('button')[1].click())
    expect(Array.from(nativeHost.querySelectorAll('li'), node => node.textContent)).toEqual(['A', 'changed', 'C'])
    expect(nativeHost.querySelectorAll('li')[1]).toBe(before[1])
  } finally {
    await React.act(async () => root.unmount())
    nativeHost.remove()
  }

  const code = compileSource(propListSource, false)
  expect(code).toContain('operationList')
  const Target = new Function('h', 'useState', 'operationList', 'listAppend', 'listMap', `${code}; return PropListApp`)(
    h, useState, operationList, listAppend, listMap,
  )
  const targetHost = document.createElement('div')
  document.body.appendChild(targetHost)
  let dispose = () => {}
  try {
    dispose = mount(Target, targetHost)
    const before = Array.from(targetHost.querySelectorAll('li'))
    targetHost.querySelectorAll('button')[0].click()
    targetHost.querySelectorAll('button')[1].click()
    expect(Array.from(targetHost.querySelectorAll('li'), node => node.textContent)).toEqual(['A', 'changed', 'C'])
    expect(targetHost.querySelectorAll('li')[1]).toBe(before[1])
  } finally {
    dispose()
    targetHost.remove()
  }
})

it('compiles the copied-array two-splice idiom as one direct move', async () => {
  const Native = new Function('h', 'useState', `${compileSource(copiedMoveSource, true)}; return CopiedMove`)(
    React.createElement,
    React.useState,
  )
  const nativeHost = document.createElement('div')
  document.body.appendChild(nativeHost)
  const root = createRoot(nativeHost)
  try {
    await React.act(async () => root.render(React.createElement(Native)))
    const before = Array.from(nativeHost.querySelectorAll('li'))
    await React.act(async () => nativeHost.querySelector('button')!.click())
    expect(Array.from(nativeHost.querySelectorAll('li'), node => node.textContent)).toEqual(['b', 'a', 'c'])
    expect(nativeHost.querySelectorAll('li')[1]).toBe(before[0])
  } finally {
    await React.act(async () => root.unmount())
    nativeHost.remove()
  }

  const code = compileSource(copiedMoveSource, false)
  expect(code).toContain('listMove')
  const Target = new Function('h', 'useState', 'operationList', 'listMove', `${code}; return CopiedMove`)(
    h, useState, operationList, listMove,
  )
  const targetHost = document.createElement('div')
  document.body.appendChild(targetHost)
  let dispose = () => {}
  try {
    dispose = mount(Target, targetHost)
    const before = Array.from(targetHost.querySelectorAll('li'))
    targetHost.querySelector('button')!.click()
    expect(Array.from(targetHost.querySelectorAll('li'), node => node.textContent)).toEqual(['b', 'a', 'c'])
    expect(targetHost.querySelectorAll('li')[1]).toBe(before[0])
    expect(Array.from(targetHost.querySelectorAll('li'), node => node.getAttribute('data-index'))).toEqual(['0', '1', '2'])
  } finally {
    dispose()
    targetHost.remove()
  }
})

it('recognizes the unchanged app zero-argument slice copy as direct move provenance', async () => {
  const code = compileSource(copiedSliceMoveSource, false)
  expect(code).toContain('listMove')
  expect(code).not.toContain('.splice(')
  const Target = new Function('h', 'useState', 'operationList', 'listMove', `${code}; return CopiedMove`)(h, useState, operationList, listMove)
  const targetHost = document.createElement('div')
  document.body.appendChild(targetHost)
  const dispose = mount(Target, targetHost)
  try {
    const before = Array.from(targetHost.querySelectorAll('li'))
    targetHost.querySelector('button')!.click()
    expect(Array.from(targetHost.querySelectorAll('li'), node => node.textContent)).toEqual(['b', 'a', 'c'])
    expect(targetHost.querySelectorAll('li')[1]).toBe(before[0])
  } finally {
    dispose()
    targetHost.remove()
  }
})

it('rejects copied move lookalikes that cannot preserve evaluation and binding semantics', () => {
  const cases = [
    copiedMoveSource.replace('if (index < 0 || target < 0 || target >= rows.length) return;', ''),
    copiedMoveSource.replace('const next = [...rows];', 'const next = [...rows], marker = globalThis.sideEffect();'),
    copiedMoveSource.replace('setRows(next);', 'setRows(next); globalThis.after = next;'),
    copiedMoveSource.replace('next.splice(index, 1)', 'next.splice(globalThis.readIndex(), 1)'),
  ]
  for (const input of cases) expect(() => compileSource(input, false)).toThrow(/opaque list replacement|unsupported|lists require direct operation compilation/)
})

it('records React identity and index behavior for a known append operation', async () => {
  const App = new Function('h', 'useState', `${compile(true)}; return App`)(
    React.createElement,
    React.useState,
  )
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    await React.act(async () => root.render(React.createElement(App)))
    const before = Array.from(host.querySelectorAll('li'))
    const retainedInput = before[1].querySelector('input')!
    retainedInput.value = 'typed'
    retainedInput.focus()
    retainedInput.setSelectionRange(1, 3)
    const following = host.querySelector('output')
    await React.act(async () => host.querySelector('button')!.click())
    const after = Array.from(host.querySelectorAll('li'))
    expect(after.map(node => node.textContent)).toEqual(['A', 'B', 'C'])
    expect(after.map(node => node.getAttribute('data-index'))).toEqual(['0', '1', '2'])
    expect(after[0]).toBe(before[0])
    expect(after[1]).toBe(before[1])
    expect(host.querySelector('output')).toBe(following)
    await React.act(async () => host.querySelectorAll('button')[1].click())
    expect(Array.from(host.querySelectorAll('li'), node => node.textContent)).toEqual(['Z', 'A', 'B', 'C'])
    expect(Array.from(host.querySelectorAll('li'), node => node.getAttribute('data-index'))).toEqual(['0', '1', '2', '3'])
    expect(host.querySelectorAll('li')[1]).toBe(before[0])
    expect(host.querySelectorAll('li')[2]).toBe(before[1])
    await React.act(async () => host.querySelectorAll('button')[2].click())
    expect(Array.from(host.querySelectorAll('li'), node => node.textContent)).toEqual(['Z', 'A', 'B'])
    await React.act(async () => host.querySelectorAll('button')[3].click())
    expect(Array.from(host.querySelectorAll('li'), node => node.textContent)).toEqual(['Z', 'M', 'A', 'B'])
    expect(Array.from(host.querySelectorAll('li'), node => node.getAttribute('data-index'))).toEqual(['0', '1', '2', '3'])
    expect(host.querySelectorAll('li')[2]).toBe(before[0])
    await React.act(async () => host.querySelectorAll('button')[4].click())
    expect(Array.from(host.querySelectorAll('li'), node => node.textContent)).toEqual(['Z', 'M', 'B'])
    expect(Array.from(host.querySelectorAll('li'), node => node.getAttribute('data-index'))).toEqual(['0', '1', '2'])
    const moveFocusEvents: string[] = []
    retainedInput.addEventListener('focus', () => moveFocusEvents.push('focus'))
    retainedInput.addEventListener('blur', () => moveFocusEvents.push('blur'))
    await React.act(async () => host.querySelectorAll('button')[5].click())
    expect(Array.from(host.querySelectorAll('li'), node => node.textContent)).toEqual(['B', 'M', 'Z'])
    expect(Array.from(host.querySelectorAll('li'), node => node.getAttribute('data-index'))).toEqual(['0', '1', '2'])
    expect(document.activeElement).toBe(retainedInput)
    expect(moveFocusEvents).toEqual([])
    await React.act(async () => host.querySelectorAll('button')[6].click())
    expect(Array.from(host.querySelectorAll('li'), node => node.textContent)).toEqual(['Z', 'M', 'B'])
    expect(host.querySelectorAll('li')[2]).toBe(before[1])
    await React.act(async () => host.querySelectorAll('button')[7].click())
    expect(Array.from(host.querySelectorAll('li'), node => node.textContent)).toEqual(['Z', 'B'])
    expect(Array.from(host.querySelectorAll('li'), node => node.getAttribute('data-index'))).toEqual(['0', '1'])
    expect(host.querySelectorAll('li')[1]).toBe(before[1])
    expect(host.querySelectorAll('li')[1].querySelector('input')).toBe(retainedInput)
    expect(retainedInput.value).toBe('typed')
    expect(document.activeElement).toBe(retainedInput)
    expect([retainedInput.selectionStart, retainedInput.selectionEnd]).toEqual([1, 3])
    await React.act(async () => host.querySelectorAll('button')[8].click())
    expect(Array.from(host.querySelectorAll('li'), node => node.textContent)).toEqual(['Z', 'B', 'D'])
    expect(host.querySelectorAll('li')[1]).toBe(before[1])
    await React.act(async () => host.querySelectorAll('button')[9].click())
    expect(Array.from(host.querySelectorAll('li'), node => node.textContent)).toEqual(['B', 'D'])
    expect(host.querySelectorAll('li')[0]).toBe(before[1])
    await React.act(async () => host.querySelectorAll('button')[10].click())
    expect(Array.from(host.querySelectorAll('li'), node => node.textContent)).toEqual(['changed', 'D'])
    expect(host.querySelectorAll('li')[0]).toBe(before[1])
    expect(host.querySelectorAll('li')[0].querySelector('input')).toBe(retainedInput)
    await React.act(async () => host.querySelectorAll('button')[11].click())
    expect(host.querySelectorAll('li')).toHaveLength(0)
    expect(host.querySelector('output')).toBe(following)
  } finally {
    await React.act(async () => root.unmount())
    host.remove()
  }
})

it('executes the known append directly without reconciliation or remounting', () => {
  const code = compile(false)
  expect(code).toContain('operationList')
  expect(code).toContain('listAppend')
  expect(code).not.toMatch(/\blist\s*\(/)
  expect(code).toContain('listClear')
  expect(code).toContain('listTruncate')
  expect(code).toContain('listPrepend')
  expect(code).toContain('listSplice')
  expect(code).toContain('listReverse')
  expect(code).toContain('listFilter')
  expect(code).toContain('listSort')
  expect(code).toContain('listMap')
  const App = new Function('h', 'useState', 'operationList', 'listAppend', 'listClear', 'listTruncate', 'listPrepend', 'listSplice', 'listReverse', 'listFilter', 'listSort', 'listMap', `${code}; return App`)(
    h, useState, operationList, listAppend, listClear, listTruncate, listPrepend, listSplice, listReverse, listFilter, listSort, listMap,
  )
  const host = document.createElement('div')
  document.body.appendChild(host)
  const capture = captureRuntime()
  let dispose = () => {}
  try {
    dispose = mount(App, host)
    const before = Array.from(host.querySelectorAll('li'))
    const retainedInput = before[1].querySelector('input')!
    retainedInput.value = 'typed'
    retainedInput.focus()
    retainedInput.setSelectionRange(1, 3)
    const following = host.querySelector('output')
    host.querySelector('button')!.click()
    const after = Array.from(host.querySelectorAll('li'))
    expect(after.map(node => node.textContent)).toEqual(['A', 'B', 'C'])
    expect(after.map(node => node.getAttribute('data-index'))).toEqual(['0', '1', '2'])
    expect(after[0]).toBe(before[0])
    expect(after[1]).toBe(before[1])
    expect(host.querySelector('output')).toBe(following)
    host.querySelectorAll('button')[1].click()
    expect(Array.from(host.querySelectorAll('li'), node => node.textContent)).toEqual(['Z', 'A', 'B', 'C'])
    expect(Array.from(host.querySelectorAll('li'), node => node.getAttribute('data-index'))).toEqual(['0', '1', '2', '3'])
    expect(host.querySelectorAll('li')[1]).toBe(before[0])
    expect(host.querySelectorAll('li')[2]).toBe(before[1])
    host.querySelectorAll('button')[2].click()
    expect(Array.from(host.querySelectorAll('li'), node => node.textContent)).toEqual(['Z', 'A', 'B'])
    host.querySelectorAll('button')[3].click()
    expect(Array.from(host.querySelectorAll('li'), node => node.textContent)).toEqual(['Z', 'M', 'A', 'B'])
    expect(Array.from(host.querySelectorAll('li'), node => node.getAttribute('data-index'))).toEqual(['0', '1', '2', '3'])
    expect(host.querySelectorAll('li')[2]).toBe(before[0])
    host.querySelectorAll('button')[4].click()
    expect(Array.from(host.querySelectorAll('li'), node => node.textContent)).toEqual(['Z', 'M', 'B'])
    expect(Array.from(host.querySelectorAll('li'), node => node.getAttribute('data-index'))).toEqual(['0', '1', '2'])
    const moveFocusEvents: string[] = []
    retainedInput.addEventListener('focus', () => moveFocusEvents.push('focus'))
    retainedInput.addEventListener('blur', () => moveFocusEvents.push('blur'))
    host.querySelectorAll('button')[5].click()
    expect(Array.from(host.querySelectorAll('li'), node => node.textContent)).toEqual(['B', 'M', 'Z'])
    expect(Array.from(host.querySelectorAll('li'), node => node.getAttribute('data-index'))).toEqual(['0', '1', '2'])
    expect(document.activeElement).toBe(retainedInput)
    expect(moveFocusEvents).toEqual(['focus'])
    host.querySelectorAll('button')[6].click()
    expect(Array.from(host.querySelectorAll('li'), node => node.textContent)).toEqual(['Z', 'M', 'B'])
    expect(host.querySelectorAll('li')[2]).toBe(before[1])
    host.querySelectorAll('button')[7].click()
    expect(Array.from(host.querySelectorAll('li'), node => node.textContent)).toEqual(['Z', 'B'])
    expect(Array.from(host.querySelectorAll('li'), node => node.getAttribute('data-index'))).toEqual(['0', '1'])
    expect(host.querySelectorAll('li')[1]).toBe(before[1])
    expect(host.querySelectorAll('li')[1].querySelector('input')).toBe(retainedInput)
    expect(retainedInput.value).toBe('typed')
    expect(document.activeElement).toBe(retainedInput)
    expect([retainedInput.selectionStart, retainedInput.selectionEnd]).toEqual([1, 3])
    host.querySelectorAll('button')[8].click()
    expect(Array.from(host.querySelectorAll('li'), node => node.textContent)).toEqual(['Z', 'B', 'D'])
    expect(host.querySelectorAll('li')[1]).toBe(before[1])
    host.querySelectorAll('button')[9].click()
    expect(Array.from(host.querySelectorAll('li'), node => node.textContent)).toEqual(['B', 'D'])
    expect(host.querySelectorAll('li')[0]).toBe(before[1])
    host.querySelectorAll('button')[10].click()
    expect(Array.from(host.querySelectorAll('li'), node => node.textContent)).toEqual(['changed', 'D'])
    expect(host.querySelectorAll('li')[0]).toBe(before[1])
    expect(host.querySelectorAll('li')[0].querySelector('input')).toBe(retainedInput)
    host.querySelectorAll('button')[11].click()
    expect(host.querySelectorAll('li')).toHaveLength(0)
    expect(host.querySelector('output')).toBe(following)
    expect(capture.events.filter(event => event.kind === 'list-operation')).toHaveLength(12)
    assertArchitecture(capture.events, { instances: 1, bodyExecutions: 1, unmounted: false })
    dispose()
    dispose = () => {}
    assertArchitecture(capture.events, { instances: 1, bodyExecutions: 1 })
  } finally {
    dispose()
    capture.stop()
    host.remove()
  }
})
