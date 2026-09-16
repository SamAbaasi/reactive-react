# Reactivity boundary

A changing value must be read from a signal inside a tracked computation to update a binding. The compiler currently wraps JSX expressions; it does not rewrite ordinary React state semantics.

## Current observations

| Pattern | Result |
| --- | --- |
| Direct getter child or native attribute | Renderer unwraps and tracks the getter. |
| Getter call or formatting helper in JSX | Tracks signal reads and updates after changes. |
| Comparison or template interpolation using an uncalled getter | Compares/stringifies a function; incorrect values. |
| Ordinary local derived from a getter call | Snapshot from initial component execution. |
| Effect dependencies containing getter or getter result | Evaluated once; do not cause reruns. |
| Reactive child returning nested arrays of nodes/text | Renders as nodes/text and updates the region. |
| Array assigned to a local before JSX | Renders its nodes; the local itself is not recomputed. |
| Simple keyed map with one item argument | Optimized through list() and object-row proxies. |
| Map with local statements or index/source parameters | Native map evaluation inside a reactive binding; updates recreate rows. |
| Provider and eager component children | Provider value may not reach the consumer. |
| Arbitrary component props | Getter pass-through can work; general React prop reactivity is not established. |

## Lifetime and scheduling

Renderer-created attribute, text, and list effects are disposed during unmount.
General computed/effect ownership remains incomplete. Derived signals settle
before observable effects, including the asymmetric-diamond regression.

## Evidence limits

The compatibility audit records results from executable probes. Some older tests
only assert that a probe ran; read their observations rather than treating a
passing total as support for every construct. The new reactive-expressions suite
asserts output before and after interactions. Renderer and signals regressions
assert disposal, lifecycle, DOM, and scheduling behavior explicitly.

See [COMPAT.md](./COMPAT.md) and [DEFECTS.md](./DEFECTS.md) for scope and next steps.
