# @reactive-react/renderer

The DOM renderer. Mounts components, manages reactive bindings between signals and DOM nodes, and reconciles keyed lists.

## Install

```bash
npm install @reactive-react/renderer @reactive-react/signals
```

## Quick start

```js
import { h, mount } from '@reactive-react/renderer'
import { createSignal } from '@reactive-react/signals'

const [count, setCount] = createSignal(0)

function Counter() {
  return h('button', { onClick: () => setCount(count() + 1) }, count)
}

mount(Counter, document.getElementById('app'))
```

The component function runs exactly once on mount. After that, only the text node bound to `count` updates when the signal changes.

## API

### `h(tag, props, ...children)`

Hyperscript. Creates a DOM element.

- `tag`: a string (`'div'`) for HTML elements, or a function for components
- `props`: object with attributes, event handlers (`onClick`, etc.), and refs
- `children`: any number of children — strings, numbers, DOM nodes, signal getters, or arrays

Functions passed as children are treated as reactive bindings. They run inside an `effect`, so any signals they read are tracked, and only that text node updates when those signals change.

### `mount(component, container)`

Mounts a component into a DOM container.

```js
mount(App, document.getElementById('root'))
```

### `list(getItems, getKey, render)`

Keyed list reconciler. Use this for `.map()` over arrays where items may add, remove, or reorder.

```js
const [todos, setTodos] = createSignal([
  { id: 1, text: 'buy milk' },
  { id: 2, text: 'write docs' },
])

function TodoList() {
  return list(
    todos,
    (todo) => todo.id,
    (todo) => h('li', null, todo.text)
  )
}
```

When the array changes, existing DOM nodes are reused for matched keys. Use stable identifiers (database IDs, slugs) — using array index as a key reuses nodes whose content is bound to old data.

### Refs

Refs work on both DOM elements and `forwardRef` components.

```js
import { useRef } from '@reactive-react/react-compat'

function Form() {
  const inputRef = useRef(null)
  return h('div', null,
    h('input', { ref: inputRef }),
    h('button', { onClick: () => inputRef.current.focus() }, 'focus')
  )
}
```

## With JSX

Use `babel-plugin-reactive-react` to write JSX that compiles to `h()` calls with the right thunks. See [`babel-plugin-reactive-react`](../babel-plugin) for setup.

## License
MIT License

Copyright (c) 2026 Saman Abaasi

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.