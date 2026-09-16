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

  it('index-as-key still updates content — the footgun is state, not text', () => {
    // React's index-as-key warning is about *state* landing on the wrong item:
    // focus, uncontrolled input values, animation, component state. It is NOT
    // about text going stale — React re-renders the reused fiber, so content
    // updates. This test previously asserted the opposite and, in doing so,
    // blessed the keyed-update defect as intended behaviour.
    const [items, setItems] = createSignal([{ label: 'a' }, { label: 'b' }])

    function App() {
      return list(
        items,
        (_, i) => i,          // index as key: legal, but see the caveat below
        (item) => h('span', null, () => item.label)
      )
    }

    const container = document.createElement('div')
    mount(App, container)

    let spans = container.querySelectorAll('span')
    expect(spans[0].textContent).toBe('a')
    expect(spans[1].textContent).toBe('b')

    const firstNode = spans[0]
    setItems([{ label: 'x' }, { label: 'y' }])

    spans = container.querySelectorAll('span')
    expect(spans.length).toBe(2)
    expect(spans[0].textContent).toBe('x')
    expect(spans[1].textContent).toBe('y')

    // The actual footgun: node identity follows the *position*, not the item,
    // so anything living on the node stays with position 0 rather than with 'a'.
    expect(spans[0]).toBe(firstNode)
  })

  it('KNOWN LIMITATION: primitive items cannot be rebound under a stable key', () => {
    // A reused row is kept in sync by handing render() a proxy onto the row's
    // current item. Primitives cannot be proxied, so a primitive item is passed
    // straight through and whatever the row bound to it is frozen at first
    // render.
    //
    // This only bites when the key is NOT derived from the value: keying a
    // primitive by the primitive itself means a content change is a key change,
    // which produces a fresh node and the correct text. Index-as-key over an
    // array of strings is the combination that fails.
    //
    // React updates the text here. This is a real divergence, asserted so the
    // suite states the truth rather than passing by accident.
    const [items, setItems] = createSignal(['a', 'b'])

    function App() {
      return list(items, (_, i) => i, (item) => h('span', null, () => item))
    }

    const container = document.createElement('div')
    mount(App, container)
    setItems(['x', 'y'])

    const spans = container.querySelectorAll('span')
    expect(spans[0].textContent).toBe('a')   // React would say 'x'
    expect(spans[1].textContent).toBe('b')   // React would say 'y'
  })

  it('primitive items keyed by value do update, because the key changes too', () => {
    const [items, setItems] = createSignal(['a', 'b'])

    function App() {
      return list(items, (item) => item, (item) => h('span', null, () => item))
    }

    const container = document.createElement('div')
    mount(App, container)
    setItems(['x', 'y'])

    const spans = container.querySelectorAll('span')
    expect(spans[0].textContent).toBe('x')
    expect(spans[1].textContent).toBe('y')
  })

  it('a stable identity key updates content while keeping the node', () => {
    // The case the previous version of this test never exercised: same key,
    // different content. It changed the ids and the labels together, so every
    // key was new and every node was rebuilt — which is why a reconciler that
    // never updated reused nodes still passed.
    const [items, setItems] = createSignal([
      { id: 1, label: 'a' },
      { id: 2, label: 'b' },
    ])

    function App() {
      return list(
        items,
        (item) => item.id,
        (item) => h('span', null, () => item.label)
      )
    }

    const container = document.createElement('div')
    mount(App, container)

    let spans = container.querySelectorAll('span')
    expect(spans[0].textContent).toBe('a')
    const nodeForId1 = spans[0]

    // Same ids, new labels — the reconciler must update in place.
    setItems([
      { id: 1, label: 'x' },
      { id: 2, label: 'y' },
    ])

    spans = container.querySelectorAll('span')
    expect(spans.length).toBe(2)
    expect(spans[0].textContent).toBe('x')
    expect(spans[1].textContent).toBe('y')
    expect(spans[0]).toBe(nodeForId1)

    // New ids — fresh nodes, fresh content.
    setItems([
      { id: 3, label: 'p' },
      { id: 4, label: 'q' },
    ])
    spans = container.querySelectorAll('span')
    expect(spans[0].textContent).toBe('p')
    expect(spans[1].textContent).toBe('q')
    expect(spans[0]).not.toBe(nodeForId1)
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