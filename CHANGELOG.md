# Changelog

## Unreleased

- `useReducer`, `useMemo` and `useCallback` imported from `react` (or
  `@rrjs/react-compat`) were refused by the run-once compiler as unsupported hooks.
  Their call sites are rewritten before the import check, which read stale bindings.
  The check now refreshes them; ordinary imports of these hooks compile.
- The renderer detached every descendant of an unmounted subtree individually, one
  live DOM mutation per node; only the subtree root is detached now. After every keyed
  reconcile, `list()` re-committed every row; it now commits only rows it created.
  In js-framework-benchmark, swap rows went from 41.2 ms to 26.7 ms and remove one row
  from 26.4 ms to 19.3 ms.
- New benchmark results for the engine against React 19.2 on the official
  js-framework-benchmark harness replace the withdrawn v0.1 figures. See
  `docs/BENCHMARKS.md`.
- JSX text now comes out the way React's JSX transform leaves it. The compiler
  emitted each text child verbatim, so `{name} theme` followed by a line break
  and indentation kept both: the issue app's theme button read
  `"Light theme\n        "` where React reads `"Light theme"`. Whitespace that
  touches a line break is now dropped and lines are joined with one space, using
  Babel's own `react.buildChildren`, on both compiler paths. The page looked the
  same because CSS collapses the whitespace, but `textContent`, text under
  `white-space: pre` and any exact text comparison did not.
  `apps/compat-audit/tests/jsx-text.test.ts` compares every text node with
  React 19.2. The helper the other suites use collapses whitespace, which is why
  none of them caught it.
- `apps/flip` gains `dev:run-once-reference`, React's side of the `RunOnce.tsx`
  fixture, so the execution counter can be compared side by side.

## 0.2.2

Found by checking 0.2.1 as the registry serves it: each package's source was
compiled again and compared, file by file, with the published `dist/`. No runtime
code changed.

- `@rrjs/react-compat` and `@rrjs/renderer` 0.2.0 and 0.2.1 shipped four files
  that no committed source produces: `dist/react.js`, `dist/react.d.ts` and their
  source maps, output of an uncommitted compatibility-mode experiment. `tsc` never
  deletes output whose source has gone, and each package publishes `dist/` whole.
  Nothing imported the files and the package `exports` did not expose them, but
  the renderer's copy describes a mode that reconciles and re-executes
  components, which this package does not do. `npm run build` and
  `scripts/build-all.mjs` now empty `dist/` first.
- The consumer gate compiles each package's source afresh and requires the packed
  `dist/` to hold the same files with the same content; source maps may differ
  only in the path from the map to its source. A stray, missing or changed file
  and a changed source map each fail it.
- The gate's lifetime check used one timeout for starting, finishing and exiting,
  so a slow start would have been reported as a package keeping Node alive. The
  check now records each stage in a file and times the two separately: a script
  that never reaches its last line is reported as not checked, and one that
  reaches it and stays running as keeping Node alive.
- The npm descriptions of `@rrjs/renderer` and `@rrjs/babel-plugin` described the
  older compiler path; they now match the package READMEs. The repository URL
  uses npm's normalised `git+https` form, which removes the publish warning.

Internal dependency ranges are `^0.2.2`.

## 0.2.1

Two defects found by installing 0.2.0 from npm into an empty directory, after it
was published.

- Importing `@rrjs/react-compat`, or `@rrjs/renderer` which depends on it, kept
  Node running forever. The passive-effect scheduler created a `MessageChannel`
  at import time, and a port with a listener holds Node's event loop open. The
  port is now held only while a flush is waiting, so a Node process ends on its
  own and an effect scheduled just before the end still runs. Browsers are
  unaffected, and delivery still uses the same channel, so effect timing does not
  change. The consumer gate now runs a script with no forced exit and checks both
  that it ends and that the effect ran; a fix that only released the port drops
  the effect, and that variant was confirmed to fail it.
- The packages could not be loaded with `require()`, and the Babel plugin could
  not be named in a configuration used by a synchronous Babel call - `babel-jest`,
  `@babel/register` and Metro among them - which failed with
  `ERR_PACKAGE_PATH_NOT_EXPORTED`. Each package's `exports` now carries a
  `default` condition. `require()` of these ES modules relies on Node's own
  support for it, which Node documents as available without flags from 20.19 and
  22.12; it is verified here on Node 24.13.1.

Internal dependency ranges are `^0.2.1`, so installing the renderer brings the
fixed scheduler with it.

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
