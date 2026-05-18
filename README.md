# Reactive React

A signal-based UI library with a React-compatible API. Components run once. Signals update the DOM directly. No VDOM, no reconciliation tax.

```jsx
import { mount, h } from '@reactive-react/renderer'
import { useState, useMemo } from '@reactive-react/react-compat'

function Counter() {
  const [count, setCount] = useState(0)
  const doubled = useMemo(() => count() * 2, [count])

  return (
    <div>
      <p>Count: {count}, Doubled: {doubled}</p>
      <button onClick={() => setCount(count() + 1)}>+</button>
    </div>
  )
}

mount(Counter, document.getElementById('app'))
```

## What this is

Reactive React is a UI library that uses fine-grained signals instead of a virtual DOM. The mental model is React. The implementation is signals. Components run exactly once per mount; state changes propagate through a signal graph and update specific DOM nodes directly.

The two-character difference from React: state is read through a getter, so you write `count()` instead of `count`. Inside JSX the Babel plugin handles this automatically — you write `{count}` and it works.

## Why this exists

The frontend industry has converged on signals. Angular 20, Vue 4 Vapor Mode, SolidJS, and the TC39 signals proposal all use the same underlying primitive. React went a different direction with the compiler. Reactive React explores what a React-shaped library looks like when it uses signals directly — and how much of the React API can be preserved without re-running components on every state change.

## Packages

| Package | What it is |
|---|---|
| [`@reactive-react/signals`](./packages/signals) | The signal primitives: `createSignal`, `computed`, `effect`, `batch` |
| [`@reactive-react/react-compat`](./packages/react-compat) | React hooks on top of signals: `useState`, `useEffect`, `useMemo`, `useReducer`, `useContext`, `forwardRef`, `useSyncExternalStore`, and more |
| [`@reactive-react/renderer`](./packages/renderer) | The DOM renderer: `h()`, `mount()`, `list()` |
| [`babel-plugin-reactive-react`](./packages/babel-plugin) | JSX transform that wraps dynamic expressions in thunks |

## Installation

```bash
npm install @reactive-react/signals @reactive-react/renderer @reactive-react/react-compat
npm install -D babel-plugin-reactive-react
```

## Status

`v0.1.0` — experimental. 123 tests passing. API may change before `1.0`. Use in production at your own risk.

## What works

- All major hooks: `useState`, `useEffect`, `useLayoutEffect`, `useMemo`, `useCallback`, `useRef`, `useReducer`, `useContext`, `useId`, `useImperativeHandle`, `useSyncExternalStore`
- `forwardRef`, `createContext`, refs on DOM elements
- Keyed list reconciliation with DOM node reuse
- Event handlers, reactive attributes, conditional rendering
- Babel JSX transform that compiles standard JSX to signal-aware code

## What doesn't work yet

- Server-side rendering and hydration
- `useTransition`, `useDeferredValue`, Concurrent Mode features
- Suspense streaming (basic Suspense fallbacks work)
- React.memo (unnecessary in this model — components don't re-run)

## Author

Built by [Saman Abaasi](https://linkedin.com/in/samabaasi). 

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