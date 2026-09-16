# Compatibility

Reactive React provides a signal runtime, a DOM renderer, React-shaped hooks and
a JSX compiler. It is not a drop-in replacement for React. It compiles a checked
subset of ordinary React source and refuses the rest with an explicit build-time
diagnostic rather than mis-compiling it.

There are two compiler paths and they do not share semantics.

| | default (`runOnce`) | `runOnce: false` |
| --- | --- | --- |
| State | a value, as in React: `count` | a getter: `count()` |
| Component body | runs once per mount | runs once per mount |
| Keyed lists | direct insert/move/remove operations | the reconciling `list()` renderer |
| Unsupported source | rejected at build time | compiled, sometimes incorrectly |

Pick one per build. The sections below describe the default.

## What the default path accepts

The supported surface, with its exact limits, is in [RUN-ONCE.md](./RUN-ONCE.md).
In summary it covers state as ordinary values, derived expressions, branches and
ternaries, template literals, style objects, event handlers with React's snapshot
semantics, props (destructured or read from a `props` parameter), children,
context providers and consumers, refs, effects, keyed lists driven by known
operations, fixed arrays, and native SVG.

`apps/compat-audit/tests/q1-unmodified-react.test.ts` compiles six components
written in the style of React's own documentation, with the plugin's defaults and
no adaptation, and asserts that each renders and updates correctly.

## What the default path refuses

Refusals are deliberate. Each one is a case where the compiler cannot establish
the behaviour React would produce, so it stops instead of guessing:

- lists whose contents cannot be traced to known operations, including arrays
  supplied by external code and fixed arrays whose contents read reactive values;
- `useEffect` with a dependency argument that is not a literal array, or a
  callback that is not written inline;
- a block-bodied or parameterised `useMemo`, and any hook outside `useState`,
  `useRef`, `useEffect`, `useContext`, `useMemo`, `useCallback` and `useReducer`;
- context provider values other than scalars, owned bindings, and object or array
  literals built from those;
- component props that escape through spread or computed access;
- imports outside the exact-path module contract manifest;
- `count()` where `count` holds a non-callable state value — the older spelling,
  reported at build time rather than as a `TypeError` on the first interaction.

## Known differences from React

- `useEffect(fn)` with no dependency array re-runs when a value the callback reads
  changes, not after every render. A callback that reads nothing reactive runs
  once. Measured against React 19.2 and asserted in
  `apps/compat-audit/tests/effect-inferred-deps.test.ts`.
- `useMemo` and `useCallback` ignore their dependency array; dependencies are
  tracked from the expression's reads. `useMemo(() => n * 10, [])` freezes in
  React and stays live here. Asserted against React 19.2 in
  `apps/compat-audit/tests/react-pattern-corpus.test.ts`.
- `useTransition` runs synchronously with no pending state, `useDeferredValue`
  returns its input, and `useInsertionEffect` behaves as a layout effect. These do
  not implement React scheduling.
- SSR, hydration, class components, Suspense, concurrent APIs, Strict Mode
  semantics and arbitrary third-party React libraries are not established.

## Evidence

Run `node scripts/build-all.mjs` then `node scripts/test-all.mjs` from the root,
and `npm test --prefix apps/compat-audit` for the compiler and runtime suites.
`npm run verify:phase5`, `verify:phase6` and `verify:phase7` run the full
acceptance gates, including independent React and target builds compared in a
real browser, architecture traces and negative controls.

Every test in both suites asserts a result. Tests that merely recorded
observations have been replaced; a passing suite is evidence for the cases it
covers and for nothing beyond them. A finite corpus cannot establish universal
React compatibility, and no performance claim is supported until Phase 8 produces
measurements on the current compiler path.
