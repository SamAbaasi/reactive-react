# Phase 4 composition corpus

Status: **implemented for the bounded corpus below.** The complete acceptance
gate must remain green for the current source fingerprint. This does not establish
general React component compatibility.

## Supported behavior

The strict `runOnce` compiler supports direct local function components with
static and reactive props, destructured props, static defaults and inline callback
props. A component may receive one lazily constructed child, or a render function
whose tested result is primitive content. Stateful children retain state and DOM
identity across parent updates.

Direct local `createContext` providers and `useContext` consumers support changing
values, nested provider isolation, conditional consumers and independent roots.
Context is captured when a conditional branch is declared and restored when its
owned child is constructed.

The corpus also covers a direct local `forwardRef` wrapper, connected object refs,
ref clearing on unmount, a direct local custom hook returning a reactive state
tuple, and cleanup when child setup throws. Component construction remains inside
the renderer's ownership scopes; target component bodies execute once per mount
and the generated path does not enter the keyed reconciler.

The twelve differential cases in `apps/compat-audit/tests/phase4.test.ts` compile
identical component source independently for React and the target. They assert
values, interactions, DOM identity, component executions, balanced lifetimes,
reconciler exclusion, disposal and post-unmount inactivity.

## Boundaries

Accepted forms are deliberately syntactic and local. Spreads, keys, multiple
component children, imported or member components, general wrapper and custom-hook
analysis, retained callback identity, dynamic defaults and arbitrary JSX returned
by render props remain unsupported. Context requires a direct local
`createContext` binding. Asynchronous context propagation and concurrent rendering
are outside this corpus.

## Reproduction

```sh
node scripts/build-all.mjs
npm test --prefix apps/compat-audit -- --maxWorkers=1 --minWorkers=1 --testTimeout=10000 phase4.test.ts
npm run verify:phase4
```

The exact report path, source digest, test totals and browser limitation are in
`docs/VALIDATION.md`.
