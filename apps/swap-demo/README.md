# swap-demo — React 19 vs Reactive React, side by side

One page, two panes, one 1,000-row table each. A single button swaps rows 2 and 999
in both. This is the `swap_rows` result from `docs/BENCHMARKS.md`, made watchable.

```bash
npm run install:all      # from the repo root, once
npm run build:all        # required — the apps import the packages' compiled dist
npm run dev --prefix apps/swap-demo
```

## What is measured

**Total interaction latency.** The clock starts when the swap function is called and
stops in the first task after a frame in which the DOM actually shows the swap.

Completion is confirmed by **reading the DOM back** — checking that the id in row 2 and
the id in row 999 have exchanged places — not by trusting the framework to have
finished. This matters. React's scheduler can defer rendering into a later task, so the
common "call setState, wait one `requestAnimationFrame`, stop the clock" approach can
stop before React has painted and report React as faster than it is. The check is
identical for both panes and framework-agnostic; neither side gets a special hook.

**The script/paint split, when and only when the browser reports one.** The page listens
for [Long Animation Frame](https://developer.chrome.com/docs/web-platform/long-animation-frames)
entries and derives script time from `renderStart - startTime` and style+paint from the
remainder. These numbers come from the browser, not from us.

## What is *not* measured

**A script/paint split for fast work.** LoAF only reports frames longer than ~50 ms. The
Reactive React pane's swap is normally faster than that, so the browser reports no entry
and the pane says *"no long frame (<50 ms)"*. That is the honest output. No split is
invented, estimated, or interpolated for it. If you need a split for the fast side, that
requires a CDP trace, not an in-page harness.

**Anything to sub-frame precision.** Totals are frame-granular. Under CPU throttling
frames are long, so treat small differences as nothing. In a 15-run sample on an
unthrottled machine the React pane's own run-to-run spread was **±79%** and the Reactive
React pane's **±42%** — larger than many of the differences reported elsewhere in the
docs. Use the median, and do not read anything into a single run.

**CPU throttling.** A page cannot throttle itself. Set 4× slowdown in DevTools →
Performance → CPU. The **CPU calibration** button runs a fixed workload so the recording
can state the factor actually in effect rather than asserting it in a caption: click it
once unthrottled to set a baseline, then again with throttling on.

## Fairness constraints, and where they are imperfect

Both panes share one dataset generator with a **seeded PRNG**, so both get byte-identical
labels — label length changes text-measurement cost, which is part of what is being timed.
Both panes get their own copy of the array. Both use the same stylesheet; the `.test-data`
rules are applied to both tables.

The row markup is the same JSX in both files. The only intended difference is reading
`rows` / `selected` as plain values in React and calling them as signals in Reactive
React — which is exactly the `count` → `count()` break documented in `docs/COMPAT.md`.

**The panes are swapped one after the other, never simultaneously.** They share a main
thread; running both at once would have each pane's work inflate the other's number. You
still see React stall and the signals pane snap, just in sequence.

**React is not wrapped in `StrictMode`,** which would double-invoke render in development
and make React do twice the work.

### Two real differences in the emitted DOM

Click **Compare DOM** to see these live — they are shown rather than hidden, because they
are the demo's own caveats:

| | React 19 | Reactive React |
|---|---|---|
| `<tr>` `class` attribute | `class=""` (present, empty) | absent |
| `<tr>` `key` attribute | absent (React consumes it) | **`key="1"` — leaks into the DOM** |

Every `<td>` is byte-identical between the two renderers. The differences are confined to
the `<tr>`.

The `key` leak is a **Reactive React bug**, not a demo artefact: `@rrjs/renderer`'s
`createElement` has no special case for `key`, so the list key is written to the DOM as a
real attribute on every row. It costs one extra `setAttribute` per row on creation and one
extra attribute's worth of memory per row. It is left unfixed here on purpose — fixing the
library is a separate change that has to go through the optimisation loop.

Click **Compare layout** to diff 32 resolved layout properties plus box geometry
recursively through the row. As of this writing it reports **zero differences**, which is
evidence against the guess in `docs/BENCHMARKS.md` that "React's `<td>` elements have
different layout characteristics". Note the caveat: this page uses its own stylesheet, not
the benchmark's Bootstrap CSS, so the comparison needs repeating in the benchmark's own
context before that guess can be called dead.

## Files

| file | what it is |
|---|---|
| `src/data.ts` | seeded dataset shared by both panes |
| `src/measure.ts` | the harness — LoAF observation, DOM-confirmed completion, median/spread |
| `src/react-pane.react.tsx` | React 19 pane |
| `src/rr-pane.rr.tsx` | Reactive React pane |
| `src/dom-compare.ts` | structure, computed-style and box-geometry diffing |
| `src/main.ts` | orchestration and readout |

`vite.config.ts` runs two JSX pipelines in one page: `*.rr.tsx` goes through
`@rrjs/babel-plugin` (JSX → `h()`/`list()`), everything else goes through esbuild's
automatic runtime (JSX → `react/jsx-runtime`). Because Babel removes all JSX from the
`.rr.tsx` files first, esbuild's React setting is a no-op for them.
