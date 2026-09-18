# Claim ledger

Use this ledger for the README and any external description of the project. Each
claim is limited to the linked evidence and to the source digest below. Passing a
finite corpus does not prove universal React compatibility, and nothing here
supports a performance claim.

## Verified for the stated scope

| Claim | Scope of the evidence | Safe wording |
| --- | --- | --- |
| A component body executes once per owned mount | Phase 6 target trace: 11 component instances, 11 `component-enter` events with no repeated instance id, 11 `component-dispose` | “In the audited application each of the eleven component instances executed once and was disposed.” |
| The compiled path uses no keyed reconciler | Zero `reconciler-enter` events in the Phase 6 and Phase 7 target traces; the production chunk is also checked for the symbol at build time | “The recorded paths apply known list operations directly and never enter the project reconciler.” |
| The issue application source is unchanged between targets | `App.tsx`, `IssueList.tsx`, `IssueForm.tsx`, `Stats.tsx`, `ThemeContext.tsx`, hashed in the report and compared across independent builds | “Those five application component files are byte-identical inputs to independent React and target builds.” |
| The issue workflow matches React 19.2 | 15 checkpoints recorded for each of the React and target runs and compared, `docs/PHASE6.md` | “The audited 15-checkpoint Chrome workflow matches React 19.2.” |
| List identity survives known operations | Bounded operation corpus, `docs/PHASE5.md` | “Known append, prepend, splice, move, reverse, sort, filter, map, truncate and clear operations preserve the tested identities without old/new key matching.” |
| Native SVG works in the tested single-module JSX tree | Bounded SVG corpus, `docs/PHASE7.md` | “The tested intrinsic SVG tree matches React namespaces, attributes, updates, events, identity and cleanup.” |
| Packages work outside workspace resolution | Fresh consumer installing local tarballs: ESM, public types, strict compilation, production bundle; each packed `dist/` equal to a fresh compile of its source; a Node process that ends by itself after a passive effect; `require()` and synchronous Babel with the plugin named | “A fresh temporary consumer installed local tarballs and passed ESM, public types, strict compilation and production bundling. Each package ships exactly what its source compiles to.” |
| Components written the way React documents them compile and run unmodified | Six components asserted in `apps/compat-audit/tests/q1-unmodified-react.test.ts`: state read as a value, props, `className`, `&&`, a controlled input with `onChange`, a style object, `.map()` over a fixed array, and `useRef` with `useEffect` | “Six components written in the style of React's documentation run unmodified, within the checked subset.” |
| `runOnce` is the default compiler path | `packages/babel-plugin/tests/transform.test.ts` asserts the default emits direct list operations and applies the runOnce diagnostics | “The compiler runs by default; `runOnce: false` selects the older path.” |

## Unsupported, and stated as such

| Claim | Status | Safe wording |
| --- | --- | --- |
| Arbitrary React source works | Open. Roadmap P4 | Do not claim this. Say “a checked compiler subset.” |
| The compiler infers arbitrary module contracts | Unsupported | “Manual exact-path contracts identify supported imports.” |
| Opaque replacement lists preserve keyed identity | Unsupported, Phase 5 blocker | “Opaque replacement arrays are rejected.” |
| Faster, smaller or lower-memory than React | Unverified for the current compiler path. Roadmap P8 | Make no numerical or comparative performance claim. |
| The published npm packages work in Node tooling | 0.2.0 keeps a Node process alive after `@rrjs/react-compat` or `@rrjs/renderer` is imported, and cannot be loaded with `require()` or named in a synchronous Babel configuration. 0.2.1 fixes both. 0.2.1 and 0.2.2 are published, and the release state below records the registry checks | “Use 0.2.1 or later.” Do not describe 0.2.0 as working in Jest, Node scripts or other CommonJS tooling. |

## Release state

**0.1.x (May 2026).** None of these contain the compiler: the plugin tarball has
no `runOnce` and no `run-once.js`. `@rrjs/renderer@0.1.7` also cannot be used at
all: it declares its siblings as `file:` paths, so the first import fails with
`Cannot find package '@rrjs/signals'`.

