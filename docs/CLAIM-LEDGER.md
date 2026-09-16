# Claim ledger

Use this ledger for the README and any external description of the project. Each claim is limited to the
linked evidence and current source digest. Passing a finite corpus does not prove
universal React compatibility.

| Claim | Status | Evidence | Safe wording |
| --- | --- | --- | --- |
| A target component body executes once per owned mount | Verified for recorded corpora | Phase 5/6 reports, component traces | “In the tested compiler subset, each target component instance executed once.” |
| The strict target uses no keyed reconciler | Verified for recorded production paths | Generated/runtime audit, zero `reconciler-enter` events | “The recorded target paths apply known list operations directly and never enter the project reconciler.” |
| The issue application source is unchanged between targets | Verified for five component files | Independent manifests and on-disk SHA-256 checks | “Five application component files are byte-identical inputs to independent React and target builds.” |
| The issue workflow matches React 19.2 | Verified for 15 checkpoints | `docs/PHASE6.md` | “The audited 15-checkpoint Chrome workflow matches React 19.2.” |
| List identity survives known operations | Verified for bounded operation corpus | `docs/PHASE5.md` | “Known append, prepend, splice, move, reverse, sort, filter, map, truncate and clear operations preserve the tested identities without old/new key matching.” |
| Packages work outside workspace resolution | Verified for local tarballs | Phase 6 `external-consumer.log` | “A fresh temporary consumer installed local tarballs and passed ESM, public types, strict compilation and production bundling.” |
| Native SVG works in the tested single-module JSX tree | Verified for bounded SVG corpus | `docs/PHASE7.md` | “The tested intrinsic SVG tree matches React namespaces, attributes, updates, events, identity and cleanup.” |
| Arbitrary React source works | Open/unsupported generally | Roadmap P4 | Do not claim this. Say “checked compiler subset.” |
| The compiler infers arbitrary module contracts | Unsupported | Manual manifest boundary | Say “manual exact-path contracts identify supported imports.” |
| Opaque replacement lists preserve keyed identity | Unsupported | Phase 5 blocker | Say “opaque replacement arrays are rejected.” |
| Faster/smaller/lower-memory than React | Unverified for current compiler path | Phase 8 open | Do not make numerical or comparative performance claims yet. |

Current evidence source digest:
`74a16ccfed2807d0f2b6633ae2db19f9f513958ea393d6f739d47c9e2074371b`.
The current Phase 7 report is
`.private/acceptance/2026-09-13T21-57-26-335Z/report.json`.
