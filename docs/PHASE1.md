# Phase 1 foundation evidence and feasibility findings

This phase establishes a tested foundation and records feasibility blockers. It
does not establish arbitrary React compatibility. Requirement definitions remain
unchanged in [ROADMAP.md](./ROADMAP.md). Current acceptance results are recorded
in [VALIDATION.md](./VALIDATION.md).

## Exit criteria and evidence

| Criterion | Implemented evidence | Scope |
| --- | --- | --- |
| Lexical binding identity | `apps/compat-audit/tests/phase1.test.ts` independently compiles imported hook aliases, transitive locals and shadowed callback bindings against React; checks DOM identity, once-only execution and disposal | Named supported imports; not arbitrary custom hooks |
| Conservative diagnostics | Same file checks destructuring, writes, namespace/custom hooks, opaque derivations, escaped closures and imported-hook indirection | Rejections expose unsupported inputs; they do not fulfill P4 |
| Function-valued state | `run-once-source.test.ts` compares unchanged source with React and checks function identity without accidental invocation | Existing event/compiler subset |
| Derived error recovery | `packages/signals/tests/exceptions.test.ts` checks failed reads, downstream invalidation, recovery, disposal and combined batch/flush failures | Runtime error contract, not React error-boundary semantics |
| Ownership and failed construction | `packages/renderer/tests/lifecycle.test.ts` checks component/branch setup and commit failures, pending passive cancellation, throwing cleanup, array roots and subsequent recovery | Runtime ownership fixtures; unsupported React hooks are not certified |
| No work after lifetime ends | Runtime event gates verify balanced instances, disposed computations and removed subscription edges; subsequent writes must cause no reactive work | Tested paths and known reconciler entry |
| Feasibility investigation | Three executed React reference cases establish opaque-helper, escaped-closure and replacement-array requirements | Target rejects these cases; blockers remain open |

The complete reproducible gate is `npm run verify:phase1` (use `npm.cmd` from
PowerShell if script execution is disabled). It builds packages, runs negative
controls, independent source comparisons, package/integration suites, both
production targets, Chrome comparisons and the default renderer oracle. Reports
retain source hashes and logs under `.private/acceptance/`.

## Runtime error contract

- A failed computed value records its failure. Reading it, including through
  another computation, throws instead of returning a stale successful value.
  A later successful dependency update publishes a valid value again. Successful
  equal values continue to suppress redundant notifications.
- The scheduler drains queued work before reporting errors. One error is
  rethrown; multiple failures are reported together. Batch callback and flush
  errors are both retained. This is not a transactional rollback mechanism.
- A failed initial computation releases subscriptions because no disposer can
  reach its caller. Disposers clear cleanup callbacks before invoking them.
- Component and branch construction own newly created resource-bearing nodes.
  Failed setup releases those resources. Failed synchronous commit tears down the
  affected mounted tree or new branch and cancels its uncommitted passive work.
- A cleanup exception does not prevent remaining teardown or branch replacement.
  Error reporting happens after the attempted teardown. A branch evaluation
  failure may retain previously committed DOM; this is not React error handling.

Passive effect exception delivery, React retry/error boundaries, concurrent
scheduling, Suspense and transactional UI recovery remain later compatibility
work. These foundational tests do not certify their semantics. DOM methods altered
by external code, arbitrary reentrant user code and nontermination are not covered
by a universal exception-safety claim.

## Purity and module assumptions

The positive derivation corpus uses immutable primitive expressions and ordinary
data reads: aliases, arithmetic, comparisons and conditional selection. State
bindings cannot be reassigned. Derived bindings must be `const`; explicit calls,
mutations and JSX-producing derivations are rejected by the current pass.

These restrictions are not a proof that every accepted JavaScript expression is
pure. Property access and coercion can execute getters, proxies or user code.
Effects, identity-sensitive allocation and evaluation order need further analysis
before expanding the supported corpus. Compiler access to a call site alone is
not evidence about an imported function's body. Unknown/custom hook semantics
must not be inferred from the local alias used to import them.

## Executed feasibility counterexamples

### Opaque imported helper

The reference fixture imports `calculate`, computes `const value = calculate(n)`,
and increments `n`. React calls the helper with 0 and then 1; output changes from
0 to 2. The target rejects the derived call.

Candidate mechanism: analyse available helper bodies and emit owned computations
only when evaluation order, dependency reads and effects are understood. Treat
side-effecting or unavailable bodies as unresolved. Acceptance needs same-source
call-order/count and value tests, including imported helpers with effects; merely
calling every helper from a computation does not establish compatibility.

### Escaped callback snapshot

The reference fixture retains a callback created before an update. The old
callback still returns 0, while the newly exposed callback returns 1 and has a
different identity. Reading current signal values inside every escaped callback
would produce the wrong result. The target rejects this case.

Candidate mechanism: compile closure creation and exposure into explicit,
versioned capture operations, preserving old environments and exposure timing.
This must not replay the whole component body. Acceptance needs retained old
handlers, async continuations, callback identity and registration/cleanup traces.
The mechanism is proposed, not implemented or verified here.

### Fresh external replacement array

The reference imports a producer that returns fresh objects in reversed key order.
React moves the existing keyed inputs: typed text, focus and selection stay with
the original input. The target rejects the map/list expression.

Known operation provenance means the producer supplies the actual insert, remove
or move operation and its stable target identity. Such operations are candidates
for direct DOM commands. A fresh array from external code supplies final values,
not the operations that produced them. Associating its keys with old row instances
would be old/new keyed matching, prohibited by P2 regardless of its function name.

No general implementation meeting both arbitrary replacement support and the
current no-matching constraint has been established. Instrumenting an accessible
producer is a candidate for known operations; it does not solve opaque external
arrays. This blocker remains open in Phase 5 and keeps P4 unfulfilled.

## Architecture review

The repairs add error-state propagation, construction scopes and teardown work.
They introduce no component replay or React runtime fallback. The branch updater
continues to operate on concrete DOM nodes in an owned region; its existing node
identity retention is not a keyed React-element matching fallback. The default
`list` reconciler still exists and remains excluded from strict compilation.

Production module/export checks and actual reconciler-entry controls complement
this source review. They cannot prove the absence of every possible opaque or
renamed algorithm. Finite passing fixtures never prove the universal promise.
