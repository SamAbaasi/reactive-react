# Compatibility roadmap and acceptance contract

This is the work plan for achieving the project requirements together. Completing
a smaller subset does not change the requirements or establish universal support.
Current evidence is in [VALIDATION.md](./VALIDATION.md); the implemented compiler
subset is described in [RUN-ONCE.md](./RUN-ONCE.md).

## Requirements and present evidence

| ID | Requirement | Present status | Evidence required for completion |
| --- | --- | --- | --- |
| P1 | Component bodies execute once per mount | Verified for a small compiler subset | Per-instance execution and mount/unmount traces across the full accepted corpus; no whole-body replay hidden inside computations |
| P2 | No reconciler in the target execution path | No keyed-list calls in the tested subset; the default renderer still contains a reconciler | Generated-code and dependency review plus operation traces proving no old/new tree or keyed-array matching, including indirect calls |
| P3 | Signals drive direct DOM updates, without a React runtime fallback | Verified for the small production demo | Production module-graph checks and DOM/subscription traces for every supported feature |
| P4 | Arbitrary unmodified React component source works | Open; only a checked subset works | Independently compiled identical-source differential corpus, documented React versions/features, real applications and libraries; finite passing tests alone never prove the universal claim |
| P5 | React-observable behavior is preserved | Partial output, event snapshot, identity, branch, disposal and native SVG coverage | State, events, effects, context, refs, scheduling, focus, selection, identity and lifetime comparisons, with all differences recorded |
| P6 | The unchanged issue application works under P1–P5 | Complete for audited workflow | Fifteen-checkpoint React/target production browser differential with unchanged component files and architecture gates |
| P7 | The four packages work for external consumers | Local tarball consumer verified; registry release remains open | Repeat against the final release candidate and public registry without workspace resolution |
| P8 | Published performance, size and memory claims are supported | No current compiler-path benchmark evidence | Equivalent behavior first, then reproducible measurements and raw data supporting each specific claim |

“Once” permits a new execution for a genuine new mount. It does not permit
remounting on every update, changing keys to force replacement, or moving the
entire component body into an effect and renaming that effect a computation.
Compiled subexpressions may execute when their dependencies change.

“No reconciler” excludes comparing old and new element trees or arrays to infer
retained keyed rows. Renaming, inlining, or outsourcing that algorithm does not
satisfy P2. Direct insert/update/move/remove commands derived from known operations
are a candidate mechanism, not an already-proven solution for arbitrary source.

## Evidence rules: apply in every phase

1. Identify the requirement IDs and exact behavior being changed before editing.
2. Add a behavioral reproducer. Run it before the repair and record the actual
   mismatch, or record an explicit compile rejection for a missing feature.
3. Run identical component source against real React and the signal target.
   Use independent JSX compilers. Only entry/build wiring and module resolution
   may differ; do not hand-rewrite the signal component to make a test pass.
4. Assert observable results after interactions, not just successful compilation
   or mounting. Include lifetime, identity and architecture assertions alongside
   output assertions. A React-equal result achieved by re-rendering still fails.
5. Inspect generated code and instrument the execution path. A search for the
   name `list` alone is not proof of P2. The default renderer's oracle is a useful
   regression check, but it uses reconciliation and separate implementations.
6. Prove new gates can detect a deliberately introduced violation. Keep those
   negative controls in the test harness; do not merely trust instrumentation.
7. Run the relevant full regression gates before accepting a phase. No skipped,
   expected-failure, `expect(true)`, “did not throw”, screenshot-only, or
   observational-report test counts as evidence that a requirement is fulfilled.
8. Record remaining mismatches and unsupported inputs. Never weaken assertions,
   normalize away a requirement, alter the reference component, or add a fallback
   to obtain a green result. Any necessary normalization must be explicit and
   cannot support claims about the observable it removes.
9. Update the evidence record with commands, outcomes, environment, source
   identity, limitations and requirement IDs. Old results do not certify newly
   changed code. Blocked verification means **unverified**, not accepted.

## Phases

Phases 0–5 have verified bounded corpora. Phase 6 has a passing bounded workflow
for the unchanged issue application using a manual exact-path module-contract
manifest. Local tarball ESM, declaration, strict-compiler and production-bundle
checks pass. Phase 5's opaque-replacement blocker and universal compatibility
remain open.
Phase 0 evidence: `.private/acceptance/2026-09-09T00-32-14-734Z/report.json`.

### Phase 0 — Establish the acceptance harness

**Requirements:** all. **Dependency:** none. **Status: verified acceptance infrastructure.**

