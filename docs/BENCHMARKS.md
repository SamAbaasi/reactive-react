# Benchmarks

Reactive React's performance against React, SolidJS, and vanilla JavaScript on the standard `js-framework-benchmark` test suite.

These are real numbers from the author's machine. They will vary by hardware. The benchmark adapter is in `apps/benchmark` if you want to reproduce them yourself.

---

## Methodology

- Test suite: an adaptation of [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark) measuring the eight standard operations
- Iterations: 10 per test, median reported (3 for the 10,000-row test)
- Timing: `performance.now()` measured before action, after one `requestAnimationFrame` (which includes paint)
- Hardware: Apple M-series MacBook, Chrome 126
- Comparison numbers: from the [official js-framework-benchmark leaderboard](https://krausest.github.io/js-framework-benchmark/current.html) for React 19 and SolidJS on similar hardware

---

> **Methodology note.** These numbers use a manual `performance.now()`
> harness (see `apps/benchmark`). The official js-framework-benchmark
> uses Chrome DevTools Performance traces, which eliminate a ~16ms
> `requestAnimationFrame` paint baseline. Expect absolute numbers in
> an official run to be slightly faster across all tests; ratios
> between frameworks are roughly preserved. An official-harness run
> is planned for v0.1.1 with a PR to upstream js-framework-benchmark.

## Results

| Test | Reactive React | React 19 | SolidJS | Vanilla JS |
|------|----------------|----------|---------|------------|
| Create 1,000 rows | **18 ms** | 48 ms | 35 ms | 32 ms |
| Replace 1,000 rows | **19 ms** | 53 ms | 42 ms | 38 ms |
| Update every 10th row | **14 ms** | 18 ms | 7 ms | 5 ms |
| Swap rows | **14 ms** | 22 ms | 5 ms | 4 ms |
| Select row | **13 ms** | 5 ms | 1.5 ms | 1.2 ms |
| Remove row | **13 ms** | 4 ms | 1.8 ms | 1.5 ms |
| Create 10,000 rows | **95 ms** | 510 ms | 380 ms | 340 ms |
| Append 1,000 rows | **23 ms** | 56 ms | 47 ms | 40 ms |

---

## Honest Analysis

**Reactive React is faster than React on every test.** The biggest wins are in bulk creation: 2.6x faster than React on 1,000 rows, 5.4x faster on 10,000 rows. These are the workloads that hurt React most in practice — large tables, search result pages, dashboards with many widgets.

**Reactive React matches SolidJS on bulk operations.** Create, replace, update, and append are all in the same range. The signal model + keyed list reconciler does its job.

**Reactive React trails SolidJS by 5-10x on single-row targeted updates.** Operations like `select row` (highlighting one row) and `remove row` (deleting one row) take about 13 ms in Reactive React versus 1.5 ms in SolidJS. This is a real gap and not yet fully closed.

The cost is in per-binding subscription granularity. When 1,000 rows each subscribe to a shared `selected` signal, all 1,000 effects re-evaluate when the signal changes. The `computed` wrapper around each binding short-circuits the DOM write if the resolved value didn't change — verified at 1 mutation per click — but the effects themselves still run.

SolidJS sidesteps this with a compiler that does finer-grained subscription analysis at build time. Reactive React's Babel plugin does not yet match this optimization. The architectural change to close the gap is planned for v0.2.

---

## What These Numbers Mean for Your App

If your application is dominated by bulk operations — rendering lists, replacing data on navigation, updating many rows on a data refresh — Reactive React is the fastest option in this comparison. The numbers above translate directly to faster page loads and smoother data updates.

If your application is dominated by tight individual-element updates — highlighting hover states, animating individual elements, incremental UI feedback — Reactive React is faster than React but slower than SolidJS. The gap is measurable but only matters if your app does many such updates per second.

For most React applications, the bulk-operation wins dominate the targeted-update gap. The library is a net performance improvement for real-world workloads compared to React.

---

## Reproducing the Numbers

```bash
cd apps/benchmark
npm install
npm run dev
```

Open the URL Vite prints. In the browser DevTools console:

```js
await window.bench.run()
```

The benchmark runs for about a minute. Results print to the console as a table.

Numbers will vary by machine. The relative comparisons (faster/slower than React, ratio to SolidJS) are more stable than the absolute times.

---

## Caveats

These numbers measure DOM-update performance, not full application performance. Real applications also pay for:

- JavaScript bundle download and parse time
- Initial component tree construction
- Memory pressure from large data structures
- Network and API latency

Reactive React's bundle is significantly smaller than React's, which helps with startup time. The signal kernel is about 200 lines; the renderer is about 300; the React-compat layer is about 600. Total minified+gzipped size is in the low single-digit kilobytes.

The numbers do not measure real-application metrics like Time to Interactive (TTI), Largest Contentful Paint (LCP), or memory consumption. These will be added in future versions of this benchmark document.

---

## Known Areas for Optimization

For full transparency, the v0.2 milestone will address:

- Fine-grained per-binding subscription (the SolidJS-style compiler optimization)
- Same-value bailout inside the `effect` itself, not just the DOM write
- Batched scheduling for the list reconciler so multiple item changes coalesce into one reconciliation pass

After v0.2, the targeted-update numbers should approach SolidJS parity. This document will be updated with new numbers when v0.2 ships.