**0.2.0 (published 2026-09-17).** Verified on the registry: all four at 0.2.0 and
tagged `latest`, MIT, file counts 11, 75, 11 and 9, internal ranges `^0.2.0`, and
the `@rrjs/signals` shasum identical to the tarball tested locally. Installing
`@rrjs/renderer@0.2.0` alone into an empty directory now brings `signals` and
`react-compat` from the registry. With nothing but the published packages, an
ordinary React counter - state read as a value, a handler, a derived value and a
dependency-less `useEffect` - compiled with the plugin's defaults, rendered
`Clicked 0 times`, updated to `Clicked 1 times` with `doubled: 2`, and set the
document title from its effect.

Two defects were found the same way:

- Importing `@rrjs/react-compat` or `@rrjs/renderer` kept Node alive. Imported
  alone with an eight-second limit, `@rrjs/signals` exited in 135 ms and the other
  two never exited. The cause is a `MessageChannel` port created at import time in
  `dist/instance.js`. Browsers are unaffected.
- `require()` of any package failed with `ERR_PACKAGE_PATH_NOT_EXPORTED`, and
  `babel.transformSync` with the plugin named in configuration failed the same way
  while `transformAsync` worked. The `exports` map had only an `import` condition.

**0.2.1 (published 2026-09-17).** Fixes both. The consumer gate failed on the
original code with `keeps Node alive`, failed on a fix that only released the port
with `a passive effect ... never ran`, failed with only the scheduler fixed on
`ERR_PACKAGE_PATH_NOT_EXPORTED`, and passes with both fixes.

Verified on the registry the same day. All four are at 0.2.1 and tagged
`latest`, and npm records commit `285787a` as their `gitHead`. Each tarball
matches the registry's sha1 and sha512 and is byte-identical to a local pack of
that commit; the `react-compat` and `renderer` tarballs are also identical to the
ones inspected before publishing. Installed into an empty folder outside the
repository, where all 106 installed packages carry verified registry signatures:

- each package imported alone lets Node exit by itself;
- a passive effect scheduled at mount runs, and Node then exits by itself;
- `require()` of all four, and `babel.transformSync` with the plugin named in
  configuration, work;
- the README Quick Look, compiled from npm with the plugin's defaults, counts
  from 0 to 3;
- a counter with state, a derived value and `useEffect(fn, [count])`, its hooks
  imported from `@rrjs/react-compat`, shows the same button text, derived text
  and document title as React 19.3.0 at each of four steps. Its body ran once;
  React ran the same body four times.

The same checks against 0.2.0, installed the same way, hang on import and fail
`require()` with `ERR_PACKAGE_PATH_NOT_EXPORTED`.

`renderer` and `react-compat` were uploaded before `signals`, so for about two
minutes `@rrjs/renderer@0.2.1` could not resolve `@rrjs/signals@^0.2.1`. Publish in
dependency order: signals, react-compat, renderer, babel-plugin.

One defect was found the same way. Compiling each package's source again and
comparing it with the published `dist/` showed that `@rrjs/react-compat` and
`@rrjs/renderer`, in 0.2.0 and 0.2.1, ship `dist/react.js`, `dist/react.d.ts` and
their source maps: output of an uncommitted experiment that no committed source
produces. The `exports` map does not expose them and nothing imports them.

**0.2.2 (published 2026-09-18).** Every build empties `dist/` first, and the
consumer gate compares each packed `dist/` with a fresh compile of its source. No
runtime code changed. `prepublishOnly` passed 53, 111, 76 and 47 tests. The
published tree passed all eight gates at digest `16e6442079133d4d…`, in reports
`2026-09-18T09-05-34-028Z` to `2026-09-18T09-16-08-194Z`.

Verified on the registry the same day. All four are at 0.2.2 and tagged
`latest`, npm records commit `43663fd` as their `gitHead`, and each tarball
matches the registry's sha1 and sha512 and is byte-identical both to the tarball
verified before publishing and to a local pack of that commit. They hold 11, 71,
7 and 9 files, and each `dist/` equals a fresh compile of the source file for
file; the same comparison fails on 0.2.1's `react-compat` and `renderer` with
the four stray files. They were uploaded in dependency order. npm now accepts an
upload and processes it asynchronously, so each version appeared on the registry
a few minutes after its upload was accepted.

