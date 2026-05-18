# Compatibility Contract

How Reactive React's API maps to React's, what works, what differs, and what is deliberately unsupported.

The goal of this document is honesty. Where Reactive React behaves identically to React, the row says so. Where behavior differs, the difference is documented with a rationale.

---

## Tier 1 — Full Compatibility

These hooks behave identically to React's, with one universal rule: **reactive return values are getters, not plain values.** Use `count()` instead of `count` outside JSX. Inside JSX, the Babel plugin handles this automatically.

| Hook | React behavior | Reactive React behavior | Status |
|------|----------------|-------------------------|--------|
| `useState` | Returns `[value, setter]` | Returns `[getter, setter]` | ✓ Same semantics |
| `useReducer` | Returns `[state, dispatch]` | Returns `[stateGetter, dispatch]` | ✓ Same semantics |
| `useMemo` | Returns memoized value | Returns memoized getter | ✓ Same semantics |
| `useCallback` | Stable function reference | Stable function reference | ✓ Identical |
| `useRef` | Mutable `{ current }` box | Mutable `{ current }` box | ✓ Identical |
| `useEffect` | Runs after paint | Runs after paint via `MessageChannel` | ✓ Identical timing |
| `useLayoutEffect` | Runs synchronously before paint | Runs synchronously before paint | ✓ Identical timing |
| `useId` | Generates `:rN:` ids | Generates `:rN:` ids | ✓ Identical format |
| `useImperativeHandle` | Customizes ref content | Customizes ref content | ✓ Identical |
| `useSyncExternalStore` | Subscribes to external store | Subscribes to external store | ✓ Identical |
| `forwardRef` | Forwards refs through components | Forwards refs through components | ✓ Identical |
| `createContext` + `Provider` | Stack-propagated context | Stack-propagated context | ✓ Identical |

---

## Tier 2 — Partial Compatibility (documented differences)

| Feature | React | Reactive React | Difference |
|---------|-------|----------------|------------|
| State return | `count` is a value | `count()` is a getter | Two-character difference; Babel plugin handles JSX |
| Component lifetime | Function re-runs per render | Function runs once per mount | No re-runs; signals update DOM directly |
| `useMemo` deps array | Strictly required for correctness | Accepted but advisory; auto-tracking handles it | Stricter than React in practice |
| `useEffect` timing | Scheduler can run sync in some cases | Always via `MessageChannel` post-paint | More predictable, slightly less aggressive |
| Context Provider | VDOM scoped | Stack scoped during mount | Behaves identically for the common case |

---

## Tier 3 — Documented No-Ops

These hooks exist for API compatibility but are intentional no-ops because the underlying React feature has no equivalent in this model.

| Hook | Behavior |
|------|----------|
| `useTransition` | `startTransition` runs synchronously; `isPending` always returns `false` |
| `useDeferredValue` | Returns input value unchanged; no deferral |
| `useInsertionEffect` | Aliases to `useLayoutEffect`; runs before paint (slightly later than React) |
| `useDebugValue` | True no-op; no DevTools integration |

---

## Tier 4 — Not Supported in v0.1

| Feature | Reason | Plan |
|---------|--------|------|
| Server-side rendering | No SSR infrastructure yet | v0.2 |
| Hydration | Depends on SSR | v0.2 |
| Concurrent Mode features | No priority lane system | Not planned |
| React.memo | Unnecessary in this model — components don't re-run | N/A |
| React DevTools | No fiber tree to introspect | Not planned |
| Class components | This is a hooks-only library | Not planned |

---

## Why a Getter and Not a Value?

In React, `const [count] = useState(0)` returns a plain number because the component re-runs on every state change. On the next render, the function gets a new `count` snapshot.

In Reactive React, the component function runs exactly once per mount. After that, the only thing watching for changes is the signal subscription graph. A plain number cannot subscribe to a signal — only a function call to a getter can. So `count` must be a function: `count()`.

The Babel plugin wraps JSX expressions in thunks automatically, so `{count}` inside JSX continues to work like React. Outside JSX, you write `count()`. This is a deliberate two-character difference for the performance and correctness guarantees the model provides.

---

## Migration From React

Most React code translates with three rules:

1. Outside JSX, call state getters: `count` becomes `count()`
2. `setCount(count + 1)` becomes `setCount(count() + 1)`
3. Replace `react`/`react-dom` imports with `@rrjs/react-compat` and `@rrjs/renderer`

See [`MIGRATION.md`](./MIGRATION.md) for full setup.