# Phase 3 effect increment

Status: **verified for the stated narrow scope** after the recorded checks pass.
This remains a bounded Phase 3 increment and does not complete Phase 3.

## Supported behavior

The strict `runOnce` compiler accepts a direct `useEffect(() => ..., [])` call.
The callback must be inline and the dependency array must be a literal empty
array. Reactive state reads in setup and cleanup are replaced with values
snapshotted during the component's single initial execution, including when a
callback lexically references state declared after the effect call. The existing
component instance schedules the passive setup, owns its cleanup, and cancels
queued setup when unmounted before the passive flush.

Inline effects with a nonempty literal dependency array now accept direct state
dependencies. The compiler creates a dependency getter and captures current
values per setup, so the previous cleanup retains its own values. An owned signal
watcher schedules passive cleanup/setup without re-entering the component.
Omitted dependencies, callback indirection, layout-effect dependency compilation
and broader scheduling remain unsupported.

The identical-source fixture in `apps/compat-audit/tests/phase3.test.ts` uses
independent React and target JSX compilation. It asserts matching mount and
cleanup traces, initial-state snapshots, a state update without effect replay,
retained DOM identity, one target body execution, no reconciler entry, and no
reactive work after disposal. It also compares later-declared state capture and
declaration-order cleanup for multiple effects. A separate target invariant
covers pre-flush cancellation. Rejection tests are negative controls for omitted
or changing dependencies and indirect callbacks.

## Before result

Before this increment, the existing strict-source regression required
`useEffect(() => {}, [count])` to fail with `runOnce: useEffect is not supported
by this compiler pass yet`. The compiler rejected empty dependency effects by
the same general hook diagnostic, so no strict identical-source effect fixture
could execute.

## Remaining scope

No-dependency effects, changing dependencies, cleanup-before-next-setup,
nested effect ordering, effect-triggered updates, layout effects, refs,
imperative handles, external stores, and broader event/callback semantics remain
unsupported. Component composition, dynamic lists, universal React source
compatibility, and full application acceptance also remain open. The target-only
cancellation assertion is an ownership invariant, not differential evidence.

## Reproduction

```sh
node scripts/build-all.mjs
npm test --prefix apps/compat-audit -- --maxWorkers=1 --minWorkers=1 phase3.test.ts
node scripts/test-all.mjs
npm test --prefix apps/compat-audit -- --maxWorkers=1 --minWorkers=1
```

The complete gate is `npm run verify:phase3`; it also reruns negative controls,
production browser comparisons, and the default-renderer oracle. The verified
result and its source digest are recorded in `docs/VALIDATION.md`.
