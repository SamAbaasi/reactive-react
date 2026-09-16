# Keyed list behavior

The renderer uses keys to preserve row DOM identity. Reusing a node also requires publishing replacement item data to its reactive bindings.

Each object row owns an item signal and a read-through proxy. Property reads made inside bindings subscribe to the current item. Row construction runs untracked so its reads do not subscribe the entire list to every row field. Appends must publish updated data for retained rows as well as create new rows.

Removal and clear unmount row nodes and dispose their renderer-owned bindings. Ordering uses a longest-increasing-subsequence pass to minimize retained-node moves.

## Limits

- Destructuring an item outside a reactive binding captures its initial values.
- Primitive items and numeric indices do not gain reactivity from an object proxy.
- Complex map callbacks retain ordinary map execution and recreate their rows on updates. Keyed identity on that path is not implemented.

## Validation

See packages/renderer/tests/list-content.test.ts, list.test.ts, dom-behavior.test.ts, and apps/oracle. The oracle compares separate React and signal implementations; it is a targeted differential check rather than proof of identical-source compatibility.

Historical benchmark results precede the latest ownership and lifecycle changes. Rerun performance measurements after correctness checks before drawing current performance conclusions.
