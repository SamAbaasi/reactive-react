# Reactive React

A signal-based UI library with a React-compatible API. Components run once. No virtual DOM.

Reactive React lets you write components in JSX with React hooks (`useState`, `useEffect`, `useMemo`, and the rest), but underneath, your components run exactly once. Updates happen through fine-grained signal subscriptions that touch only the DOM nodes that actually need to change.

```
┌─────────────────────────────────────────────────────┐
│  4.2 kB gzipped — 11× smaller than React            │
│  155 ms first paint — 45% faster than React         │
│  3.5 MB memory — better than React, ~SolidJS        │
│  197 tests passing — full hooks API compatibility   │
└─────────────────────────────────────────────────────┘
```

---

## Quick Look

```tsx
import { useState } from '@rrjs/react-compat'
import { mount } from '@rrjs/renderer'

function Counter() {
  const [count, setCount] = useState(0)

  return (
    <button onClick={() => setCount(count() + 1)}>
      Clicked {count} times
    </button>
  )
}

mount(Counter, document.getElementById('app')!)
```

Two differences from React:
1. `count` is a getter: write `count()` outside JSX, but `{count}` inside JSX still works thanks to the Babel plugin
2. The component function runs once when mounted, not on every state change — the signal updates the DOM directly

Everything else — `useEffect`, `useMemo`, `useCallback`, `useRef`, `useContext`, `useReducer`, refs, forwardRef, context, the lot — works the way React does.

---

## Install

```bash
npm install @rrjs/signals @rrjs/renderer @rrjs/react-compat
npm install -D @rrjs/babel-plugin @babel/core @babel/preset-typescript
```

See [`docs/MIGRATION.md`](./docs/MIGRATION.md) for Vite, Webpack, and esbuild setup.

---

## Packages

| Package | Purpose | Tests |
|---------|---------|-------|
| [`@rrjs/signals`](./packages/signals) | Reactive primitives: `createSignal`, `effect`, `computed`, `batch` | 25 |
| [`@rrjs/renderer`](./packages/renderer) | DOM renderer with keyed list reconciliation | 32 |
| [`@rrjs/react-compat`](./packages/react-compat) | React hooks API on top of signals | 110 |
| [`@rrjs/babel-plugin`](./packages/babel-plugin) | JSX → `h()` transform with reactive wrapping | 30 |

**Total: 197 tests, 100% passing.**

---

## Performance

Tested with the official [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark) Chrome harness (4× CPU throttling, 15 iterations, median reported).

| Test | Reactive React | React 19 | SolidJS |
|------|----------------|----------|---------|
| Create 1,000 rows | **67 ms** | 70 ms | 36 ms |
| Replace 1,000 rows | **69 ms** | 75 ms | 40 ms |
| Update every 10th | 41 ms | 40 ms | 16 ms |
| Swap rows | 49 ms | 35 ms | 21 ms |
| Clear | **30 ms** | 30 ms | 13 ms |
| Bundle (gzip) | **4.2 kB** | 46 kB | 8 kB |
| First paint | **155 ms** | 280 ms | 180 ms |
| Memory (1k rows) | **3.5 MB** | 5.5 MB | 3.4 MB |

**Honest summary:** Reactive React is competitive with React on every test and beats it on bulk operations, bundle size, memory, and first paint. SolidJS remains faster on single-row targeted operations (select, remove) by 2-4×; closing that gap is a v0.2 milestone.

Full benchmark methodology, raw numbers, and honest analysis in [`BENCHMARKS.md`](./BENCHMARKS.md).

---

## How It Works

There is no virtual DOM. There is no reconciliation pass on every render. Components run once when mounted; updates happen through fine-grained reactive bindings.

```
┌─────────────────────────────────────────┐
│         Your application code           │   <App />, hooks, JSX
├─────────────────────────────────────────┤
│         @rrjs/babel-plugin              │   compiles JSX to h()
├─────────────────────────────────────────┤
│         @rrjs/react-compat              │   useState, useEffect, ...
├─────────────────────────────────────────┤
│         @rrjs/renderer                  │   h(), mount(), list()
├─────────────────────────────────────────┤
│         @rrjs/signals                   │   createSignal, computed, effect
└─────────────────────────────────────────┘
```

When you call `useState(0)`, you get a signal getter and setter. When the renderer encounters a JSX expression that reads the getter, it wires an effect that subscribes to the signal and updates only the relevant DOM node when the signal changes. The component function itself never runs again.

Full architectural deep-dive in [`docs/HOW-IT-WORKS.md`](./docs/HOW-IT-WORKS.md).

---

## Compatibility

| Hook | Status |
|------|--------|
| `useState`, `useReducer`, `useMemo`, `useCallback`, `useRef` | ✓ Identical semantics |
| `useEffect`, `useLayoutEffect`, `useInsertionEffect` | ✓ Identical timing |
| `useContext`, `createContext` | ✓ Identical |
| `useId`, `useImperativeHandle`, `useSyncExternalStore`, `forwardRef` | ✓ Identical |
| `useTransition`, `useDeferredValue`, `useDebugValue` | ⚠ No-ops (no scheduler) |
| React DevTools | ✗ Not supported (no fiber tree) |
| Server-side rendering | ✗ v0.2 milestone |
| Class components | ✗ Hooks only |

See [`docs/COMPAT.md`](./docs/COMPAT.md) for the full compatibility contract.

---

## Documentation

- [`docs/COMPAT.md`](./docs/COMPAT.md) — what works, what doesn't, what differs
- [`docs/HOW-IT-WORKS.md`](./docs/HOW-IT-WORKS.md) — architecture walkthrough
- [`docs/EFFECT-TIMING.md`](./docs/EFFECT-TIMING.md) — `useEffect` vs `useLayoutEffect` deep dive
- [`docs/MIGRATION.md`](./docs/MIGRATION.md) — Vite/Webpack setup, code translation patterns
- [`BENCHMARKS.md`](./BENCHMARKS.md) — full benchmark methodology and results

---

## Demo Apps

- [`apps/demo`](./apps/demo) — minimal counter with JSX and hooks
- [`apps/todomvc`](./apps/todomvc) — full TodoMVC with editing, filtering, localStorage
- [`apps/benchmark`](./apps/benchmark) — js-framework-benchmark adapter

To run TodoMVC locally:

```bash
git clone https://github.com/SamAbaasi/reactive-react
cd reactive-react/apps/todomvc
npm install
npm run dev
```

---

## License
MIT © Saman Abaasi

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