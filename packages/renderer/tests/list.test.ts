import { describe, it, expect } from 'vitest'
import { createSignal } from '@rrjs/signals'
import { h, mount, list } from '../src/index'

describe('list()', () => {
  it('renders an initial array of items', () => {
    function App() {
      return list(
        () => ['a', 'b', 'c'],
        (item) => item,
        (item) => h('span', null, item)
      )
    }

    const container = document.createElement('div')
    mount(App, container)

    const spans = container.querySelectorAll('span')
    expect(spans.length).toBe(3)
    expect(spans[0].textContent).toBe('a')
    expect(spans[1].textContent).toBe('b')
    expect(spans[2].textContent).toBe('c')
  })

  it('renders nothing for an empty array', () => {
    function App() {
      return list(
        () => [] as string[],
        (item) => item,
        (item) => h('span', null, item)
      )
    }

    const container = document.createElement('div')
    mount(App, container)

    expect(container.querySelectorAll('span').length).toBe(0)
  })

  it('reuses DOM nodes for matched keys when items reorder', () => {
    const [items, setItems] = createSignal([
      { id: 1, label: 'apple' },
      { id: 2, label: 'banana' },
      { id: 3, label: 'cherry' },
    ])

    function App() {
      return list(
        items,
        (item) => item.id,
        (item) => h('span', { 'data-id': String(item.id) }, item.label)
      )
    }

    const container = document.createElement('div')
    mount(App, container)

    const before = container.querySelectorAll('span')
    expect(before.length).toBe(3)
    const banana_before = before[1]

    // Reverse the array — banana stays at id=2, but its DOM position changes
    setItems([
      { id: 3, label: 'cherry' },
      { id: 2, label: 'banana' },
      { id: 1, label: 'apple' },
    ])

    const after = container.querySelectorAll('span')
    expect(after.length).toBe(3)

    // banana node should be the same DOM node — we reused it
    const banana_after = Array.from(after).find(s => s.getAttribute('data-id') === '2')!
    expect(banana_after).toBe(banana_before)

    // Order should reflect the new array
    expect(after[0].getAttribute('data-id')).toBe('3')
    expect(after[1].getAttribute('data-id')).toBe('2')
    expect(after[2].getAttribute('data-id')).toBe('1')
  })

  it('removes DOM nodes for keys that disappear', () => {
    const [items, setItems] = createSignal([
      { id: 1, label: 'a' },
      { id: 2, label: 'b' },
      { id: 3, label: 'c' },
    ])

    function App() {
      return list(
        items,
        (item) => item.id,
        (item) => h('span', { 'data-id': String(item.id) }, item.label)
      )
    }

    const container = document.createElement('div')
    mount(App, container)

    expect(container.querySelectorAll('span').length).toBe(3)

    setItems([
      { id: 1, label: 'a' },
      { id: 3, label: 'c' },
    ])

    const after = container.querySelectorAll('span')
    expect(after.length).toBe(2)
    expect(after[0].getAttribute('data-id')).toBe('1')
    expect(after[1].getAttribute('data-id')).toBe('3')
  })

  it('creates DOM nodes for keys that newly appear', () => {
    const [items, setItems] = createSignal([
      { id: 1, label: 'a' },
    ])

    function App() {
      return list(
        items,
        (item) => item.id,
        (item) => h('span', { 'data-id': String(item.id) }, item.label)
      )
    }

    const container = document.createElement('div')
    mount(App, container)

    expect(container.querySelectorAll('span').length).toBe(1)

    setItems([
      { id: 1, label: 'a' },
      { id: 2, label: 'b' },
      { id: 3, label: 'c' },
    ])

    const after = container.querySelectorAll('span')
    expect(after.length).toBe(3)
    expect(after[0].getAttribute('data-id')).toBe('1')
    expect(after[1].getAttribute('data-id')).toBe('2')
    expect(after[2].getAttribute('data-id')).toBe('3')
  })

  it('handles full reorder + add + remove in one update', () => {
    const [items, setItems] = createSignal([
      { id: 1, label: 'first' },
      { id: 2, label: 'second' },
      { id: 3, label: 'third' },
    ])

    function App() {
      return list(
        items,
        (item) => item.id,
        (item) => h('span', { 'data-id': String(item.id) }, item.label)
      )
    }

    const container = document.createElement('div')
    mount(App, container)

    const before = container.querySelectorAll('span')
    const second_node_before = Array.from(before).find(s => s.getAttribute('data-id') === '2')!

    // Big update: remove id=1, swap id=2 and id=3, add id=4
    setItems([
      { id: 3, label: 'third' },
      { id: 2, label: 'second' },
      { id: 4, label: 'fourth' },
    ])

    const after = container.querySelectorAll('span')
    expect(after.length).toBe(3)
    expect(after[0].getAttribute('data-id')).toBe('3')
    expect(after[1].getAttribute('data-id')).toBe('2')
    expect(after[2].getAttribute('data-id')).toBe('4')

    // id=2 node should be the SAME DOM node — survived the reorder
    const second_node_after = Array.from(after).find(s => s.getAttribute('data-id') === '2')!
    expect(second_node_after).toBe(second_node_before)
  })

  it('keys must be stable for content to update — using index as key is a known footgun', () => {
    // Documents the same warning React puts in its own docs:
    // index-as-key reuses DOM nodes whose content was bound to the OLD item.
    // If data changes but the key (index) stays the same, the DOM shows
    // stale content. This is the correct behavior of a keyed reconciler;
    // the user is responsible for choosing keys that match identity,
    // not position.
    const [items, setItems] = createSignal(['a', 'b'])

    function App() {
      return list(
        items,
        (_, i) => i,  // ⚠ ANTI-PATTERN: index as key
        (item) => h('span', null, item)
      )
    }

    const container = document.createElement('div')
    mount(App, container)

    let spans = container.querySelectorAll('span')
    expect(spans[0].textContent).toBe('a')
    expect(spans[1].textContent).toBe('b')

    // Swap the data while keeping the same number of items.
    // Index-as-key reuses both DOM nodes — content is STALE.
    setItems(['x', 'y'])

    spans = container.querySelectorAll('span')
    expect(spans.length).toBe(2)
    // Content did NOT update — this is the documented limitation.
    expect(spans[0].textContent).toBe('a')
    expect(spans[1].textContent).toBe('b')
  })

  it('using stable object identity as a key updates content correctly', () => {
    // The correct pattern: keys match identity, not position.
    // When an item with a given key is reused, its data hasn't changed.
    // When data changes, the key changes too, so a new node is created.
    const [items, setItems] = createSignal([
      { id: 1, label: 'a' },
      { id: 2, label: 'b' },
    ])

    function App() {
      return list(
        items,
        (item) => item.id,  // ✓ stable identity-based key
        (item) => h('span', null, item.label)
      )
    }

    const container = document.createElement('div')
    mount(App, container)

    let spans = container.querySelectorAll('span')
    expect(spans[0].textContent).toBe('a')
    expect(spans[1].textContent).toBe('b')

    // New items with new ids — new DOM nodes are created with fresh content
    setItems([
      { id: 3, label: 'x' },
      { id: 4, label: 'y' },
    ])

    spans = container.querySelectorAll('span')
    expect(spans.length).toBe(2)
    expect(spans[0].textContent).toBe('x')
    expect(spans[1].textContent).toBe('y')
  })

  it('mounts inside a parent element with other siblings', () => {
    function App() {
      return h('div', null,
        h('h1', null, 'header'),
        list(
          () => [1, 2, 3],
          (n) => n,
          (n) => h('span', null, String(n))
        ),
        h('footer', null, 'footer')
      )
    }

    const container = document.createElement('div')
    mount(App, container)

    const root = container.firstChild as HTMLElement
    expect(root.children[0].tagName).toBe('H1')
    expect(root.children[1].tagName).toBe('SPAN')
    expect(root.children[2].tagName).toBe('SPAN')
    expect(root.children[3].tagName).toBe('SPAN')
    expect(root.children[4].tagName).toBe('FOOTER')
  })

  it('handles empty array transition without errors', () => {
    const [items, setItems] = createSignal<string[]>(['a', 'b'])

    function App() {
      return list(
        items,
        (item) => item,
        (item) => h('span', null, item)
      )
    }

    const container = document.createElement('div')
    mount(App, container)

    expect(container.querySelectorAll('span').length).toBe(2)

    setItems([])
    expect(container.querySelectorAll('span').length).toBe(0)

    setItems(['c', 'd', 'e'])
    expect(container.querySelectorAll('span').length).toBe(3)
  })
})