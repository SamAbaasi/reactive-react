# Phase 5 direct-operation lists

Status: **known-operation corpus verified; the general replacement blocker remains
open.** Direct append, prepend, splice, reverse, filter, comparator sort, tail
removal and clear passed the complete acceptance gate.

The first slice targets a functional append whose provenance is visible in the
component source:

```jsx
setRows(previous => [...previous, nextRow])
```

The matching JSX uses `rows.map((row, index) => ...)`. React retains existing row
nodes, appends one row, supplies the new index and preserves the following sibling.
`apps/compat-audit/tests/phase5.test.ts` records those observations. Before the
repair, the target rejected the same source with its direct-operation diagnostic.

The target now rewrites the visible updater to `listAppend`, which returns the
ordinary next array and records its exact predecessor and appended values in a
private `WeakMap`. `operationList` renders the initial rows once and inserts only
the appended nodes before its anchor. It does not inspect keys, compare old and
new arrays, call `list()`, enter `reconciler-enter`, replay the component body or
load React. A visible `setRows([])` becomes `listClear`; its operation disposes
all row scopes directly while retaining surrounding siblings. Updates without
matching provenance throw. The exact `previous.slice(0, -1)` form becomes a
tail-truncation operation and disposes only the removed row. A functional prepend
inserts before the first row and updates retained rows through owned index signals.
The `toSpliced` form carries a direct middle insertion/deletion command, while
`toReversed` moves the existing nodes and index owners in reverse order. Filter
carries retained source indices; sort carries a permutation of source indices.
Moving rows preserves an active input, its uncontrolled value and its selection.
Map callbacks may contain local statements before their returned JSX when those
locals depend only on the statically preserved key. A map update is accepted
only when the JSX key is a direct item property and every mapper return is
proven to preserve it. Key-changing maps and locals derived from mutable item
fields are rejected explicitly. Each accepted update emits a `list-operation`
trace.

Append and filter also accept the ordinary event-snapshot spellings
`setRows([...rows, item])` and `setRows(rows.filter(predicate))`. The compiler
records their operations before rewriting captured state reads into event-local
snapshots. Multiple replacement setters in one event reuse that one captured
array, matching React's snapshot behavior rather than accumulating an earlier
setter. When a later append supersedes an earlier append from the same captured
predecessor, the renderer removes only the nodes created by the known earlier
operation and applies the later operation; it does not compare keys or arrays.

Snapshot recognition uses lexical Babel binding identity. A local array that
shadows the state name is not treated as that state. Since its replacement has
no supported identity provenance, compilation rejects it explicitly instead of
routing it through reconciliation or treating the spelling as proof.

Fresh replacement arrays from opaque code, including shadowed locals, remain
unsupported. Recovering row identity from their keys would require old/new
matching and violate P2. Supersession is currently established only for direct
append operations sharing one predecessor; other skipped-predecessor operation
chains remain outside this corpus.

Default sort uses native UTF-16 string ordering and keeps `undefined` values at
the end without invoking the comparator for them. Sparse inputs are published
densely like `toSorted`. Splice start and delete-count coercion covers `NaN`,
positive infinity and negative infinity. A seeded 100-step operation sequence
checks array-model output, reactive indices and absence of reconciler entry.
Functional append/prepend/reverse setters in one event retain direct predecessor
provenance. Row moves restore the active element and its selection after moving
nodes. The production Chrome fixture matches React's `blur`, `focus` event trace
while preserving identity and uncontrolled value; jsdom has a narrower focus
event model. The fixture exercises append and reverse against independently built
React and target bundles.

Direct operation provenance also crosses a direct local component getter prop.
The exact copied-array pattern that removes one item with `splice(index, 1)` and
inserts it with `splice(target, 0, moved)` compiles to `listMove` only when exact
binding/reference counts and an earlier negative/out-of-range guard are proven.
Extra declarators, later references and side-effectful operands are rejected.
Imported operation props can cross a manually asserted source/export contract;
their child JSX key and parent key-preserving updates are checked.

Run the current baseline with:

```sh
npm test --prefix apps/compat-audit -- --maxWorkers=1 --minWorkers=1 phase5.test.ts
```

Current full verification: `npm.cmd run verify:phase5`, all ten acceptance
steps passed on 2026-09-13. Report:
`.private/acceptance/2026-09-13T21-59-21-885Z/report.json`. Source digest:
`74a16ccfed2807d0f2b6633ae2db19f9f513958ea393d6f739d47c9e2074371b`.
The package suite passed 278 tests with no failures or skips, and all 122
integration tests passed. The report records Node v24.13.1, Windows x64 and
Chrome 152.0.7977.83. Chrome matched the React
`blur`/`focus` move trace as well as row identity, uncontrolled value, selection
and final focus. This evidence covers the bounded direct-operation corpus
described above. Supersession for non-append snapshot operations, opaque
replacements and other skipped-predecessor chains remain unsupported.
