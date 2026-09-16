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
| Packages work outside workspace resolution | Fresh consumer installing local tarballs: ESM, public types, strict compilation, production bundle | “A fresh temporary consumer installed local tarballs and passed ESM, public types, strict compilation and production bundling.” |
| Components written the way React documents them compile and run unmodified | Six components asserted in `apps/compat-audit/tests/q1-unmodified-react.test.ts`: state read as a value, props, `className`, `&&`, a controlled input with `onChange`, a style object, `.map()` over a fixed array, and `useRef` with `useEffect` | “Six components written in the style of React's documentation run unmodified, within the checked subset.” |
| `runOnce` is the default compiler path | `packages/babel-plugin/tests/transform.test.ts` asserts the default emits direct list operations and applies the runOnce diagnostics | “The compiler runs by default; `runOnce: false` selects the older path.” |

## Unsupported, and stated as such

| Claim | Status | Safe wording |
| --- | --- | --- |
| Arbitrary React source works | Open. Roadmap P4 | Do not claim this. Say “a checked compiler subset.” |
| The compiler infers arbitrary module contracts | Unsupported | “Manual exact-path contracts identify supported imports.” |
| Opaque replacement lists preserve keyed identity | Unsupported, Phase 5 blocker | “Opaque replacement arrays are rejected.” |
| Faster, smaller or lower-memory than React | Unverified for the current compiler path. Roadmap P8 | Make no numerical or comparative performance claim. |
| The packages are installable from npm | Not published. Only local tarballs are verified | “Four packages, verified against a fresh local consumer.” |

## Differences from React that must be stated, not omitted

| Behaviour | Difference | Evidence |
| --- | --- | --- |
| `useEffect(fn)` with no dependency array | Re-runs when a value the callback reads changes, not after every render. A callback reading nothing reactive runs once; React reaches `"xx"` where this reaches `"x"` | `apps/compat-audit/tests/effect-inferred-deps.test.ts`, which asserts both sides |
| `count()` on a non-callable state value | Rejected at build time rather than failing on first interaction | `apps/compat-audit/tests/runonce-constructs.test.ts` |
| `useTransition`, `useDeferredValue`, `useInsertionEffect` | Present but do not implement React scheduling | `docs/COMPAT.md` |

## Current evidence

Source digest `f4ec3239ef298d44fbba82ea5bc5b16d80f5d7e3d01584c7447fbdae032d9084`,
covering the 123 hashed source files. All three gates pass at that digest in
Chrome 152.0.7977.83:

- Phase 5 — `.private/acceptance/2026-09-16T11-25-01-535Z/report.json`, 10 steps;
- Phase 6 — `.private/acceptance/2026-09-16T11-26-12-633Z/report.json`, 15 steps;
- Phase 7 — `.private/acceptance/2026-09-16T11-28-22-319Z/report.json`, 18 steps.

Suites at that digest: 287 package tests across 4 packages and 153 integration
tests across 17 files, with no failures and no skips. Every test asserts a result; the repository contains no
`expect(true)`, `.skip` or `.only`. That makes a passing run evidence for the
cases it covers and for nothing beyond them.

Re-run `npm run verify:phase5`, `verify:phase6` and `verify:phase7` after any
change to a hashed source file. Reports do not certify code they did not run
against, and the harness refuses to certify a tree that changed mid-run.
