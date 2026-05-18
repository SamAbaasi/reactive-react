# Migrating From React

This document walks through using Reactive React in place of React. The library is API-compatible enough that most existing components translate with two rules:

1. Reactive state is read through getters: `count()` not `count`
2. Imports change from `react` / `react-dom` to `@reactive-react/react-compat` and `@reactive-react/renderer`

---

## Setup

### Install

```bash
npm install @reactive-react/signals @reactive-react/renderer @reactive-react/react-compat
npm install -D babel-plugin-reactive-react @babel/core @babel/preset-typescript
```

### Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import babel from '@babel/core'
import reactiveReact from 'babel-plugin-reactive-react'

export default defineConfig({
  esbuild: {
    loader: 'tsx',
    include: /\.(tsx?|jsx?)$/,
    exclude: [],
    jsx: 'preserve',
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: { '.ts': 'ts', '.tsx': 'tsx' },
      jsx: 'preserve',
    },
  },
  plugins: [
    {
      name: 'reactive-react-jsx',
      enforce: 'pre',
      async transform(code, id) {
        if (!id.endsWith('.tsx') && !id.endsWith('.jsx')) return null
        const result = await babel.transformAsync(code, {
          filename: id,
          plugins: [reactiveReact],
          presets: ['@babel/preset-typescript'],
          parserOpts: { plugins: ['jsx', 'typescript'] },
        })
        return { code: result?.code ?? code, map: result?.map }
      },
    },
  ],
})
```

### Webpack

```js
// webpack.config.js
module.exports = {
  module: {
    rules: [
      {
        test: /\.(tsx?|jsx?)$/,
        use: {
          loader: 'babel-loader',
          options: {
            plugins: ['babel-plugin-reactive-react'],
            presets: ['@babel/preset-typescript'],
          },
        },
      },
    ],
  },
}
```

### esbuild (standalone)

esbuild does not support Babel plugins natively. Use the Vite or Webpack setup above, or compile with Babel as a pre-build step.

### Entry point

In your application's entry file, make `h` globally available — the Babel plugin compiles JSX to `h()` calls and assumes `h` is in scope:

```ts
import { h } from '@reactive-react/renderer'
;(globalThis as any).h = h
```

---

## Translating Components

### Before (React)

```tsx
import { useState, useEffect } from 'react'

function Counter() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    document.title = `Count: ${count}`
  }, [count])

  return (
    <button onClick={() => setCount(count + 1)}>
      Clicked {count} times
    </button>
  )
}
```

### After (Reactive React)

```tsx
import { useState, useEffect } from '@reactive-react/react-compat'

function Counter() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    document.title = `Count: ${count()}`     // ← call the getter
  }, [count])

  return (
    <button onClick={() => setCount(count() + 1)}>    {/* call the getter */}
      Clicked {count} times                            {/* JSX: no change */}
    </button>
  )
}
```

Three changes:
1. Import from `@reactive-react/react-compat`
2. Inside `useEffect` and `setCount`, read state with `count()`
3. JSX expressions don't change — the Babel plugin handles them

### Mount

```tsx
import { mount } from '@reactive-react/renderer'
mount(Counter, document.getElementById('app')!)
```

---

## Common Translation Patterns

| Pattern | React | Reactive React |
|---------|-------|----------------|
| Read state | `count` | `count()` |
| Read in JSX | `{count}` | `{count}` (unchanged) |
| Increment | `setCount(count + 1)` | `setCount(count() + 1)` |
| Functional update | `setCount(c => c + 1)` | `setCount(c => c + 1)` (unchanged) |
| Read in effect | `useEffect(() => log(count), [count])` | `useEffect(() => log(count()), [count])` |
| Read in handler | `() => log(count)` | `() => log(count())` |
| Derived value | `const x = count * 2` | `const x = () => count() * 2` or `useMemo(() => count() * 2)` |
| Pass to child | `<Child val={count} />` | `<Child val={count} />` (JSX) — child receives getter |
| Conditional JSX | `{flag && <X />}` | `{flag() && <X />}` |

---

## Patterns That Don't Translate

A few React patterns require rethinking under signals:

### `useEffect` with derived dependencies

In React, you might pass derived values as deps:
```tsx
const total = price * quantity
useEffect(() => { ... }, [total])
```

In Reactive React, the derived value is a thunk, not a value. Pass the underlying signals as deps and compute inside the effect:
```tsx
useEffect(() => {
  const total = price() * quantity()
  // ...
}, [price, quantity])
```

### Conditional hook calls

Same rule as React: hooks must be called in the same order every render. Reactive React enforces this with `hookIndex` positional tracking.

### `useEffect` cleanup that captures state

This works the same as React:
```tsx
useEffect(() => {
  const id = setInterval(() => console.log(count()), 1000)
  return () => clearInterval(id)
}, [count])
```

The cleanup closure captures `count` (the getter), which always reads the current value when called.

---

## Lists

For `.map()` over arrays where items can change, use the `list()` primitive directly:

```tsx
import { list } from '@reactive-react/renderer'

function TodoList() {
  const [todos] = useState<Todo[]>([])
  return (
    <ul>
      {list(
        todos,
        (todo) => todo.id,
        (todo) => <li>{todo.text}</li>
      )}
    </ul>
  )
}
```

The `list()` reconciler reuses DOM nodes for unchanged keys. See the [renderer README](../packages/renderer/README.md) for the full API.

You can also use plain `.map()` for static lists that never change — it works, but every change recreates the entire DOM. Use `list()` for any array that can update.

---

## State Management Libraries

External state libraries (Redux, Zustand, Jotai) work via `useSyncExternalStore`:

```tsx
import { useSyncExternalStore } from '@reactive-react/react-compat'

function Counter({ store }) {
  const state = useSyncExternalStore(store.subscribe, store.getState)
  return <div>{state}</div>   // ← state is a getter in this model
}
```

The store contract is identical to React's. Any library that implements its React bindings via `useSyncExternalStore` should work.

---

## What's Not Supported in v0.1

- Server-side rendering and hydration
- React DevTools
- Concurrent Mode features (Suspense streaming, transitions with visible loading states)
- `React.memo` — unnecessary; components don't re-run by default
- Class components — hooks only

See [`COMPAT.md`](./COMPAT.md) for the full compatibility contract.

---

## Troubleshooting

**My component renders but doesn't update.**
You probably wrote `count` somewhere outside JSX where you needed `count()`. Look at where the value is consumed and add the parentheses.

**Imports throw "Hook called outside of a component".**
You called a hook from a regular function (one that wasn't mounted via `mount()`). All hooks must run inside the body of a component function that the renderer mounts.

**TypeScript complains about `globalThis.h`.**
Add a global type declaration:
```ts
// src/global.d.ts
declare global {
  const h: typeof import('@reactive-react/renderer').h
}
```

**Refs don't attach to DOM elements.**
This was a bug before v0.1.0. Update to the latest published version. The Babel plugin now passes `ref` through without wrapping.

---

## Next Steps

- Browse [`HOW-IT-WORKS.md`](./HOW-IT-WORKS.md) to understand the architecture
- Read [`EFFECT-TIMING.md`](./EFFECT-TIMING.md) before reaching for `useLayoutEffect`
- See [the demo app](../apps/demo) and [TodoMVC](../apps/todomvc) for full examples