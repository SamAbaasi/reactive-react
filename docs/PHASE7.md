# Phase 7: native SVG compatibility slice

Status: verified for the bounded, single-module SVG corpus described here. This
does not establish general SVG or React compatibility.

## Scope

The compiler now records namespace context for intrinsic JSX in one visible JSX
tree. The renderer creates marked elements with `document.createElementNS` and
returns descendants of `foreignObject` to the HTML namespace. The accepted corpus
covers `svg`, `g`, `circle`, `text`, `use`, `foreignObject` and an HTML `div`;
`viewBox`, `className`, numeric attributes, `strokeWidth`, `href`, `xlinkHref`,
text, an SVG click handler, reactive attribute updates and a conditional child.

The namespace marker is compiler/runtime metadata and is never emitted as a DOM
attribute. SVG `className` is written as `class`, `strokeWidth` as
`stroke-width`, and `xlinkHref` through the XLink namespace.

The compiler rejects an SVG-only intrinsic without a visible in-module `svg`
ancestor. It also rejects a component child directly under SVG because namespace
context does not yet cross component boundaries. JSX namespace syntax such as
`<svg:path>` and the broader SVG attribute/event surface remain unsupported.

## Regression and browser evidence

Before the repair, the differential regression found target descendants in the
HTML namespace, so SVG queries and namespace assertions failed. A standalone
`circle` also compiled silently without a namespace source. Both behaviors now
have regressions, and a deliberate wrong-namespace acceptance control fails.

Identical `SvgPhase7.tsx` source is compiled independently for React 19.2 and the
strict target. Chrome records five matching checkpoints: initial state, a button
update, an SVG event update, conditional removal, and conditional restoration.
The gate checks namespace URIs, attributes, text, stable `svg`/`circle`/embedded
HTML identity, one target component execution, zero reconciler entries, complete
disposal and no work after an event on the detached circle.

Current verification:

- command: `npm.cmd run verify:phase7`;
- report: `.private/acceptance/2026-09-13T21-57-26-335Z/report.json`;
- status: PASS across 18 steps;
- source digest: `74a16ccfed2807d0f2b6633ae2db19f9f513958ea393d6f739d47c9e2074371b`;
- package tests: 278 passed, zero failures or skips;
- integration tests: 122 passed across 14 files;
- browser: Chrome `152.0.7977.83`, five matching SVG checkpoints;
- target SVG fixture JS hash:
  `5e053e5871a466f122502d24ee7c128e53aca5f91560988b153c786529bc5df9`;
- React SVG fixture JS hash:
  `d06e1b6113aa0365d13bd66eef966835cd572a288467d951c54390d8f016064c`;
- fresh-consumer JS hash:
  `167af9c2efd18a5ed9d0cfe5f1aa31e78cdf167be3c929d149dd2610527c428b`.

The gate also reruns all Phase 6, Node ESM and fresh local-tarball consumer checks.
No package was published. The final-source Phase 5 and Phase 6 reports are
`.private/acceptance/2026-09-13T21-59-21-885Z/report.json` and
`.private/acceptance/2026-09-13T22-00-27-975Z/report.json`; both share the digest
above.

## Limits and next step

Namespace inference is syntactic and local to one compiled JSX tree. It does not
carry through components, precompiled children, portals or arbitrary factories.
Only the listed attribute aliases have dedicated handling. Namespaced JSX, broad
SVG DOM/property parity, SVG-specific event differences, SSR, hydration and
concurrent behavior are outside this evidence.

The next bounded Phase 7 slice is portals. It is in progress and not yet
verified; see [ROADMAP.md](./ROADMAP.md) for the Phase 7 scope and exit evidence.
