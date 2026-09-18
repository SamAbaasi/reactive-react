# flip

One issue-tracker application, compiled twice: once by React and once by this
project's compiler, from the same component files.

`src/App.tsx`, `IssueList.tsx`, `IssueForm.tsx`, `Stats.tsx` and
`ThemeContext.tsx` are ordinary React. No target-specific version of them exists,
and the acceptance gate checks their hashes are byte-identical inputs to both
builds, so a difference in behaviour is a difference in the compiler rather than
in the source.

## Running it

```bash
npm install
npm run dev:phase6     # the compiler, http://localhost:5213
npm run dev:react      # React 19.2, http://localhost:5210
```

Open both and use them side by side: toggle an issue, reorder rows, switch
theme, add one from the New form, watch the tab title count change.

To see the component body run once, use the smaller `RunOnce.tsx` fixture, which
prints how many times its body has executed:

```bash
npm run dev:run-once              # the compiler, http://localhost:5212
npm run dev:run-once-reference    # React 19.2, http://localhost:5214
```

Click Increment on both. The count and the doubled value move together; React's
execution count rises with every update, and the compiled build's stays at 1.
"Two updates from one snapshot" adds one on both, as React's snapshot semantics
require.

`npm run dev:rrjs` serves the same application through the older `runOnce: false`
path. It renders the shell and then fails with
`TypeError: issues.filter is not a function`, because state there is a getter and
the component reads it as a value. That is the difference the default path
closes, and `apps/compat-audit/tests/q11-flip-constructs.test.ts` asserts each
construct behind it.

## Builds used by the gates

| Script | Purpose |
| --- | --- |
| `build:phase6` | the compiler build the Phase 6 browser gate drives |
| `build:react` | the React build it is compared against |
| `build:phase7` / `build:phase7:react` | the SVG and portal slice |
| `build:run-once` | the smaller `RunOnce.tsx` fixture |

The gates themselves are `npm run verify:phase6` and `verify:phase7` from the
repository root. They build both targets, drive Chrome through a fixed
checkpoint list, compare the results and assert the architecture invariants:
one execution per component instance, no reconciler entry, and complete disposal
on unmount.
