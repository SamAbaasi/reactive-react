# Benchmarks

Reactive React's performance measured against React 19.2.0 using the official [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark) Chrome harness.

These numbers are **directly comparable** — both Reactive React and React 19 were run on the same hardware, in the same Chrome session, with identical 4× CPU throttling, by the same benchmark adapter pattern.

---

## Methodology

- **Test suite**: official `js-framework-benchmark` Chrome harness with CDP-based timing
- **CPU throttling**: 4× (standard for this benchmark)
- **Iterations**: 15 per test, median reported
- **Hardware**: Lenovo laptop, Intel CPU, Windows 11
- **Browser**: Chrome (latest stable)
- **React version compared**: React 19.2.0 keyed hooks adapter
- **Reactive React version**: v0.1.0 with all v0.1 optimizations applied

These are not comparisons against the public leaderboard's reference hardware. They are direct head-to-head comparisons on consumer hardware where both frameworks were measured with the same throttling and harness. Library users on similar consumer hardware should see comparable relative performance.

The Reactive React adapter uses per-row signals for label updates — the fastest pattern the library supports. A future "idiomatic" adapter using plain immutable updates will also be published; expect those numbers to be 1.5-2× slower on `update_10th`.

---

## CPU Tests — Direct Comparison

| Test | Reactive React | React 19.2.0 | Verdict |
|------|----------------|--------------|---------|
| Create 1,000 rows | 75 ms | 66 ms | React faster by 14% |
| Replace 1,000 rows | 83 ms | 76 ms | React faster by 9% |
| Update every 10th row | 59 ms | 54 ms | React faster by 9% |
| Select row | **16 ms** | 20 ms | **Reactive React faster by 20%** |
| Swap rows | **78 ms** | 419 ms | **Reactive React faster by 5.4×** ★ |
| Remove one row | 55 ms | 39 ms | React faster by 41% |
| Create 10,000 rows | 1545 ms | 1235 ms | React faster by 25% |
| Append 1,000 rows | 84 ms | 74 ms | React faster by 13% |
| Clear | **49 ms** | 52 ms | **Reactive React faster by 6%** |

**Summary: Reactive React wins on 3 tests, loses on 6. The swap_rows win is the largest single performance gap in either direction.**

---

## Bundle Size

| Metric | Reactive React | React + ReactDOM | Ratio |
|--------|----------------|------------------|-------|
| Uncompressed | **16.1 kB** | ~140 kB | **8.7× smaller** |
| Compressed (gzip) | **4.2 kB** | ~46 kB | **11× smaller** |

This is the largest practical advantage. Smaller bundles mean faster downloads, faster parse times, and lower data costs on mobile networks.

---

## Memory

| Metric | Reactive React | React 19 | Ratio |
|--------|----------------|----------|-------|
| Ready (no rows) | **0.59 MB** | ~1.2 MB | 51% less |
| After 1k rows | **3.5 MB** | ~5.5 MB | 36% less |
| After clear of 1k rows | 13.7 MB | ~14 MB | comparable |

---

## Startup

| Metric | Reactive React | React 19 |
|--------|----------------|----------|
| First paint | **155 ms** | ~280 ms |
| **Improvement** | | **45% faster** |

---

## Honest Analysis

### Where Reactive React Wins

**Swap rows is the headline result.** React 19 takes 419 ms to swap two rows in a 1000-row table on consumer hardware. Reactive React does it in 78 ms — a **5.4× improvement**. This matters for real applications that reorder lists, support drag-and-drop, or animate table sorts.

The win comes from Reactive React's keyed list reconciliation. When two rows swap, only those two nodes are moved in the DOM. React's reconciler must walk the entire child set and apply the new order; the LIS-based algorithm in `@rrjs/renderer` identifies the minimal set of DOM mutations.

**Bundle size, memory, and first paint are dominant wins** that derive from the architectural choice to skip the virtual DOM. No diff algorithm, no fiber tree, no scheduler. Bundle is 11× smaller, memory is roughly 36% lower, first paint is 45% faster.

**Select row and clear** show the signal architecture working as designed. Targeted updates touch only the bindings that read the changed signal. There's no global re-render to trigger downstream comparisons.

### Where Reactive React Trails

**Creation-heavy operations** (create_1k, replace_1k, create_10k, append_1k) trail React by 9-25%. The gap is paint-bound — your JavaScript creates 1,000 DOM nodes, the browser paints them, and there's no JavaScript-side optimization that reduces the paint cost.

The script time on these tests is competitive (often faster than React). The paint is what's expensive, and CSS-level optimization tools like `contain` have limited effectiveness for `<table>` layout where columns must coordinate.

**Remove one row** is the largest remaining gap (41%). Like creation, it's paint-bound — the browser relays out the entire table when one row is removed.

These gaps are architectural in nature. Closing them requires either:
- Virtualization (rendering fewer DOM nodes, not all 1,000) — out of scope for the benchmark
- Compile-time static binding analysis in the Babel plugin to reduce per-row effect overhead — planned for v0.2

---

## Test-by-Test Breakdown

Each test includes the median total time, plus the script/paint split. Script time is your JavaScript executing. Paint time is browser layout and rendering.

