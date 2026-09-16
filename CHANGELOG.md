# Changelog

## 0.2.0

Breaking. `runOnce` is now the compiler's default; the older reactive-wrapping
path is selected with `runOnce: false`. Component source that relied on the old
default has to pick the option explicitly or move to ordinary React spelling.

### Fixed before anything else

- `@rrjs/renderer@0.1.7` declared `@rrjs/signals` and `@rrjs/react-compat` as
  `file:` paths, so installing it from npm produced `Cannot find package
  '@rrjs/signals'` on the first import. Internal dependencies are now published
  ranges, and `scripts/verify-external-consumer.mjs` refuses to pack a manifest
  with a workspace specifier. Installing the four tarballs together had hidden
  this, which is why it reached the registry.
- `style={{ width: 10 }}` applied nothing: the DOM drops a unitless length.
  Numbers now carry `px` except on the properties React leaves bare, matched
  against React 19.2 across eighteen properties.

### Packaging

- Each package now ships the MIT `LICENSE` text it declares. None did before, and
  `@rrjs/babel-plugin` had no `license` field, which npm shows as unlicensed.

### Compiler

- `runOnce` is the default.
- `function C(props)` with `props.x` reads is accepted, normalised to the
  destructured form. A `props` object that escapes is still refused.
- Context provider values accept object and array literals built from scalars
  and bindings the component owns.
- A named list binding used once as a JSX child keeps its direct list operations.
- Fixed arrays declared inside a component render their rows directly.
- `useEffect(fn)` without a dependency array infers the list from the callback's
  reads. It therefore runs once when the callback reads nothing reactive, where
  React re-runs after every render.
- `useMemo` and `useCallback` unwrap to what they wrap, since the body runs once.
  Their dependency arrays are ignored, so a list that understates its reads stays
  live here and freezes in React.
- `useReducer` rewrites to `useState` with a functional updater, preserving
  React's queued dispatch order and the lazy third argument.
- `count()` on a non-callable state value is a build error naming the binding,
  instead of a `TypeError` on the first interaction.
- `useEffect` and `useMemo`/`useCallback` reject a surplus argument.

### Evidence

- Phases 0 through 7 pass in Chrome 152.0.7977.83 at one source digest.
- 287 package tests and 174 integration tests, no failures and no skips.
- Observational tests are gone: the repository contains no `expect(true)`,
  `.skip` or `.only`, so the counts mean what they say.
- `apps/compat-audit/tests/react-pattern-corpus.test.ts` asserts twenty ordinary
  React patterns, running the React reference in the same test wherever the
  behaviour differs.

## Unreleased

### Runtime

- Settle derived signal values before observable effects and cancel queued disposed subscriptions.
- Preserve reactive child positions across conditional removal, replacement, and reinsertion.
- Render nested child arrays and normalize component fragment/text-array returns.
- Dispose renderer-created bindings during unmount and keyed-row removal.
- Deliver layout effects after DOM insertion and preserve shared-root lifecycle ownership.
- Update retained object rows, including during append operations.
- Map onDoubleClick to dblclick and update live input value/checked properties.

### Compiler and packaging

- Track getter/helper calls used as JSX children.
- Preserve map callback statements and index/source parameters by retaining native map execution when the keyed optimization cannot represent them.
- Inject required runtime imports with configurable importSource and classic-runtime support.
- Emit Node-resolvable ESM imports and package exports.
- Select the signal example entry before Vite resolves the production module graph.

### Compatibility

These changes do not provide general drop-in React compatibility. Ordinary state values, derived control flow, effect dependencies, context, type signatures, and broader DOM semantics still need work. See docs/COMPAT.md and docs/DEFECTS.md.

The working package versions are renderer 0.1.8, babel-plugin 0.1.2, react-compat 0.1.1, and signals 0.1.3. This work has not been published.
