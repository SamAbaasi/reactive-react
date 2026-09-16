# Reactive React

An experimental signal-based UI library with JSX and React-shaped hooks. Components run once per mount; reactive bindings update the DOM directly. Keyed lists compile to direct insert/move/remove operations instead of reconciliation.

The compiler accepts a checked subset of ordinary React source and rejects the rest with an explicit diagnostic. It is not a general React implementation: arbitrary components, libraries and features outside that subset are unsupported. See [Compatibility](./docs/COMPAT.md) and [the supported scope and evidence](./docs/RUN-ONCE.md).

## Two compiler paths

`runOnce` is the default. Each component body executes once per mount, state
reads compile to reactive bindings, and list updates become direct operations,
with no keyed reconciler calls. Source outside the supported subset is rejected
at build time rather than mis-compiled.

Passing `runOnce: false` selects the older path, which wraps reactive reads and
uses the reconciling `list()` renderer. State there is a getter, so it is read
as `count()`. The two paths do not share those semantics; pick one per build.

## Quick Look

```tsx
import { useState } from '@rrjs/react-compat'
import { mount } from '@rrjs/renderer'

function Counter() {
  const [count, setCount] = useState(0)

  return (
    <button onClick={() => setCount(count + 1)}>
      Clicked {count} times
    </button>
  )
}

mount(Counter, document.getElementById('app')!)
```

The component source is ordinary React. One difference in behaviour:

1. The component function runs once when mounted, not on every state change — the signal updates the DOM directly.

On the `runOnce: false` path `count` is a getter instead, read as `count()`. The default path reports that spelling as a build error rather than letting it fail on the first click.

Other React APIs have important semantic differences; see the compatibility document before migrating an application.

---

## Install

```bash
npm install @rrjs/signals @rrjs/renderer @rrjs/react-compat
npm install -D @rrjs/babel-plugin @babel/core @babel/preset-typescript
```

See [`docs/MIGRATION.md`](./docs/MIGRATION.md) for Vite, Webpack, and esbuild setup.

---

## Packages

| Package | Purpose |
| --- | --- |
| @rrjs/signals | Signals, computed values, effects, batching |
| @rrjs/renderer | DOM bindings and keyed lists |
| @rrjs/react-compat | React-shaped hooks over signals |
| @rrjs/babel-plugin | JSX compilation with reactive bindings |

Run node scripts/test-all.mjs for current package results. Test counts alone do not establish React compatibility.

---------|---------|-------|
| [`@rrjs/signals`](./packages/signals) | Reactive primitives: `createSignal`, `effect`, `computed`, `batch` | 53 |
| [`@rrjs/renderer`](./packages/renderer) | DOM renderer with keyed list reconciliation | 76 |
| [`@rrjs/react-compat`](./packages/react-compat) | React hooks API on top of signals | 111 |
| [`@rrjs/babel-plugin`](./packages/babel-plugin) | JSX → `h()` transform with reactive wrapping | 44 |

**Total: 284 package tests, 0 failing, 0 skipped.** A further 124 integration
tests run from `apps/compat-audit` (`npm test --prefix apps/compat-audit`).

---

## Performance

Historical measurements and raw artifacts are available in [docs/BENCHMARKS.md](./docs/BENCHMARKS.md) and bench-results/. They are not current-branch measurements. Runtime correctness fixes change the measured implementation; performance must be rerun after behavior matches.

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
- [`apps/todomvc`](./apps/todomvc) — TodoMVC example; localStorage update effects still need compatibility work
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