Implemented a classified manifest, runtime identity/subscription/lifetime tracing,
eight negative controls, independent Node and production-browser comparisons,
source hashes, production module/export checks, DOM mutation traces and a
fail-on-error pipeline. `npm run verify:phase0` reruns the complete gate and saves
source fingerprints and logs. Instrumentation limits are explicit in
`scripts/acceptance/manifest.json`; this is not a proof against arbitrary opaque
or newly introduced matching code. The current generated path and known
reconciler entry were reviewed; future architecture changes require another review.

- Create a requirement-to-test manifest distinguishing behavioral regressions,
  architecture gates, observational probes and unsupported cases.
- Track component instance IDs, executions, mounts, disposals, computation runs,
  subscriptions and DOM operations. Detect hidden re-execution and remount tricks.
- Enforce React-runtime exclusion using the production module graph. Expand
  reconciler detection beyond a single function name; review generated/runtime
  operations and guard all reconciler entry points used by the project.
- Run reference and target independently with identical source hashes. Separate
  React development diagnostics from production behavior explicitly.
- Add negative controls: forced component re-execution, keyed matching, React
  fallback, dropped cleanup and changed component source must fail their gates.
- Establish strict browser comparisons for focus, selection, controlled values,
  refs and lifecycle. Record intentional internal-anchor differences separately.

**Exit evidence:** controls fail for the intended reasons; current supported cases
pass all applicable gates; unsupported cases are visible and do not count as
passes toward P4. Save a reproducible baseline and list remaining harness gaps.

### Phase 1 — Validate feasibility and strengthen compiler foundations

**Requirements:** P1–P5. **Dependency:** Phase 0. **Status: verified foundation corpus; feasibility blockers remain open.**

Phase 1 exit evidence and the purity/module assumptions are in
[PHASE1.md](./PHASE1.md). The full ten-step gate passed:
`.private/acceptance/2026-09-09T05-32-00-296Z/report.json` (264 package tests,
59 integration tests, negative controls and production browser checks).
Reproduce with `npm run verify:phase1`. Completion means the listed foundation
fixtures and feasibility investigation are done; rejected reference cases remain
unsupported and do not fulfill P4.

Verified foundation increment: failed initial computations release subscriptions;
function-valued state updates preserve the function; failed component construction
releases derivations and detached child bindings. Same-source function-state and
runtime ownership gates pass. Full ten-step acceptance passed at
`.private/acceptance/2026-09-09T05-12-57-645Z/report.json` (252 package tests).
The next increment verifies throwing cleanup teardown and independent queued
subscriber recovery: `.private/acceptance/2026-09-09T05-20-50-486Z/report.json`
(258 package tests; full ten-step gate passed). Both element and array roots
release resources despite cleanup failures, with lifetime/subscription assertions.
The final increment repairs derived-error propagation, combined batch/flush
failures, mount commit failures, branch evaluation/commit failures and imported
hook-indirection diagnostics. It adds differential lexical fixtures and executed
React reference counterexamples. These runtime repairs do not establish React
error-boundary semantics; broader language analysis and universal compatibility
remain open as detailed in PHASE1.md.

- Investigate the hardest constraints early: opaque imported functions, escaped
  closures, externally supplied replacement arrays and keyed identity without
  old/new matching. Produce minimal counterexamples and proposed mechanisms.
- Define the supported effect/purity assumptions and distinguish known
  operation provenance from inputs for which provenance is unavailable.
- Strengthen lexical binding analysis: aliases, shadowing, destructuring,
  custom/namespace hooks, writes, function-valued state and module boundaries.
- Establish complete ownership for generated computations, branch scopes,
  subscriptions and queued work; make disposal and scheduling exception-safe.
- Define conservative diagnostics for transformations that are not yet sound.

**Exit evidence:** lexical and ownership fixtures pass differential/invariant
tests; updates after unmount do no work; exceptions restore tracking state.
Feasibility blockers remain explicitly unresolved. A counterexample cannot be
closed by relaxing P1/P2 or restricting P4 without acknowledging the unmet claim.

### Phase 2 — Compile derived values and control flow

**Requirements:** P1–P5. **Dependency:** Phase 1. **Status: verified control-flow corpus.**

The complete ten-step acceptance gate passed at
`.private/acceptance/2026-09-11T13-52-52-398Z/report.json`: 271 package tests,
77 integration tests, all negative controls, independent Node and production
browser comparisons, and the default renderer oracle. The verified scope covers
supported pure helpers, chained arrays/objects, gated nested branches, common
same-element identity, fragments, reactive root ranges, supported tail early
returns and branch-owned disposal. Effects, component composition, dynamic lists
and arbitrary React source remain open.

