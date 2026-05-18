# @rrjs/react-compat

React hooks implemented on top of signals. Designed so React code translates with minimal changes: state is read through a getter (`count()` instead of `count`). Inside JSX the Babel plugin handles this automatically.

## Install

```bash
npm install @rrjs/react-compat @rrjs/signals @rrjs/renderer
```

## Quick start

```js
import { useState, useEffect, useMemo } from '@rrjs/react-compat'
import { h, mount } from '@rrjs/renderer'

function Counter() {
  const [count, setCount] = useState(0)
  const doubled = useMemo(() => count() * 2, [count])

  useEffect(() => {
    document.title = `Count: ${count()}`
  }, [count])

  return h('div', null,
    h('p', null, () => `${count()} → ${doubled()}`),
    h('button', { onClick: () => setCount(count() + 1) }, 'inc')
  )
}

mount(Counter, document.getElementById('app'))
```

## Supported hooks

| Hook | Status | Notes |
|---|---|---|
| `useState` | ✓ | Returns `[getter, setter]`. Functional updaters supported. |
| `useReducer` | ✓ | Returns `[stateGetter, dispatch]`. Lazy init supported. |
| `useMemo` | ✓ | Returns a getter. Wrapped in `computed` — auto-tracks signals read inside. |
| `useCallback` | ✓ | Standard React behavior with dep array. |
| `useEffect` | ✓ | Fires post-paint via `MessageChannel`. Cleanup runs before next effect. |
| `useLayoutEffect` | ✓ | Fires synchronously before paint. |
| `useRef` | ✓ | Plain mutable box. |
| `useContext` | ✓ | Stack-based propagation. `createContext` + `Provider`. |
| `useId` | ✓ | Generates `:rN:`-style ids. Client-only. |
| `useImperativeHandle` | ✓ | Pairs with `forwardRef`. |
| `useSyncExternalStore` | ✓ | Subscribes to external stores (Redux, Zustand, etc.). |
| `useDeferredValue` | — | No-op; returns input as-is. |
| `useTransition` | — | No-op; runs synchronously. |

## Forwarding refs

```js
import { forwardRef, useRef } from '@rrjs/react-compat'

const FancyInput = forwardRef((props, ref) =>
  h('input', { ref, type: 'text', ...props })
)

function Form() {
  const inputRef = useRef(null)
  return h(FancyInput, { ref: inputRef })
}
```

## Context

```js
import { createContext, useContext } from '@rrjs/react-compat'

const ThemeContext = createContext('light')

function App() {
  return h(ThemeContext.Provider, { value: 'dark' },
    h(ThemedButton, null)
  )
}

function ThemedButton() {
  const theme = useContext(ThemeContext)
  return h('button', { className: theme }, 'click')
}
```

Nested providers are supported. Each `Provider` push is paired with a pop after children mount.

## External stores (Redux, Zustand, etc.)

```js
import { useSyncExternalStore } from '@rrjs/react-compat'

function Counter({ store }) {
  const state = useSyncExternalStore(store.subscribe, store.getState)
  return h('div', null, () => state().count)
}
```

Same contract as React 18+. Any state library that ships React bindings using `useSyncExternalStore` should work.

## Why getters instead of values

In React, `const [count, setCount] = useState(0)` makes `count` a plain number. That works because React re-runs the entire component function on every state change — the new value of `count` comes from the new render.

In a signal model, the component runs once. After that, `count` would be frozen at the initial value forever. To stay reactive without re-running the component, `count` must be a function that reads the live signal. So `count` is a getter: `count()`.

Inside JSX, the Babel plugin wraps `{count}` as `() => count`, and the renderer auto-invokes nested getters. So in JSX you write `{count}` the same as in React. Outside JSX (event handlers, useMemo factories, useEffect bodies), you call the getter: `count()`.

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