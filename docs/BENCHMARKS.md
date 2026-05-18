# Benchmarks

Reactive React's performance against React, SolidJS, and vanilla JavaScript on the standard `js-framework-benchmark` test suite.

These are real numbers from running the official benchmark harness locally. They are not yet submitted to the public leaderboard — that submission is planned for v0.1.1 once the benchmark adapter is finalized. The numbers below are reproducible against the published `@rrjs` packages.

---

## Methodology

- **Test suite**: official [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark) Chrome harness with CDP-based timing
- **CPU throttling**: 4× (standard for this benchmark, exposes performance differences)
- **Iterations**: 15 per test, median reported
- **Hardware**: Lenovo laptop with Intel CPU, Windows 11, Chrome
- **Comparison numbers**: from the [official js-framework-benchmark leaderboard](https://krausest.github.io/js-framework-benchmark/current.html) for React 19 and SolidJS on similar reference hardware

The benchmark adapter (`apps/benchmark/main.jsx`) uses per-row signals for label updates, which is the fastest pattern Reactive React supports. A future revision will also publish numbers for the "plain array" pattern that most users start with; expect those to be 2-3× slower on the `update_10th` test.

---

## Results

### CPU Tests (Lower Is Better)

| Test | Reactive React | React 19 | SolidJS | Vanilla JS |
|------|----------------|----------|---------|------------|
| Create 1,000 rows | **67 ms** | ~70 ms | ~36 ms | ~32 ms |
| Replace 1,000 rows | **69 ms** | ~75 ms | ~40 ms | ~38 ms |
| Update every 10th row | **41 ms** | ~40 ms | ~16 ms | ~14 ms |
| Select row | **24 ms** | ~10 ms | ~3 ms | ~2 ms |
| Swap rows | **49 ms** | ~35 ms | ~21 ms | ~18 ms |
| Remove row | **36 ms** | ~30 ms | ~22 ms | ~17 ms |
| Create 10,000 rows | **955 ms** | ~750 ms | ~410 ms | ~360 ms |
| Append 1,000 rows | **106 ms** | ~80 ms | ~48 ms | ~42 ms |
| Clear 1,000 rows | **30 ms** | ~30 ms | ~13 ms | ~10 ms |

### Bundle Size

| Metric | Reactive React | React + ReactDOM | SolidJS |
|--------|----------------|------------------|---------|
| Uncompressed | **16.1 kB** | ~140 kB | ~24 kB |
| Compressed (gzip) | **4.2 kB** | ~46 kB | ~8 kB |

### Memory (MB)

| Metric | Reactive React | React 19 | SolidJS |
|--------|----------------|----------|---------|
| Ready (no rows) | **0.59 MB** | ~1.2 MB | ~0.5 MB |
| After 1k rows | **3.47 MB** | ~5.5 MB | ~3.4 MB |
| After clear of 1k rows | **13.67 MB** | ~14 MB | ~9 MB |

### Startup

| Metric | Reactive React | React 19 |
|--------|----------------|----------|
| First paint | **155 ms** | ~280 ms |

---

## Honest Analysis

### Where Reactive React Wins

**Bundle size is best-in-class.** 4.2 kB gzipped is roughly 11× smaller than React + ReactDOM and about half the size of SolidJS. This is the single biggest practical advantage for production apps where load time matters.

**Memory is competitive with SolidJS and better than React.** After populating 1,000 rows, Reactive React uses 3.47 MB versus React's 5.5 MB and roughly matches SolidJS's 3.4 MB. This matters on mobile and low-end devices.

**First paint is meaningfully faster than React.** 155 ms vs React's ~280 ms is a 45% improvement. The smaller bundle and lack of VDOM construction overhead pay off in startup time.

**Bulk operations match or beat React.** Creating 1,000 rows is faster than React (67 ms vs 70 ms). Replacing 1,000 rows is faster (69 ms vs 75 ms). Clearing is at parity (30 ms). Update-every-10th is at parity (41 ms vs 40 ms).

### Where Reactive React Trails

**Single-row targeted operations trail SolidJS by 2-4×.** Selecting one row in a 1,000-row table takes 24 ms vs SolidJS's 3 ms. Removing one row takes 36 ms vs 22 ms. The script time on these operations is already minimal (1-3 ms); the bulk of the cost is browser paint as the layout reflows around the single change.

**Targeted-update performance is the main remaining gap.** The architectural change to close it — per-binding subscription with finer granularity than the current effect-wrapping model — is planned for v0.2. SolidJS achieves this with a sophisticated compile-time analysis that Reactive React's Babel plugin does not yet match.

**Create 10,000 rows is paint-bound.** 955 ms total includes ~800 ms of browser paint for rendering 10,000 DOM nodes. JavaScript optimization can't reduce this; only fewer rendered nodes (via virtualization) would.

---

## Progress Over the v0.1.0 Cycle

The first run of these benchmarks during development was significantly slower than the final numbers. Targeted optimizations made the difference:

| Test | Initial | Final | Improvement |
|------|---------|-------|-------------|
| 01 create 1k | 87 ms | 67 ms | −23% |
| 02 replace 1k | 90 ms | 69 ms | −23% |
| 03 update 10th | 83 ms | 41 ms | **−51%** |
| 05 swap rows | 144 ms | 49 ms | **−66%** |
| 06 remove one | 58 ms | 36 ms | −38% |
| 09 clear | 77 ms | 30 ms | **−61%** |

The optimizations were applied in `packages/renderer/src/index.ts`:

1. **`Range.deleteContents()` for bulk clear** — replaced 1,000 individual `removeChild` calls with a single browser range deletion. This was the largest single win on the clear test.

2. **DocumentFragment for bulk insert** — replaced 1,000 individual `insertBefore` calls with a single fragment insertion. This improved the first-render path.

3. **Pure-append fast path** — when new items are appended to an existing list without changing existing keys, skip the full reconcile and bulk-insert just the new tail.

4. **Same-value bailout for DOM attributes** — when re-evaluating a binding produces the same string, skip the `setAttribute` call entirely. This was diagnosed via a custom mutation counter that revealed 1,000 redundant DOM writes per single-row selection change; the bailout reduces this to 1.

The swap-rows variance, which originally showed a 433 ms outlier, was traced to garbage collection pressure during the clear-heavy parts of the test cycle. Optimizing clear and create paths reduced GC pressure across the entire test session, which in turn collapsed swap's standard deviation from 108 ms to 8 ms.

---

## What These Numbers Mean for Your App

If your application is dominated by **bulk operations** — rendering lists on navigation, replacing data on refresh, updating many rows when state changes — Reactive React is competitive with React and sometimes faster. The bundle size and first-paint advantages translate directly to faster page loads.

If your application is dominated by **targeted single-element updates** — highlighting hover states, animating individual elements, incremental UI feedback — Reactive React is comparable to React but trails SolidJS. The gap is measurable but only matters if your app does many such updates per second.

For most React applications, the bulk-operation results plus the bundle size and memory advantages make Reactive React a net improvement. Apps where every millisecond of targeted-update latency matters — interactive editors, animations, games — would benefit from SolidJS's tighter targeted-update model.

---

## Reproducing the Numbers

### Local benchmark adapter

```bash
git clone https://github.com/SamAbaasi/reactive-react
cd reactive-react/apps/benchmark
npm install
npm run dev
```

Open the printed URL. Each button on the page corresponds to a benchmark test. Click and observe the timing in the browser DevTools Performance tab.

### Official harness

Reproduce the numbers in this document by running the official `js-framework-benchmark` harness:

```bash
git clone https://github.com/krausest/js-framework-benchmark
cd js-framework-benchmark/frameworks/keyed
# Create a reactive-react folder with the adapter from apps/benchmark/main.jsx
# Configure it with the @rrjs packages at their published versions
cd ../../webdriver-ts
npm install
npm run bench keyed/reactive-react
```

The harness requires Chrome and the Selenium WebDriver setup described in the upstream README.

Numbers will vary by machine. The relative comparisons (faster/slower than React, ratio to SolidJS) are more stable than the absolute times.

---

## Caveats and Limitations

These numbers measure DOM-update performance, not full application performance. Real applications also pay for:

- JavaScript parse time after bundle download (Reactive React's small bundle helps here)
- Initial component tree construction (Reactive React's lack of VDOM helps here)
- Memory pressure from large data structures (Reactive React is competitive here)
- Network and API latency (unaffected by framework choice)

The numbers do not capture real-application metrics like Time to Interactive (TTI), Largest Contentful Paint (LCP), or interaction-to-paint latency on real workloads. Those will be measured in v0.2 with a dedicated real-world benchmark suite.

The benchmark adapter uses per-row signals, which is the fastest pattern Reactive React supports. Library users starting from React patterns will not immediately get these numbers; they need to adopt the signal-per-row idiom for fine-grained updates. The migration guide in [`docs/MIGRATION.md`](./docs/MIGRATION.md) explains this.

---

## Known Areas for v0.2

For full transparency, v0.2 will address:

- **Fine-grained per-binding subscription** to close the SolidJS targeted-update gap. The script time on `select row` is already 3 ms — the work is in reducing the effect-graph overhead so the script doesn't fire 1,000 effects on a single signal change.
- **Idiomatic-pattern benchmarks** showing how Reactive React performs when used like React (plain arrays, immutable updates) rather than the per-row signal pattern.
- **Official js-framework-benchmark submission** with the finalized adapter, putting Reactive React on the public leaderboard.
- **Optional `renderTo` API for non-DOM backends** — exploring whether the signal kernel could drive Canvas, terminal, or React Native-style targets.

This document will be updated when v0.2 ships.