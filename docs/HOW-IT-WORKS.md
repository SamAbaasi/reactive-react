# How Reactive React Works

A walkthrough of the architecture from the bottom up.

If you understand SolidJS, you already understand 80% of this. If you understand React internals, you understand the other 80%. The two overlap less than you might think.

---

## The Four Layers

```
┌─────────────────────────────────────────┐
│         Your application code           │   <App />, hooks, JSX
├─────────────────────────────────────────┤
│      babel-plugin-reactive-react        │   compiles JSX to h()
├─────────────────────────────────────────┤
│       @rrjs/react-compat      │   useState, useEffect, ...
├─────────────────────────────────────────┤
│       @rrjs/renderer          │   h(), mount(), list()
├─────────────────────────────────────────┤
│       @rrjs/signals           │   createSignal, computed, effect
└─────────────────────────────────────────┘
```

Every layer except the bottom is replaceable. The signal kernel is the load-bearing primitive. Everything else is convenience.

---

## Layer 1: The Signal Kernel

The kernel provides four primitives:

- `createSignal(initial)` — returns `[getter, setter]`
- `effect(fn)` — runs `fn` immediately, re-runs when its tracked signals change
- `computed(fn)` — a derived signal that recomputes when its inputs change
- `batch(fn)` — defers effect flushing until `fn` returns

The mechanism uses a **global observer stack**. When an `effect` runs, it pushes itself onto the stack. When a signal's getter is called, it checks the stack and registers the current top as a subscriber. When the signal's value changes, all subscribers are scheduled to re-run.

```
effect(() => console.log(count(), name()))
              │            │
              │            └── reads `name`, registers self
              └── reads `count`, registers self

setCount(5)
  └── notifies subscribers
        └── effect re-runs, reads both signals again
```

This is a classic dependency tracking system. The implementation is about 200 lines. The full reasoning is in `packages/signals/src/index.ts`.

### Scheduling

When a signal's setter fires, subscribers are not re-run immediately. They are added to a `pendingEffects` set, and the set is flushed at the end of the current synchronous block. This is what makes batching work: three setter calls in a row produce three additions to the set, then one flush. Effects that depend on multiple of those signals run exactly once.

The flush itself uses a wave-based loop: each wave processes the current set, but any signals modified during that wave queue effects for the next wave. This handles diamond dependencies correctly — if A → B and A → C and both B and C update D, then D fires exactly once.

---

## Layer 2: The Renderer

The renderer creates DOM nodes via `h(tag, props, ...children)` and wires reactive bindings between signals and DOM properties.

The key invariant: **the component function runs exactly once**. Everything reactive happens through bindings established during that one run.

For each reactive prop or child, the renderer creates a `computed` wrapper around the thunk and an `effect` that writes its current value to the appropriate DOM location. The computed's same-value bailout means no DOM write happens unless the resolved value actually changed.

```
<div class={() => active() ? 'on' : 'off'}>
  │
  └── computed(() => active() ? 'on' : 'off')
        │
        └── effect(() => setAttribute(div, 'class', cached()))
              │
              └── subscribes to `active` signal indirectly
```

When `active` changes from `true` to `false`, the computed fires, the effect fires, the class attribute changes. When `active` is set to `true` again, the computed bails out because the value didn't change, and no DOM write occurs.

### Lists

The `list()` primitive maintains a Map of `key → DOM node` and reconciles by key on each array change. Reused nodes survive reorderings. The algorithm is O(n) with a single Map lookup per item.

---

## Layer 3: The Hook Layer

`react-compat` implements the React hooks API as thin wrappers around the signal primitives.

- `useState(initial)` → `createSignal(initial)` + functional updater wrapper
- `useMemo(fn, deps)` → `computed(fn)`
- `useEffect(fn, deps)` → schedules a passive effect via `MessageChannel`
- `useLayoutEffect(fn, deps)` → schedules a layout effect, runs synchronously
- `useContext(ctx)` → reads from the context stack
- `useRef(initial)` → plain mutable object on the component instance

The component instance is a plain JavaScript object that lives for the lifetime of the mounted component. Hook positions are tracked by an incrementing counter on the instance, mirroring React's "Rules of Hooks" mechanism exactly.

Each hook call allocates a slot on `instance.hooks` based on the current `hookIndex`. On unmount, the renderer walks the hooks array and calls any stored cleanup functions.

---

## Layer 4: The Babel Plugin

The plugin transforms JSX into `h()` calls and wraps dynamic expressions in thunks so the renderer can establish reactive bindings.

```jsx
<button onClick={handleClick}>{count}</button>
//
//  compiles to:
//
h("button", { onClick: handleClick }, () => count)
```

The thunk `() => count` is what lets the renderer subscribe the button's text node to the `count` signal. Without the thunk, `count` would be evaluated eagerly and the binding would never form.

Static literals, event handlers (`on[A-Z]...`), refs, and call expressions are passed through without thunking. Everything else is wrapped.

---

## What This Architecture Gives You

- **One component invocation per mount.** No re-runs, no closures growing stale, no `useCallback` performance band-aids needed.
- **Surgical updates.** Changing one signal updates only the DOM nodes whose bindings actually read that signal.
- **Predictable timing.** `useEffect` always runs post-paint via `MessageChannel`. `useLayoutEffect` always runs pre-paint, synchronously.
- **Deterministic batching.** Multiple state changes inside `batch()` produce one flush, regardless of how many effects depend on what.

---

## What It Doesn't Give You

- **Server-side rendering** — would require a separate hydration path
- **React DevTools integration** — there is no fiber tree to inspect
- **Time slicing / concurrent rendering** — no priority lanes
- **Suspense streaming** — basic Suspense works; streaming does not yet

These are not architectural limitations; they are work remaining. The signal model makes most of them straightforward to add when prioritized.