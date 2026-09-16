# Validation record

## Phase 7 native SVG slice, 2026-09-14

Status: verified for the bounded single-module SVG corpus. General SVG and React
compatibility remain open. Exact scope and limits are in
[PHASE7.md](./PHASE7.md).

Command: `npm.cmd run verify:phase7`. All 18 stages passed. Report:
`.private/acceptance/2026-09-13T21-57-26-335Z/report.json`. Source digest:
`74a16ccfed2807d0f2b6633ae2db19f9f513958ea393d6f739d47c9e2074371b`.
Environment: Node v24.13.1, npm 11.8.0, Windows x64, React 19.2.0 and Chrome
152.0.7977.83.

- 278 package tests and 122 integration tests passed with no failures or skips.
- Five React/target Chrome checkpoints matched namespace URIs, SVG attributes,
  reactive updates, events, conditional children and stable element identity.
- The target SVG component executed once, entered no reconciler, disposed all
  owned computations and ignored an event dispatched on its detached circle.
- The wrong-namespace negative control failed as intended.
- Phase 6, Node ESM and fresh local-tarball consumer gates also passed.

## Phase 6 unchanged application and local consumer, 2026-09-14

Status: verified for the bounded unchanged issue-application workflow and local
package shape. General React compatibility and a public registry release remain
open. Exact scope and limits are in [PHASE6.md](./PHASE6.md).

Command: `npm.cmd run verify:phase6`. All 15 stages passed. Report:
`.private/acceptance/2026-09-13T22-00-27-975Z/report.json`. Source digest:
`74a16ccfed2807d0f2b6633ae2db19f9f513958ea393d6f739d47c9e2074371b`.
Environment: Node v24.13.1, npm 11.8.0, Windows x64, React 19.2.0 and Chrome
152.0.7977.83.

- 278 package tests and 122 integration tests passed with no failures or skips.
- Independent production source manifests matched all five unchanged component
  files and their on-disk hashes.
- Fifteen React/target browser checkpoints matched. Eleven expected target
  component instances executed once, eight direct list operations ran, and no
  reconciler entry or post-unmount reactive work occurred.
- Exact-path module resolution and import source/export identity tests cover
  aliases, duplicate basenames, wrong import sources and missing/malformed paths.
- Node ESM imported all four packages. A fresh temporary consumer installed local
  tarballs, type-checked public contracts, ran strict compilation and emitted a
  minified production bundle with SHA-256
  `167af9c2efd18a5ed9d0cfe5f1aa31e78cdf167be3c929d149dd2610527c428b`.

Before repair, a fixed-map arithmetic fixture rendered `() => count()1` instead
of `2`; the fresh consumer also failed because a declaration dependency was not
shipped. The browser evidence audit exposed incomplete form/empty/remount checks
and a self-derived instance count. These now have behavioral regressions or
independent gates. The module manifest remains manually asserted, opaque list
replacements remain unsupported, and SSR/hydration/concurrent semantics are not
covered.

## Phase 5 direct-operation list increment, 2026-09-12

Status: verified for the source-visible direct-operation corpus: functional or
event-snapshot append/filter, functional prepend, immutable splice/sort/reverse,
exact tail removal and clear. Opaque replacement compatibility and requirements
P1–P5 remain open.

Identical source compiled independently for React 19.2.0 and the target preserves
existing row identity, reactive index values and a following sibling across
append, prepend, middle insertion, selective deletion, reverse, comparator sort,
filter and tail removal, then clears the region. The target component
executes once and the runtime records no keyed-reconciler entry. Updates carry
exact predecessor and operation data through a private `WeakMap`; the list region
does not compare old and new arrays or inspect keys. Eleven `list-operation` events
prove that each tested state transition used the direct-operation path.

Command: `npm.cmd run verify:phase5`.
All ten stages passed with an unchanged source fingerprint.
Report: `.private/acceptance/2026-09-13T21-59-21-885Z/report.json`.
Source digest: `74a16ccfed2807d0f2b6633ae2db19f9f513958ea393d6f739d47c9e2074371b`.
Environment: Node v24.13.1, Windows x64, React 19.2.0, Chrome 152.0.7977.83.

