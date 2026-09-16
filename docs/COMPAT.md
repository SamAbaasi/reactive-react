# Compatibility

Reactive React currently provides a signal runtime, a DOM renderer, React-shaped hooks, and a JSX compiler. It is not yet a drop-in replacement for React.

Components execute once per mount. State and memo hooks return getters. The compiler wraps dynamic JSX expressions in functions; it does not convert ordinary React state reads throughout a component into reactive computations.

## Regression coverage

- Getter children, getter calls, and helper calls reading signals update their DOM bindings.
- Conditional bindings remove and reinsert nodes in the correct position. Reactive child arrays support nested arrays, text, and nodes.
- Keyed object rows preserve identity and update reactive property reads, including content changes during append.
- Renderer-created bindings are disposed when their owning nodes are unmounted.
- Layout effects run after insertion. Shared roots and fragment returns retain lifecycle ownership; queued passive effects are cancelled on unmount.
- Input value and checked bindings update live properties. onDoubleClick uses the native dblclick event.

These are targeted guarantees, not complete React lifecycle or DOM compatibility. See [DEFECTS.md](./DEFECTS.md) for test locations and remaining work.

## Compatibility gaps

| Construct | Current limitation |
| --- | --- |
| Ordinary state values | Arithmetic, array methods, and comparisons operate on a getter rather than a value. |
| Derived locals and early returns | Evaluated once; adding getter calls alone does not make component control flow reactive. |
| Effect dependencies | Arrays are evaluated once. Neither [value] nor [value()] makes them update. |
| Context | Eager child construction can run consumers before their provider is active. |
| Event closures | Live getter reads do not establish React render-snapshot semantics. |
| Lists | Primitive replacement, reactive indices, and arbitrary map callbacks need further support. |
| Types | Getter-returning hooks differ from React value-returning signatures. |
| Ownership | Renderer bindings have disposal; general computed/effect ownership is incomplete. |

useTransition runs synchronously with no pending state. useDeferredValue returns its input. useInsertionEffect uses layout-effect behavior. These do not implement React scheduling. SSR, hydration, class components, Suspense, and arbitrary third-party React library compatibility are not established.

## Verification

Run node scripts/build-all.mjs and node scripts/test-all.mjs from the root. Run npm test --prefix apps/compat-audit for compiler/runtime probes and npm run oracle --prefix apps/oracle for differential DOM sequences against React.

Some older audit tests report observations without asserting correct behavior. Passing those tests is not evidence of compatibility. The oracle uses separate React and signal implementations and normalizes empty text anchors; it does not prove identical-source compatibility or equality of every observable DOM property.

The next milestone is the unchanged apps/flip application passing the same interactions on both targets. Its signal target does not yet meet that milestone. Build success alone is insufficient.