- Extend immutable derivations to supported calls, arrays, objects and helpers
  without duplicating effects or changing evaluation order.
- Gate nested branches so inactive branches never evaluate unsafe reads.
- Preserve state, DOM identity, input values, focus and selection while a branch
  remains selected; dispose it exactly when its lifetime ends.
- Add fragments, reactive root ranges and supported early-return/control-flow
  transformations without replaying the component body.

**Required fixtures:** inactive null dereference; nested branch toggles; unchanged
  selected branch during updates; fragment insertion/removal; early empty/nonempty
  returns; chained computations; helper evaluation counts; shadowed identifiers.

**Exit evidence:** identical-source output and lifetime match React; each logical
component executes once; no tree comparison; removed scopes stop updating.

### Phase 3 — Preserve events, effects and commit behavior

**Requirements:** P1, P3–P5. **Dependencies:** Phases 1–2.

- Compile dependency arrays, callback captures and cleanup into explicit owned
  commit work without revisiting the component body.
- Cover no-dependency, empty-dependency and changing-dependency effects; previous
  cleanup, child/parent ordering, cancellation and updates triggered by effects.
- Preserve event snapshots, functional updater sequences, asynchronous captures,
  escaped callbacks and observable batching behavior, including DOM reads in an
  event before and after setters.
- Complete layout/ref ordering, callback-ref cleanup, imperative handles and
  external-store subscription behavior for the accepted scope.

**Required fixtures:** interval callback; queued promise/timer; retained old
handler; duplicate value setters; multiple functional setters; changed deps;
unmount before passive work; nested effects; layout read with connected ref;
external-store update between setup and commit.

**Exit evidence:** event/effect/cleanup traces and observations match the reference;
P1/P2 still pass; queued work cannot resurrect disposed scopes.

### Phase 4 — Component composition, props and context

**Requirements:** P1–P5. **Dependencies:** Phases 2–3.

**Status:** implemented for a bounded composition corpus; final acceptance report
is recorded in [VALIDATION.md](./VALIDATION.md). Direct local components cover
reactive/destructured props, static defaults, inline callbacks, one lazy child,
primitive render-prop results, direct local context providers and consumers,
conditional consumers, independent roots, local `forwardRef`, direct local tuple
custom hooks and thrown child setup. Broader source forms remain open.

- Defer child construction until its owner/provider scope exists.
- Compile reactive props, destructured/default props, children and render props
  while preserving function-valued props and callback identity semantics.
- Support nested providers, provider updates, consumer lifetime and sibling/root
  isolation without re-executing consumer component bodies.
- Integrate custom hooks and wrappers with the same ownership and source rules.

**Required fixtures:** a stateful child under parent updates; nested/shadowed
providers; changing provider values; conditional consumers; render-prop arguments;
multiple independent roots; thrown child setup; ref forwarding through wrappers.

**Exit evidence:** values, identities and cleanup match React; child state survives
parent updates; no scope leakage, re-render loop or fallback.

### Phase 5 — Dynamic lists without reconciliation

**Requirements:** P1–P5. **Dependencies:** feasibility work in Phase 1 and Phase 4.

**Status:** active. [PHASE5.md](./PHASE5.md) records the first same-source append
corpus. Source-visible functional append/prepend/filter, immutable splice/sort/
reverse, tail removal and clear issue traced direct operations while retaining
rows, surrounding siblings, uncontrolled input state, focus and selection. Row
indices update through owned signals. Opaque replacements remain an explicit
feasibility blocker because recovering identity would require old/new matching.

- Compile understood list operations into explicit structural commands.
- Preserve object/primitive content, keys, indices, callback parameters and
  statements, focus and per-row component state.
- Test insertion, deletion, clear, reorder, filtering, sorting and replacement,
  including arrays returned by external code and updates with no operation history.
- Preserve following sibling identity when a preceding nested list changes size.
- Detect unavailable provenance explicitly. Rejecting such input protects P2 but
  still leaves P4 unmet; rejection is not a completed compatibility feature.

**Exit evidence:** differential randomized sequences with reproducible seeds;
row lifetime and identity assertions; direct-operation traces; no old/new keyed
matching anywhere in the target. If general replacement cannot meet these gates,
keep this phase and the universal promise open. Do not substitute the old list().

### Phase 6 — Complete the unchanged issue application

**Requirements:** P1–P7. **Dependencies:** Phases 2–5.