- 278 package tests passed, with no failures or skips.
- 122 integration tests passed, including the expanded Phase 5 and SVG corpora.
- Eight architecture/source negative controls and the independent Node
  comparison passed.
- Both production builds, the Chrome comparison and the default renderer oracle
  passed. Phase 5 also has independently built browser coverage for direct append
  and reverse with identity, uncontrolled value, selection and focus-event traces.

Opaque replacement arrays and updater syntax outside the accepted patterns remain
unsupported. The exact Phase 5 boundaries are
in [PHASE5.md](./PHASE5.md).

## Phase 4 composition corpus, 2026-09-12

Status: verified for the bounded direct-local composition corpus described in
[PHASE4.md](./PHASE4.md). Requirements P1–P5 remain scoped and partial; general
React component compatibility remains open.

Twelve identical-source differential cases cover stateful children under parent
updates, reactive and destructured props, static defaults, inline callbacks, one
lazy child, primitive render-prop results, changing and nested context providers,
conditional consumers, independent roots, thrown child setup, local `forwardRef`
with ref disposal and a direct local tuple custom hook. Assertions include values,
interactions, DOM identity, body executions, balanced lifetimes, reconciler
exclusion and post-unmount inactivity.

Command: `npm.cmd run verify:phase4`.
All ten stages passed with an unchanged source fingerprint.
Report: `.private/acceptance/2026-09-12T16-15-02-946Z/report.json`.
Source digest: `12f064a91c72eb6fab0289250fee80db63c0ac2bb4284aa87392f5d615e0ee8e`.
Environment: Node v24.13.1, Windows x64, React 19.2.0, Chrome 152.0.7977.83.

- 271 package tests passed, with no failures or skips.
- 94 integration tests passed, including twelve Phase 4 cases.
- Eight architecture/source negative controls and the independent Node
  comparison passed.
- Both production builds, the six-checkpoint Chrome comparison, and the default
  renderer oracle passed. The browser fixture remains the Phase 2 production
  corpus; Phase 4 differentials currently run in jsdom.

Spreads, keys, multiple component children, imported/member components, general
wrapper and custom-hook analysis, retained callback identity, dynamic defaults,
arbitrary JSX returned by render props, asynchronous context propagation and
concurrent rendering remain outside this corpus. Phase 5 begins with operation
provenance for dynamic lists; replacement arrays without provenance remain a
known feasibility blocker.

## Phase 3 first effect increment, 2026-09-12

Status: verified for direct inline `useEffect(callback, [])`; Phase 3 remains
partial and the remaining React compatibility requirements remain open.

The compiler snapshots reactive values during the component's initial execution,
then the component instance owns passive setup, cleanup and pre-flush
cancellation. Identical source compiled independently for React 19.2.0 and the
signal target produced matching `effect:0` / `cleanup:0` traces. A state update
retained DOM identity, did not repeat the effect, and the target component body
executed once. Additional differential cases verify state declared after the
effect call and declaration-order cleanup for two effects. Negative cases reject
omitted or changing dependencies and indirect callbacks.

Command: `npm.cmd run verify:phase3`.
All ten stages passed with an unchanged source fingerprint.
Report: `.private/acceptance/2026-09-12T11-23-16-255Z/report.json`.
Source digest: `882ed6d019048bd18e256124a2c547ae33dc0bc46ce45c3a2f8ff33a89342c7f`.
Environment: Node v24.13.1, Windows x64, React 19.2.0, Chrome 152.0.7977.83.

- 271 package tests passed, with no failures or skips.
- 82 integration tests passed, including five Phase 3 cases.
- Eight architecture/source negative controls and the independent Node
  comparison passed.
- Both production builds, the Chrome comparison, and the default-renderer oracle
  passed. The browser fixture remains the Phase 2 production corpus; the new
  effect differential currently runs in jsdom.

