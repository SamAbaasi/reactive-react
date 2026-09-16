# Run-once React-source compilation

The complete requirements, remaining phases and mandatory evidence rules are in
[ROADMAP.md](./ROADMAP.md). This document describes the currently implemented subset.

`runOnce` is the plugin's default. It compiles a checked subset of ordinary
React component source into the existing signal runtime; `runOnce: false`
selects the older reactive-wrapping path instead. Component
bodies execute once per mount. The generated path updates DOM bindings directly
and does not invoke the keyed-list reconciler or a React runtime fallback.

This is not universal React compatibility. The existing default renderer still
contains a keyed-list reconciler; the new compiler path excludes it.

## Implemented

- Named `useState` bindings are rewritten using lexical binding identity.
- Immutable derived expressions become owned computed signals, including aliases,
  arithmetic, comparisons, and derived chains.
- DOM event handlers capture state values at invocation before performing updates.
  Duplicate value updates therefore use one snapshot. This does not claim full
  compatibility for escaping callbacks or every React batching observation.
- A top-level JSX ternary containing native elements tracks its selected branch
  separately. The live branch retains its DOM while the predicate remains true.
- Component unmount disposes compiler-created computations.
- Direct inline `useEffect` callbacks run as owned passive commit work. With a
  literal `[]` dependency array, reactive values captured by setup and cleanup
  are snapshotted during the initial component execution. Unmount runs cleanup,
  and unmount before the passive flush cancels setup.
- `useEffect(fn)` with no dependency argument is given the dependency list its
  callback implies: every reactive binding the callback reads, compiled as live
  reads. Each re-run flushes the previous cleanup first and takes a fresh
  snapshot, so state and derived values the effect reads stay current.

  **This is narrower than React and the difference is observable.** React re-runs
  a dependency-less effect after *every* render, including renders caused by
  state the effect never touches. Here a component body runs once, so there is no
  second render to key off; an effect that reads nothing reactive therefore runs
  exactly once. Measured against React 19.2 with identical behaviour under test:
  an effect appending to a string on every run reaches `"xx"` under React after
  one click and `"x"` here. `apps/compat-audit/tests/effect-inferred-deps.test.ts`
  asserts both sides of that comparison.
- Direct local function components support reactive/destructured props, static
  defaults, inline callbacks, one lazy child and primitive render-prop results.
  Direct local context providers/consumers, conditional context snapshots,
  independent roots, local `forwardRef`, tuple-returning custom hooks and failed
  child setup are covered by the Phase 4 ownership corpus.
- Phase 1 foundation tests cover failed derivations, setup/commit teardown and
  throwing cleanup. Named hook imports may be renamed; indirect hook references
  and unsupported custom-hook imports receive diagnostics. See
  [PHASE1.md](./PHASE1.md) for tested scope and remaining feasibility blockers.

The compiler currently rejects omitted or changing effect dependencies, indirect
effect callbacks, layout effects, imported/namespace hooks, dynamic lists,
component spreads and keys, multiple children, imported/member components,
general wrappers, retained callback identity, arbitrary JSX returned by render
props, nested structural branches, state-dependent early returns, derived
calls/mutations, and escaping state-capturing functions. These
diagnostics prevent the known unsupported paths from silently using another
architecture. They do not constitute a complete JavaScript soundness proof.

## Example transformation

```jsx
const [count, setCount] = useState(0)
const doubled = count * 2
return <button onClick={() => setCount(count + 1)}>{doubled}</button>
```

The compiler lifts `doubled` into an owned computation, reads it through a getter
in the DOM binding, and captures `count` at event invocation. It does not put the
component function inside an effect or rerender loop.

## Run and verify

```sh
node scripts/build-all.mjs
node scripts/verify-run-once.mjs
npm run dev:run-once --prefix apps/flip
```

The demo uses port 5212. Increment, type in the revealed input, and increment
again. The input should retain its value and the component execution count should
stay at one. The snapshot button issues two value updates from one handler and
increments the count by one.

The verification script compiles identical source separately with the React JSX
compiler and with this plugin. It checks output across updates, stable DOM,
one component execution, no keyed reconciler call, computation disposal, and
rejection of selected unsupported constructs. Vitest regressions live in
`apps/compat-audit/tests/run-once-source.test.ts`.

The production demo was also verified in Chrome 152.0.7977.77: one body
execution, retained input identity/value while active, correct snapshot updates,
correct branch removal/recreation, and no page errors. Reproduce with
`npm run build:run-once --prefix apps/flip` followed by
`node scripts/verify-run-once-browser.mjs`. The browser check requires installed
Chrome and Playwright in `apps/compat-audit` or the local benchmark harness.

## Next compiler work

1. Compile list operations with known provenance into direct structural commands
   and reject replacement arrays whose provenance cannot be established.
2. Extend effect compilation from the verified empty-dependency snapshot slice
   to omitted and changing dependencies with cleanup-before-setup ordering.
3. Broaden composition analysis beyond the Phase 4 direct-local forms without
   re-executing component bodies.

The unchanged issue application still exceeds this compiler's supported subset.
The separate re-execution experiment is not the implementation of this mode.
