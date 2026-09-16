# Runtime and compiler issues

Status describes the working branch, not published npm packages.

## Repaired with regression coverage

| Area | Repair | Evidence |
| --- | --- | --- |
| Scheduler | Settle derived values before effects; cancel queued disposed subscribers | signals/tests/glitch.test.ts and disposal.test.ts |
| Dynamic children | Stable anchor, replacement, nested arrays, retained identity | renderer/tests/dom-behavior.test.ts |
| Binding disposal | Dispose renderer attribute, text, and list subscriptions | dom-behavior.test.ts and unmount.test.ts |
| Keyed rows | Publish replacement objects to retained rows, including append | list-content.test.ts and dom-behavior.test.ts |
| Lifecycle | Post-insertion layout effects, shared-root ownership, fragment and primitive-array returns | renderer/tests/lifecycle.test.ts |
| DOM bindings | Native double-click and live input value/checked properties | dom-behavior.test.ts |
| JSX calls | Track getter and helper calls used as children | apps/compat-audit/tests/reactive-expressions.test.ts |
| Package loading | ESM extensions/exports; compiler runtime imports | scripts/verify-node-esm.mjs and plugin tests/inject-runtime.test.ts |

The production example entry substitution now runs before Vite resolves its module graph. Application behavior still requires the work below.

## Remaining work

1. **State values and derived expressions.** Ordinary React expects values, while hooks expose getters. Track bindings, scopes, derived computations, and control flow in the compiler. Simple textual replacement is unsafe.
2. **Effect dependencies and event snapshots.** Components execute once, so dependencies are never compared again. Define update scheduling, cleanup, and closure semantics together. Test against React with identical source.
3. **Context and props.** Eager h() constructs consumers before providers. Establish ownership and deferred child execution, then verify nested providers, updates, and conditional removal.
4. **List semantics.** Numeric indices are not reactive. Primitive items cannot use object proxies. Complex callbacks now retain native map execution, preserving statements and index/source parameters. Their rows are recreated on updates; keyed identity for that path remains unsupported.
5. **General reactive ownership.** DOM-created bindings are owned; user-created computations and hook memos still need complete disposal scopes.
6. **DOM and refs.** Expand event aliases, controlled select behavior, callback-ref cleanup, SVG, and exact empty-child representation.
7. **Types.** Preserve valid React source without disguising runtime getters as values. The example signal typecheck configuration is currently missing.

Existing probes reproduce getter arithmetic/comparison failures, stale dependencies, and missing provider values. Some have weak assertions; replace those with explicit expected results as each feature is implemented. An observational pass is not a correctness guarantee.

## Acceptance sequence

For each repair, add a failing behavioral test, fix the owning layer, verify the focused test, then run affected package and integration suites. Use identical source for compatibility claims. Compare output, event results, effect/cleanup order, focus, identity, and unmount behavior.

Benchmark only after equivalent behavior passes. Historic artifacts describe older implementations and are not measurements of this branch.