```
01_run1k (Create 1,000 rows)
   Reactive React: total=75ms  (script=15.7  paint=59.0)
   React 19.2.0:   total=66ms  (script=16.1  paint=48.5)
   Note: Script is essentially tied. Paint gap of 10ms is the difference.

02_replace1k (Replace 1,000 rows)
   Reactive React: total=83ms  (script=20.4  paint=60.1)
   React 19.2.0:   total=76ms  (script=25.9  paint=48.7)
   Note: Reactive React's script is 5ms faster than React. Paint is 11ms slower.

03_update10th1k_x16 (Update every 10th row)
   Reactive React: total=59ms  (script=3.2   paint=46.2)
   React 19.2.0:   total=54ms  (script=10.7  paint=36.5)
   Note: Reactive React's script is 7ms faster (per-row signals are O(100), not O(1000)).

04_select1k (Select row)  ★ WIN
   Reactive React: total=16ms  (script=2.2   paint=10.8)
   React 19.2.0:   total=20ms  (script=5.7   paint=10.8)
   Note: Reactive React's script is 3.5ms faster. Paint is identical.

05_swap1k (Swap rows)  ★ WIN BY 5×
   Reactive React: total=78ms  (script=4.3   paint=57.8)
   React 19.2.0:   total=419ms (script=54.4  paint=344.5)
   Note: Reactive React's LIS reconciler moves 2 nodes. React relayouts the
   entire table area between rows 2 and 998.

06_remove-one-1k (Remove one row)
   Reactive React: total=55ms  (script=1.6   paint=50.0)
   React 19.2.0:   total=39ms  (script=3.4   paint=32.2)
   Note: Reactive React's script is faster. React's paint is faster.
   Likely difference: React's <td> elements have different layout characteristics.

07_create10k (Create 10,000 rows)
   Reactive React: total=1545ms (script=260.7 paint=1256.8)
   React 19.2.0:   total=1235ms (script=493.6 paint=736.2)
   Note: Reactive React's script is 2× faster. React's paint is 1.7× faster.
   This is the noisiest test on this hardware (high stddev).

08_create1k-after1k (Append 1,000 rows)
   Reactive React: total=84ms  (script=15.9  paint=65.9)
   React 19.2.0:   total=74ms  (script=17.6  paint=55.2)
   Note: Script is roughly tied. Paint is 11ms slower.

09_clear1k_x8 (Clear list)  ★ WIN
   Reactive React: total=49ms  (script=42.1  paint=4.5)
   React 19.2.0:   total=52ms  (script=47.9  paint=2.8)
   Note: Range.deleteContents() in @rrjs/renderer beats React's mass-unmount.
```

---

## What These Numbers Mean for Your App

If your application is **bundle-size sensitive** — mobile-first, marketing pages, embedded widgets — Reactive React's 4.2 kB bundle is the deciding factor. Loading 42 fewer kilobytes on every page visit translates to measurable improvements in user-perceived latency and bounce rate.

If your application involves **reordering, sorting, or drag-and-drop** — the swap_rows result generalizes. Reactive React's keyed reconciler is dramatically faster than React's VDOM diff for operations that move existing DOM nodes around.

If your application is **memory-constrained** — mobile devices, embedded browsers, IoT — Reactive React uses about a third less memory than React for typical workloads.

If your application is **dominated by mass row creation** — data-heavy dashboards rendering thousands of new rows on every navigation — React 19 remains a touch faster on raw creation. The gap is small (10-15% on most creation tests) and shrinking with each release.

---

## Reproducing These Numbers

The benchmark adapter is in [`apps/benchmark`](./apps/benchmark). The exact React 19 adapter compared against is the official one in [`krausest/js-framework-benchmark`](https://github.com/krausest/js-framework-benchmark/tree/master/frameworks/keyed/react-hooks).

To reproduce:

```bash
# Clone js-framework-benchmark
git clone https://github.com/krausest/js-framework-benchmark
cd js-framework-benchmark

# Add Reactive React adapter
# (use apps/benchmark/main.jsx from this repo as the template)

# Run the benchmark
cd webdriver-ts
npm install
npm run bench keyed/reactive-react
npm run bench keyed/react-hooks
```

Results are saved to `webdriver-ts/results/`. Numbers will vary by machine. The relative comparisons (faster/slower) are more stable than absolute times.

---

## Caveats

These numbers measure DOM-update performance under CPU throttling. Real applications also pay for network latency, server-side rendering time, and developer-introduced overhead.

The Reactive React adapter uses per-row signals for label updates, which the library supports as a first-class pattern but which is not the most idiomatic React translation. Library users who write React-style immutable updates will see slower numbers on `update_10th` (probably 1.5-2× slower).

This `BENCHMARKS.md` will be updated when:
- The Reactive React idiomatic adapter is benchmarked separately
- The library is officially submitted to the public leaderboard (planned for v0.2)
- v0.2 lands with compile-time static binding analysis that closes the creation-test gaps

---

## v0.2 Roadmap

v0.2 will address:

- **Per-binding fine-grained subscription** to reduce per-row effect overhead on selection/swap/remove operations
- **Compile-time static prop hoisting** in the Babel plugin to skip the effect wrapper for non-reactive bindings
- **Server-side rendering** and hydration support
- **Official js-framework-benchmark submission** with both signal-optimized and idiomatic adapters
- **Real-world benchmark suite** measuring Time to Interactive, Largest Contentful Paint, and interaction latency

The targeted-update numbers should approach SolidJS parity. The creation-test gap to React should close. This document will be updated when v0.2 ships.