Before this increment, strict compilation rejected `useEffect` through its
general unsupported-hook diagnostic. The retained source regression documented
that rejection. No-dependency and changing-dependency effects, update cleanup
ordering, nested effects, layout/ref ordering, external stores, and the remaining
Phase 3 event semantics are still unsupported. See [PHASE3.md](./PHASE3.md).

## Phase 2 exit verification, 2026-09-11

Status: verified for the documented derived-value and control-flow corpus.
Requirements P1–P5 remain partial and scoped; no universal compatibility claim
is made.

The run-once compiler now covers supported pure local helpers, reactive arrays
and objects, chained computations, lazily gated nested branches, common native
element identity, unkeyed fragments, reactive root ranges and supported tail
early returns. Branch-owned bindings are disposed when their lifetime ends.
Identical source is independently compiled for React 19.2.0 and the signal target;
the tests assert output, evaluation counts, DOM identity, focus, selection,
component execution, reconciler exclusion and post-disposal inactivity.

Command: `npm.cmd run verify:phase2`.
All ten stages passed with an unchanged source fingerprint.
Report: `.private/acceptance/2026-09-11T13-52-52-398Z/report.json`.
Source digest: `d76d88a16161d3b0c57ccf6f7bec96b6efb180af00d49cb63440ed57fab5da75`.
Environment: Node v24.13.1, Windows x64, React 19.2.0, Chrome 152.0.7977.83.

- 271 package tests passed, with no failures or skips.
- 77 integration tests passed, including 18 Phase 2 cases.
- Eight architecture/source negative controls and the independent Node
  comparison passed.
- Both production builds and six Chrome checkpoints passed; four removed-branch
  computations were observed disposing, with root-range and same-element
  identity checks enabled.
- The default renderer oracle passed its saved seeds and 100 exploratory
  sequences. It uses reconciliation and therefore does not certify P2.

The Phase 2 implementation and reproducers were already present in the working
tree when this verification began, so this session did not regenerate a
before-repair failure. The retained acceptance report certifies the final source
fingerprint and outcomes above.

Effects, refs, context, component composition, dynamic lists, opaque helpers and
arbitrary React source remain unsupported by this strict compiler path. Phase 3
is next: event snapshots, effect dependencies, owned commit work and cleanup
ordering.

## Phase 1 exit verification, 2026-09-09

Status: verified for the foundation corpus; feasibility blockers remain open.
See [PHASE1.md](./PHASE1.md) for criterion-to-test mapping, error semantics,
purity assumptions, architecture review and unresolved requirements.

Before repairs, package reproducers failed for stale reads after a derived error,
loss of a batch callback error when flushing also failed, leaked mount resources
after layout failure, and interrupted branch replacement after cleanup failure.
Two later branch reproducers failed for detached binding leaks during evaluation
and retained mounted DOM after commit failure. Two compiler fixtures showed
silently accepted imported-hook indirection. All eight regressions now pass.

New positive lexical coverage independently compiles unchanged React source with
imported aliases, derived chains and shadowed callback bindings. Three executed
React reference cases demonstrate opaque-helper reevaluation, escaped snapshot
identity and fresh-array keyed input identity/focus/selection. Target rejection
is explicit for those three cases; they remain unsupported, not compatibility
passes. Additional negative syntax fixtures are diagnostic coverage only.

Command: `node scripts/acceptance/run.mjs --phase=1` (also `npm run verify:phase1`).
All ten steps passed with an unchanged source fingerprint.
Report: `.private/acceptance/2026-09-09T05-32-00-296Z/report.json`.
Source digest: `f2d58a5e5d41fb998227aedda38b33b8da8311f8606a45c5ceef512b1bc1fe6e`.
Environment: Node v24.13.1, Windows x64, React 19.2.0, Chrome 152.0.7977.83.

- 264 package tests passed, no skips or failures.
- 59 integration tests passed, including 12 Phase 1 cases. Legacy observational
  probes and successful unsupported-case diagnostics retain their limited status.