**Status:** complete for the recorded unchanged-application workflow.
[PHASE6.md](./PHASE6.md) records the compiler contract, browser gate and limits.

- Keep App, IssueList, IssueForm, Stats and ThemeContext identical across targets.
- Cover initial load, routing, toggle, rename, move, delete, creation, validation,
  theme updates, title effects, local counters, empty/recreate and genuine route
  remount/reset behavior.
- Verify controlled inputs/selects, event aliases, focus, selection, boolean
  properties and TypeScript against the actual public APIs.
- Run production builds in a real browser with all architecture gates enabled.

**Exit evidence:** complete browser traces match React, application errors are
absent, source hashes match, each instance executes once and no reconciler/React
fallback is present. The archived re-execution experiment is not evidence here.

### Phase 7 — Expand compatibility beyond the application

**Requirements:** P1–P5, P7. **Dependency:** Phase 6; add representative cases earlier.

**Status:** the first native SVG slice is verified for a bounded single-module
intrinsic tree. [PHASE7.md](./PHASE7.md) records the namespace/attribute contract,
five-checkpoint browser gate and explicit cross-component boundary. Portals and
the remaining features below are still open.

- Build a versioned corpus of independently chosen components and third-party
  libraries, not only examples designed for this compiler.
- Cover remaining hooks, event/ref/DOM behavior, portals, SVG, error boundaries,
  classes, Suspense, concurrent APIs, Strict Mode semantics, SSR and hydration.
  Track each feature separately; do not treat unimplemented APIs as harmless no-ops.
- Exercise opaque dependencies and precompiled components; preserve original
  source and dependency behavior. Record compiler-access requirements explicitly.
- Expand metamorphic/random tests and mutation controls without counting generated
  test quantity as proof of universality.

**Exit evidence:** publish the exact supported corpus, versions, feature matrix
and counterexamples. Every finite corpus result remains scoped. P4 cannot be
marked universally proven merely because this corpus is green.

### Phase 8 — Performance and external release verification

**Requirements:** P7–P8, with P1–P6 as applicable prerequisites.

- Repeat the passing local-tarball consumer gate against the final release
  candidate and, after separate authorization, the public registry packages.
- Specify each performance claim and its workload before measurement. Benchmark
  equivalent behavior with the architecture/correctness gates still active.
- Measure relevant mount/update/list/teardown workloads, startup, production
  compressed size and steady-state memory with repeated mount/unmount cycles.
- Record runtime/browser/hardware, throttling, warmup, sample count, dispersion,
  raw output and exact source/package identity. Distinguish older measurements.
- Produce a reviewable release candidate and an accurate supported-feature matrix.
  This phase does not authorize committing, publishing or pushing automatically.

**Exit evidence:** fresh-consumer checks pass and each numerical claim has
reproducible supporting data. A smaller bundle does not establish faster updates,
lower memory, or compatibility.

## Required verification commands

Current commands (build dependencies first):

```sh
node scripts/build-all.mjs
node scripts/test-all.mjs
npm test --prefix apps/compat-audit -- --maxWorkers=1 --minWorkers=1
node scripts/verify-run-once.mjs
npm run build:run-once --prefix apps/flip
node scripts/verify-run-once-browser.mjs
npm run verify:phase5
npm run verify:phase6
npm run verify:phase7
node scripts/verify-node-esm.mjs
node scripts/verify-external-consumer.mjs
```

Run the oracle when shared renderer/scheduler/list behavior changes, but do not
use it to certify P2 or identical-source compatibility. Add new phase fixtures to
the mandatory gate as they become executable. The complete current harness is
`npm run verify:phase0`; it builds both browser targets before comparing them.
Browser verification requires Chrome and
Playwright; unavailable prerequisites must be reported rather than silently skipped.

## Acceptance record template

For each completed work item, append or link an evidence record containing:

- Phase, requirement IDs, exact supported behavior and remaining exclusions.
- Source identity: commit plus uncommitted diff/content hashes when applicable.
- Reference React/compiler versions and the unchanged source fixture/hash.
- Before result: command, exit status and observed mismatch or rejection.
- After result: command, exit status and assertions, including P1–P3 invariants.
- Regression and browser results, environment and retained logs/raw artifacts.
- Negative-control outcome for newly added gates.
- Status: **verified for stated scope**, **partial**, **unsupported**,
  **contradicted**, or **unverified**. Include the reason for every non-verified item.

The next execution step is the Phase 7 portal ownership slice, described under
Phase 7 above. Re-run the complete Phase 5, Phase 6 and Phase 7 gates after
runtime/compiler changes; current reports do not certify future code.