Installed into an empty folder, where all 106 installed packages carry verified
registry signatures, 0.2.2 passes every check listed for 0.2.1 above, including
the counter matching React 19.3.0 at each of four steps with its body executed
once. On that first run in the new folder the lifetime script took 28.9 s before
exiting by itself with its effect run, longer than the 20 s limit the gate used
before 0.2.2.

## Differences from React that must be stated, not omitted

| Behaviour | Difference | Evidence |
| --- | --- | --- |
| `useEffect(fn)` with no dependency array | Re-runs when a value the callback reads changes, not after every render. A callback reading nothing reactive runs once; React reaches `"xx"` where this reaches `"x"` | `apps/compat-audit/tests/effect-inferred-deps.test.ts`, which asserts both sides |
| `count()` on a non-callable state value | Rejected at build time rather than failing on first interaction | `apps/compat-audit/tests/runonce-constructs.test.ts` |
| `useTransition`, `useDeferredValue`, `useInsertionEffect` | Present but do not implement React scheduling | `docs/COMPAT.md` |
| `useMemo` and `useCallback` dependency arrays | Ignored; dependencies come from the expression's reads. `useMemo(() => n * 10, [])` freezes in React and stays live here | `apps/compat-audit/tests/react-pattern-corpus.test.ts`, which measures both sides |

## Current evidence

Source digest `6d923f920977b447fa8a93873319791d1b0a674a092891caedc4eea62fba85d0`,
covering the 127 hashed source files: version 0.2.2 plus the unreleased JSX text
fix in the changelog. All eight gates pass at that digest in Chrome
153.0.8010.48, in one uninterrupted run with each report starting after the
previous one finished:

| Gate | Steps | Report under `.private/acceptance/` |
| --- | --- | --- |
| Phase 0 | 10 | `2026-09-18T10-31-58-080Z` |
| Phase 1 | 10 | `2026-09-18T10-33-01-443Z` |
| Phase 2 | 10 | `2026-09-18T10-34-12-467Z` |
| Phase 3 | 10 | `2026-09-18T10-35-21-421Z` |
| Phase 4 | 10 | `2026-09-18T10-36-32-942Z` |
| Phase 5 | 10 | `2026-09-18T10-37-38-808Z` |
| Phase 6 | 15 | `2026-09-18T10-38-41-502Z` |
| Phase 7 | 18 | `2026-09-18T10-40-16-609Z` |

The Phase 6 target trace records eleven component instances, each entering once
with no repeated instance id, eleven disposals, no reconciler entry, and fifteen
checkpoints on both the React and target runs.

Every phase runs the manifest's 21 negative controls, each a deliberate violation
the gates must catch. Eight cover the release checks: a stale, missing or changed
`dist/` file, a changed source map, a process held open after finishing, a slow
start, a dropped passive effect and a failing exit code.

The external-consumer step inside those runs packs the four 0.2.2 tarballs and
installs them into a fresh consumer. Besides ESM imports, public types, strict
compilation and a production bundle, it compiles each package's source afresh and
requires the packed `dist/` to match it file for file; runs a script with no
forced exit that must reach its last line and then end on its own after a
passive effect has run; and loads all four packages through `require()` with the
plugin compiled by name through synchronous Babel. In the two reports that run
it, the lifetime script exited by itself after 543 ms and 613 ms.

Suites at that digest: 288 package tests across 4 packages and 175 integration
tests across 19 files, with no failures and no skips. Every test asserts a
result; the repository contains no `expect(true)`, `.skip` or `.only`. That makes
a passing run evidence for the cases it covers and for nothing beyond them.

`apps/compat-audit/tests/react-pattern-corpus.test.ts` asserts twenty ordinary
React patterns on the default path — state, updaters, fragments, nested and
defaulted props, ternaries, object and array state, boolean and numeric style
attributes, event arguments, context, `useMemo`, `useCallback` and `useReducer`
— and none is refused. Where behaviour differs from React the reference runs in
the same test. Twenty patterns is a corpus, not a proof of P4.

Re-run the gates after any change to a hashed source file. Reports do not
certify code they did not run against, and the harness refuses to certify a tree
that changed mid-run.