- Eight negative controls and the independent Node comparison passed.
- Both production builds and six Chrome checkpoints passed, with source identity,
  focus, selection, DOM identity, lifetime and React-runtime exclusion checks.
- Default renderer oracle: six saved seeds plus 100 exploratory sequences passed;
  its reconciler-based results do not certify P2.

Phase 2 is next. No requirement P1–P8 is newly declared universally fulfilled.
Passive-error delivery, React error boundaries, arbitrary purity/alias analysis,
opaque dependencies and general replacement-array compatibility remain outside
this verified foundation corpus.

## Phase 1 exception handling increment, 2026-09-09

Status: verified runtime regressions, Phase 1 still active. Requirements: P1–P3
invariants and P5 resource ownership. No new claim of React error compatibility.

Before repairs, `node scripts/test-all.mjs` reported five new failures (252 passed,
5 failed): a throwing disposer omitted its disposal event; a throwing update
cleanup ran again on disposal; a failing subscriber stranded independent queued
work; and throwing component cleanup left both element and array roots attached.

The scheduler now drains queued work before reporting one original error or an
AggregateError containing multiple failures. Cleanup callbacks are cleared before
invocation. Teardown attempts remaining bindings, children, owners and root nodes
before reporting errors, and repeated disposal does not rerun owner cleanup.
Six added tests cover these behaviors, including multiple hook/owner errors,
zero live subscriptions/computations after teardown, single component execution,
no reconciler entry and no reactive work after disposal.

Full command: `node scripts/acceptance/run.mjs`; all ten steps passed with an
unchanged source fingerprint. Report and logs:
`.private/acceptance/2026-09-09T05-20-50-486Z/report.json`.
Source digest: `e5174a61ee4b80f05519e318de28681ed7a4e3be0f96c86f6a237d1dd7c54f4f`.
Environment: Node v24.13.1, Windows x64, Chrome 152.0.7977.83.
258 package tests and 47 integration tests passed; eight negative controls,
independent React comparisons, six production browser checkpoints and the default
oracle (six saved seeds plus 100 exploratory sequences) passed. Legacy
observational tests and the reconciler-based oracle retain their limited status.

Limits: independent subscriber recovery does not establish correct downstream
behavior after a derived computation fails. Batch callback/flush error interaction,
commit-time failures and dynamic branch teardown failures remain to be verified.
Strict compilation still rejects effects and error boundaries; direct runtime
cleanup fixtures do not certify those React features. Lexical analysis and
feasibility work also remain open.

## Phase 1 foundation repairs, 2026-09-09

Status: verified for the cases below; Phase 1 and universal compatibility remain
open. Requirements: P1–P5; construction tests cover runtime ownership, not React
error-boundary compatibility.

Before repair, `node scripts/test-all.mjs` failed three new assertions: initial
`effect` and `computed` failures remained subscribed and threw again on a signal
write; a function-valued state updater invoked its returned function instead of
storing it. A subsequent construction reproducer failed because a derivation ran
twice after its component threw during setup. Its detached child also retained
attribute bindings. These were behavioral failures, not expected-failure tests.

Repairs dispose failed initial computations, preserve returned function values,
and track resource-owning nodes during construction for failed-setup teardown.
The construction test asserts balanced lifetimes, zero live computations and
subscriptions, no reconciler entry and no subsequent reactive work. An independently
compiled identical-source React comparison verifies function state before/after
an event, stable DOM identity, no accidental function calls, one target body
execution and disposal. React 19.2.0 is the reference.

Full verification: `node scripts/acceptance/run.mjs`, all ten steps passed.
Report: `.private/acceptance/2026-09-09T05-12-57-645Z/report.json`.
Source digest: `4f0170e795ec216c95080539153e8c8ca699711af316c5d352418e451eb32807`.
Environment: Node v24.13.1, Windows x64, Chrome 152.0.7977.83.

- 252 package tests passed, no failures or skips.
- 47 integration tests passed; legacy observational cases remain non-acceptance.
- Eight negative controls and independent Node comparison passed.
- Both production builds and six browser checkpoints passed, including
  focus, selection, identity, lifetime and React-runtime exclusion gates.
