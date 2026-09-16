# Phase 6 unchanged issue application

Status: **verified for the recorded unchanged-application workflow on
2026-09-14.** This remains a bounded application result.

`App.tsx`, `IssueList.tsx`, `IssueForm.tsx`, `Stats.tsx` and
`ThemeContext.tsx` are shared unchanged by independently compiled React 19.2
and strict-target production builds. Both builds emit independent source
manifests. The browser gate requires the complete component set and matching
hashes, checks the hashes against disk, and records both builds' output hashes.

The target uses `phase6.module-contracts.ts`, a reusable manifest keyed by exact
root-relative module paths. Contracts identify imported hooks and components by
their source string and exported name, so named aliases retain identity and a
same-named symbol from another module is rejected. Module keys outside the root,
missing paths and non-normalized paths fail explicitly. Operation-bearing props
carry their required JSX key across the import edge.

The compiler/runtime increment covers:

- captured event-snapshot list semantics and lexical binding identity;
- key-preserving map updates and explicit opaque-replacement rejection;
- native sort/splice edge behavior and guarded copied-array move lowering;
- fixed-array reactive fields with ordinary JavaScript value semantics;
- direct state/list provenance through local and contracted imported props;
- contracted imported custom-hook results such as `useTheme()`;
- direct changing-state effect dependencies with cleanup and passive setup;
- fixed source maps without the general keyed reconciler;
- controlled select initialization and tested native `onChange` mappings for
  text input, textarea, select, checkbox and radio;
- explicit rejection of dynamic input types whose `onChange` event mapping can
  change at runtime.

The Chrome workflow records 15 matching checkpoints: initial board, toggle,
rename, stable-identity move/delete, stats updates, genuine Stats remount/reset,
initial form state, focused short-title rejection, 61-character rejection,
the valid 60-character boundary, a valid selected-priority form, add, edit
Escape/blur, delete-to-empty and recreate-from-empty. It also toggles the theme
repeatedly, checks title effects, form values/classes/selection/options/disabled
state, row identity, move boundaries, exact component creation order and work
after unmount.

The target trace contains 11 expected component instances, eight direct list
operations and zero reconciler entries. The target production graph contains no
React runtime. All owned computations and subscriptions are gone after unmount,
and later hash-change stimuli produce no reactive work.

The mandatory gate also imports all four built packages with Node ESM and packs
them into a fresh temporary consumer. That consumer type-checks the public
module-contract API, runs the packed strict compiler, and creates a minified
browser bundle. Nothing is published.

Current evidence:

- Phase 6 report: `.private/acceptance/2026-09-13T22-00-27-975Z/report.json`;
- status: PASS across 15 steps;
- source digest: `74a16ccfed2807d0f2b6633ae2db19f9f513958ea393d6f739d47c9e2074371b`;
- package tests: 278 passed, zero failures or skips;
- integration tests: 122 passed across 14 files;
- browser: Chrome `152.0.7977.83`, 15 matching checkpoints;
- target JS hash: `9d6635fe88b0ffb1d10abec6f448ba38d7e870ee3127253fa7c6164f7a780949`;
- fresh-consumer JS hash: `167af9c2efd18a5ed9d0cfe5f1aa31e78cdf167be3c929d149dd2610527c428b`.

Run `npm.cmd run verify:phase6` and use its newest dated report. Old reports do
not certify changed source.

The module manifest is manually asserted; the compiler does not inspect or prove
dependency implementations automatically. Arbitrary cross-module inference,
opaque replacement arrays, general effect forms, SSR, hydration, concurrent
React semantics, error boundaries, Suspense, classes and portals remain outside
this result. A local tarball consumer does not prove a future registry release.
