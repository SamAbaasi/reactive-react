# Migrating From React

This document walks through using Reactive React in place of React.

On the default compiler path the component source does not change at all. Only
the imports move, from `react` / `react-dom` to `@rrjs/react-compat` and
`@rrjs/renderer`. State stays an ordinary value. Source the compiler cannot
handle is reported as a build error rather than compiled into something that
behaves differently.

Passing `runOnce: false` selects the older path, where state is a getter read as
`count()`. That path is documented separately below, and the two are not
interchangeable — pick one per build.

---

## Setup

### Install

```bash
npm install @rrjs/signals @rrjs/renderer @rrjs/react-compat
npm install -D babel-plugin-reactive-react @babel/core @babel/preset-typescript
```

### Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import babel from '@babel/core'
import reactiveReact from '@rrjs/babel-plugin'

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

The plugin injects `import { h, list } from '@rrjs/renderer'` into every file that emits those calls. Your entry file only needs `mount`:

```ts
import { mount } from '@rrjs/renderer'
import { App } from './App'

mount(App, document.getElementById('app')!)
```

The compiler injects runtime imports by default; global runtime assignments are unnecessary.

---

## Translating Components

On the default path, translating a component means changing the import line.

```tsx
import { useState, useEffect } from '@rrjs/react-compat'

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

That is the React source unchanged. It renders `Clicked 0 times`, updates to
`Clicked 1 times` on click, and the effect re-runs with the new value, which
`apps/compat-audit/tests/q1-unmodified-react.test.ts` asserts for this and five
other components from React's own documentation.

Mount it with the renderer instead of `react-dom`:

```tsx
import { mount } from '@rrjs/renderer'
mount(Counter, document.getElementById('app')!)
```

If the compiler cannot handle something, the build fails with a message naming
the construct. See [COMPAT.md](./COMPAT.md) for what is accepted and refused.

---

## The `runOnce: false` path

Everything from here to the end of this document describes the older path,
selected with `runOnce: false`. On it, state is a getter and component source has
to be adapted. None of it applies to the default.

To select it, pass the option where the Setup section above passes the plugin:

```js
plugins: [[reactiveReact, { runOnce: false }]],
```

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

### After (`runOnce: false`)

```tsx
import { useState, useEffect } from '@rrjs/react-compat'

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
1. Import from `@rrjs/react-compat`
2. Inside `useEffect` and `setCount`, read state with `count()`
3. JSX expressions don't change — the Babel plugin handles them

### Mount

```tsx
import { mount } from '@rrjs/renderer'
mount(Counter, document.getElementById('app')!)
```

---

## Common Translation Patterns

| Pattern | React | `runOnce: false` |
|---------|-------|------------------|
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
import { list } from '@rrjs/renderer'

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
import { useSyncExternalStore } from '@rrjs/react-compat'

function Counter({ store }) {
  const state = useSyncExternalStore(store.subscribe, store.getState)
  return <div>{state}</div>   // ← state is a getter in this model
}
```

The store contract is identical to React's. Any library that implements its React bindings via `useSyncExternalStore` should work.

---

## What's Not Supported

- Server-side rendering and hydration
- React DevTools
- Concurrent Mode features (Suspense streaming, transitions with visible loading states)
- `React.memo` — unnecessary; components don't re-run by default
- Class components — hooks only

See [`COMPAT.md`](./COMPAT.md) for the full compatibility contract.

---

## Troubleshooting

**My component renders but doesn't update.**
On `runOnce: false`, you probably wrote `count` somewhere outside JSX where you needed `count()`. Look at where the value is consumed and add the parentheses. On the default path the opposite applies: `count` is the value, and writing `count()` for a non-callable state is reported as a build error naming the binding.

**Imports throw "Hook called outside of a component".**
You called a hook from a regular function (one that wasn't mounted via `mount()`). All hooks must run inside the body of a component function that the renderer mounts.

**A file throws `h is not defined`.**
The plugin is not running on that file, or `injectImports` was set to `false`. Under the default (automatic) runtime the plugin injects the import itself. `@rrjs/renderer` must be installed — it is a peer of `@rrjs/babel-plugin`.

**Refs don't attach to DOM elements.**
This was a bug before v0.1.0. Update to the latest published version. The Babel plugin now passes `ref` through without wrapping.

---

## Next Steps

- Browse [`HOW-IT-WORKS.md`](./HOW-IT-WORKS.md) to understand the architecture
- Read [`EFFECT-TIMING.md`](./EFFECT-TIMING.md) before reaching for `useLayoutEffect`
- See [the demo app](../apps/demo) and [TodoMVC](../apps/todomvc) for full examples