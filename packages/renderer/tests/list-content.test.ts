// Regression tests for the keyed-list content-update defect.
//
// A key identifies *which* item, not what the item contains. Content changing
// under a stable key is the normal case. Before the fix, list() reused the node
// for a matched key and never re-evaluated anything the row had bound to the
// item, so the DOM kept showing the first item ever seen for that key.
//
// Every test in this file failed before the fix.
import { describe, it, expect } from 'vitest'
import { h, list, mount } from '../src/index'
import { createSignal } from '@rrjs/signals'

function mountList<T>(
  items: () => T[],
  key: (item: T, index: number) => unknown,
  render: (item: T, index: number) => Node
): HTMLElement {
  const root = document.createElement('div')
  document.body.appendChild(root)
  root.appendChild(list(items, key, render))
  return root
}

const spanTexts = (root: HTMLElement) =>
  Array.from(root.querySelectorAll('span')).map(s => s.textContent)

describe('keyed list — content updates under a stable key', () => {
  it('updates a text binding when the item changes but the key does not', () => {
    const [rows, setRows] = createSignal([{ id: 1, label: 'a' }])
    const root = mountList(rows, r => r.id, r => h('span', null, () => r.label) as Node)

    expect(spanTexts(root)).toEqual(['a'])
    setRows([{ id: 1, label: 'CHANGED' }])
    expect(spanTexts(root)).toEqual(['CHANGED'])
  })

  it('keeps the very same DOM node while updating it', () => {
    const [rows, setRows] = createSignal([{ id: 1, label: 'a' }])
    const root = mountList(rows, r => r.id, r => h('span', null, () => r.label) as Node)

    const before = root.querySelector('span')
    setRows([{ id: 1, label: 'CHANGED' }])
    const after = root.querySelector('span')

    // Node identity is the whole reason for reusing rather than re-rendering:
    // focus, scroll position and uncontrolled input state live on the node.
    expect(after).toBe(before)
    expect(after!.textContent).toBe('CHANGED')
  })

  it('updates an attribute bound to an item property', () => {
    const [rows, setRows] = createSignal([{ id: 1, cls: 'red' }])
    const root = mountList(rows, r => r.id, r => h('span', { class: () => r.cls }) as Node)

    expect(root.querySelector('span')!.className).toBe('red')
    setRows([{ id: 1, cls: 'blue' }])
    expect(root.querySelector('span')!.className).toBe('blue')
  })

  it('updates through a nested object', () => {
    const [rows, setRows] = createSignal([{ id: 1, meta: { label: 'a' } }])
    const root = mountList(rows, r => r.id, r => h('span', null, () => r.meta.label) as Node)

    setRows([{ id: 1, meta: { label: 'CHANGED' } }])
    expect(spanTexts(root)).toEqual(['CHANGED'])
  })

  it('updates content and position together in one change', () => {
    const [rows, setRows] = createSignal([
      { id: 1, label: 'a' },
      { id: 2, label: 'b' },
    ])
    const root = mountList(rows, r => r.id, r => h('span', null, () => r.label) as Node)

    setRows([
      { id: 2, label: 'B2' },
      { id: 1, label: 'A2' },
    ])
    // Rows reorder *and* show their new content.
    expect(spanTexts(root)).toEqual(['B2', 'A2'])
  })

  it('updates a component child rendered under a key (the TodoMVC shape)', () => {
    function Row(props: { item: { label: string } }) {
      return h('span', null, () => props.item.label)
    }
    const [rows, setRows] = createSignal([{ id: 1, label: 'a' }])
    const root = mountList(rows, r => r.id, r => h(Row, { item: r }) as Node)

    expect(spanTexts(root)).toEqual(['a'])
    setRows([{ id: 1, label: 'CHANGED' }])
    expect(spanTexts(root)).toEqual(['CHANGED'])
  })

  it('updates only the rows whose content actually changed', () => {
    const renders: string[] = []
    const [rows, setRows] = createSignal([
      { id: 1, label: 'a' },
      { id: 2, label: 'b' },
      { id: 3, label: 'c' },
    ])
    const root = mountList(rows, r => r.id, r =>
      h('span', null, () => {
        renders.push(String(r.id))
        return r.label
      }) as Node
    )

    renders.length = 0
    // Only row 2 gets a new object; 1 and 3 keep their identity.
    const current = rows()
    setRows([current[0], { id: 2, label: 'B2' }, current[2]])

    expect(spanTexts(root)).toEqual(['a', 'B2', 'c'])
    // Untouched rows must not re-run their bindings — that is the fine-grained
    // property the whole architecture exists for.
    expect(renders).toEqual(['2'])
  })

  it('a pure reorder re-runs no bindings at all', () => {
    const renders: string[] = []
    const a = { id: 1, label: 'a' }
    const b = { id: 2, label: 'b' }
    const [rows, setRows] = createSignal([a, b])
    const root = mountList(rows, r => r.id, r =>
      h('span', null, () => {
        renders.push(String(r.id))
        return r.label
      }) as Node
    )

    renders.length = 0
    setRows([b, a])

    expect(spanTexts(root)).toEqual(['b', 'a'])
    // Same item objects, so the per-row signal is set to the value it already
    // holds and Object.is bailout means nothing re-runs. This is what keeps the
    // swap_rows result intact.
    expect(renders).toEqual([])
  })

  it('does not subscribe the list itself to individual item changes', () => {
    let listRuns = 0
    const [rows, setRows] = createSignal([{ id: 1, label: 'a' }])
    const root = mountList(
      rows,
      r => r.id,
      r => {
        listRuns++
        return h('span', null, () => r.label) as Node
      }
    )

    expect(listRuns).toBe(1)
    setRows([{ id: 1, label: 'CHANGED' }])

    // Reusing a row must not re-run render() for it, and must not re-reconcile
    // the list. Without untrack(), render()'s reads would subscribe the list
    // effect to every row's item signal.
    expect(listRuns).toBe(1)
    expect(spanTexts(root)).toEqual(['CHANGED'])
  })
})

describe('keyed list — `key` is not a DOM attribute', () => {
  it('does not write key onto the element', () => {
    const [rows] = createSignal([{ id: 7, label: 'a' }])
    const root = mountList(rows, r => r.id, r =>
      h('span', { key: r.id, class: 'row' }, () => r.label) as Node
    )

    const span = root.querySelector('span')!
    expect(span.hasAttribute('key')).toBe(false)
    // Everything else still lands.
    expect(span.getAttribute('class')).toBe('row')
    expect(span.textContent).toBe('a')
  })

  it('strips key from a plain h() call outside any list', () => {
    const container = document.createElement('div')
    mount(() => h('div', { key: 'abc', id: 'kept' }, 'x'), container)
    const div = container.querySelector('#kept')!
    expect(div.hasAttribute('key')).toBe(false)
  })
})