- Default-renderer oracle: six saved seeds and 100 exploratory sequences passed;
  this is regression evidence, not proof of reconciliation-free compatibility.

Remaining work includes throwing cleanup callbacks and update-time scheduler
errors, broader construction/branch ownership, lexical fixtures and feasibility
counterexamples. The strict compiler still rejects effects, component composition
and lists; these repairs do not implement those features or React error boundaries.

## Phase 0 acceptance infrastructure, 2026-09-09

Full pipeline passed with an unchanged source fingerprint:
`.private/acceptance/2026-09-09T00-32-14-734Z/report.json`.
The report contains source-file hashes, commands, exit codes and logs for all
ten steps, plus the Chrome trace. Reproduce with `npm run verify:phase0`.

Eight negative controls were detected: same-instance re-execution, remount
substitution, actual reconciler invocation through an alias, dropped computation
disposal, post-unmount work, original-body replay, changed source, and a React
runtime dependency. The positive runtime trace passed lifecycle and subscription
checks. Chrome 152.0.7977.77 matched six production checkpoints using the same
component source hash, with focus, selection, identity and disposal checks.

The full package suite passed 248 tests; integration and the default oracle also
passed. The manifest explicitly separates observational legacy probes from
acceptance evidence. Phase 0 completion certifies this harness and its stated
controls, not arbitrary component support. See `scripts/acceptance/manifest.json`
for limitations and `docs/ROADMAP.md` for the active phase.

## Run-once compiler, 2026-09-09

- All package tests: 248 passed (39 signals, 110 hooks, 62 renderer, 37 compiler).
- Focused integration: 3 run-once tests and 4 existing expression tests passed.
- Independent Node comparison: identical React/signal output, one component
  execution, stable DOM, zero keyed-reconciler calls, disposed computations.
- Production demo: built successfully with React runtime exclusion enforced.
- Chrome 152.0.7977.77: one component execution, retained input identity/value,
  snapshot updates, branch removal/recreation, and no page errors.

These results cover the checked compiler subset in [RUN-ONCE.md](./RUN-ONCE.md).
They do not establish full React compatibility or repair the complete issue app.

## Earlier runtime validation

Local working tree, 2026-09-08. These results do not describe published packages.

| Check | Result |
| --- | --- |
| All four package builds | Passed |
| Full package suite | 247 passed: signals 38, react-compat 110, renderer 62, compiler 37 |
| Compiler suite after conservative map change | 37 passed |
| Compiler/runtime expression regressions | 4 passed |
| Existing compatibility audit before map change | 41 passed, including 2 expression regressions; older observational tests are not compatibility guarantees |
| Differential oracle | 6/6 saved cases; 100 exploratory sequences, zero divergences |
| Explicit oracle seed 20260908 | Passed |
| Signal example production build | Passed; 15.13 kB JavaScript, 5.76 kB gzip at that build |
| Production bundle in jsdom with MessageChannel | Empty root, including after queued-effect wait; application compatibility not achieved |

The fragment and nested-return regressions failed before their renderer fix.
Getter/helper JSX calls failed before their compiler fix. Map callbacks using
local declarations and index/source arguments threw ReferenceErrors before the
conservative optimization change. Their tests now assert updates as well as mount.

The production build measurement preceded the final conservative map change and
unused-entry-import cleanup. It is an artifact size, not a speed comparison or a
successful application result. The DOM smoke check is not a real-browser test.

## Reproduce

From the repository root:

```sh
node scripts/build-all.mjs
node scripts/test-all.mjs
npm test --prefix apps/compat-audit -- --maxWorkers=1 --minWorkers=1
npm run oracle --prefix apps/oracle
npm run oracle --prefix apps/oracle -- --seed 20260908
npm run build:rrjs --prefix apps/flip
```

The oracle normalizes empty text anchors and uses separate implementations. Its
passing result covers its tested operations, not arbitrary React components.
No performance benchmark was rerun for these runtime changes.
