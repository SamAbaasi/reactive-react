# Benchmarks

Measured 4 October 2026 with the official
[js-framework-benchmark](https://github.com/krausest/js-framework-benchmark) harness.
Raw results for every run are in
[`bench-results/2026-10-04-jsfb/`](../bench-results/2026-10-04-jsfb/).

## What is measured — and what is not

**Measured:** the engine. [`apps/benchmark/keyed-signals`](../apps/benchmark/keyed-signals)
is written directly against `@rrjs/signals` and `@rrjs/renderer`: one signal per row
label, and the renderer's keyed `list()` for rows. This is the signal-plus-renderer
runtime the packages ship.

**Not measured:** compiled React code. The run-once compiler cannot compile this
workload yet. The official `keyed/react-hooks` adapter is refused at build time
(destructured `useReducer` state, `memo`, a keyed `<Row>` component list), and a
`useState` rewrite of the same app is refused for create, append, update-every-10th
and swap: replacement arrays without established provenance are rejected rather than
reconciled (see [RUN-ONCE.md](./RUN-ONCE.md), "Next compiler work"). So these numbers
say nothing about "unmodified React code on signals". They describe the engine
underneath it.

The reference is the unmodified `keyed/react-hooks` adapter from the harness
(React 19.2.0).

## Setup

| | |
|---|---|
| Harness | js-framework-benchmark `b235f75` (4 Oct 2026), webdriver-ts runner |
| Browser | Chrome 154.0.8037.58, headless |
| Machine | MacBook Pro (M1, 8 GB), macOS 14.4.1, Node 22.17.0 |
| CPU runs | 15 per test (25 for select row), median reported, none dropped |
| Throttling | harness defaults: 4× for update, select, swap and clear; 2× for remove |
| Memory runs | 10 per test |
| Keyed check | both adapters pass the harness's `isKeyed` test |

The numbers are not comparable with the public leaderboard, which uses different
hardware. The two columns are comparable with each other: same machine, same browser
session, same harness.

## CPU (ms, lower is better)

Median, with min–max over the runs. React and the engine were measured in the same
session.

| Test | React 19.2 | Engine | Result |
|---|---|---|---|
| Swap rows | 137.3 (129.1–148.3) | **26.7** (23.7–30.0) | engine 5.1× faster |
| Update every 10th row | 22.3 (20.7–27.9) | **18.4** (17.6–22.0) | engine 1.2× faster |
| Create 10,000 rows | 645.7 (630.9–714.1) | **532.9** (506.5–560.3) | engine 1.2× faster |
| Remove one row | 21.9 (18.3–25.2) | 19.3 (17.4–24.7) | on par (ranges overlap) |
| Select row | 9.8 (9.0–15.5) | 9.7 (8.8–13.7) | on par |
| Create 1,000 rows | **34.7** (34.0–35.6) | 44.4 (43.3–47.4) | React 1.28× faster |
| Append 1,000 rows | **44.3** (41.7–47.7) | 53.4 (51.1–55.4) | React 1.21× faster |
| Replace 1,000 rows | **43.5** (41.7–45.6) | 63.6 (62.0–66.2) | React 1.46× faster |
| Clear | **27.5** (24.3–30.0) | 77.1 (72.0–115.2) | React 2.8× faster |

### Script and paint

Paint time is nearly identical on both sides in every test except swap. The
differences are almost entirely JavaScript.

| Test | Script: React / engine | Paint: React / engine |
|---|---|---|
| Swap rows | 28.0 / **3.0** | 106.0 / **20.5** |
| Update every 10th row | 6.1 / **2.2** | 13.8 / 13.5 |
| Create 10,000 rows | 315.1 / **198.3** | 320.7 / 318.5 |
| Remove one row | 1.9 / 1.5 | 17.6 / 15.9 |
| Select row | 4.1 / 4.4 | 4.1 / 3.9 |
| Create 1,000 rows | **7.8** / 17.0 | 26.1 / 26.7 |
| Append 1,000 rows | **9.6** / 18.7 | 32.7 / 33.0 |
| Replace 1,000 rows | **15.5** / 35.6 | 26.7 / 27.4 |
| Clear | **23.6** / 74.1 | 1.8 / 1.7 |

## Memory (MB, lower is better)

Median of 10 runs, measured before the renderer change below (which touches teardown
and list commits, not allocation).

| Test | React 19.2 | Engine |
|---|---|---|
| Ready, no rows | 1.15 (1.10–1.19) | **0.61** (0.59–0.62) |
| 1,000 rows | **4.43** (4.31–4.43) | 5.07 (5.07–5.08) |
| 1,000 rows, then clear | 1.92 (1.86–1.98) | **0.87** (0.79–0.88) |

## Size

| | React 19.2 adapter | Engine adapter |
|---|---|---|
| Uncompressed | 190.3 kB | **14.9 kB** |
| Compressed | 51.4 kB | **4.9 kB** |

## Reading the results

A signal records who read it, so a change reaches exactly those readers. That is
where the engine wins: swap moves two rows instead of having the list re-laid out
(React paints 106 ms against 20.5), and update-every-10th writes 100 text nodes.

Recording costs something too. Every row creates its bindings' subscriptions, and
removing a row disposes them. That is where React wins: create, append, replace and,
most of all, clear, where 1,000 rows of subscriptions are disposed at once.

Select row is a tie because the adapter has every row read `selected()`, so a
selection re-checks 1,000 class bindings. A per-row selector would make it a direct
update; the adapter keeps the plain form.

## Renderer change made during this measurement

The first run exposed two inefficiencies in `@rrjs/renderer`, fixed before the CPU
run above:

- Unmounting a subtree detached every descendant from its parent individually, one
  live DOM mutation per node. Only the subtree root is detached now.
- After every keyed reconcile, `list()` re-committed all rows, not only new ones. It
  now commits only rows created by that update.

Package tests (292), integration tests (175), the run-once gate and the Phase 6 gate
(15 Chrome checkpoints against React 19.2, 11 instances entered and disposed once, no
reconciler entry) pass with the change. Engine before and after, same harness:

| Test | Before (median, script) | After (median, script) |
|---|---|---|
| Swap rows | 41.2 (20.9) | **26.7 (3.0)** |
| Remove one row | 26.4 (10.4) | **19.3 (1.5)** |
| Clear | 86.2 (83.9) | 77.1 (74.1) |
| Append 1,000 rows | 54.7 (22.2) | 53.4 (18.7) |

## Reproducing

```sh
git clone --depth 1 https://github.com/krausest/js-framework-benchmark.git
cd js-framework-benchmark/server && npm ci && npm start
# in another terminal
cd js-framework-benchmark/webdriver-ts && npm ci && npm run compile
cd ../frameworks/keyed/react-hooks && npm ci && npm run build-prod
```

Build `apps/benchmark/keyed-signals` (`npm install && npm run build-prod`) and copy its
`package.json`, `package-lock.json`, `index.html` and `dist/` into
`frameworks/keyed/reactive-react-signals`. The lockfile entry for `@rrjs/renderer` is a
local link with no version, so set `packages["node_modules/@rrjs/renderer"].version` in
the copy, or the harness reports the version as missing. Then, from `webdriver-ts`:

```sh
node dist/isKeyed.js --framework keyed/react-hooks keyed/reactive-react-signals --headless true
node dist/benchmarkRunner.js --framework keyed/react-hooks keyed/reactive-react-signals --headless true
```

Add `--chromeBinary <path>` to use an installed Chrome.

## Earlier figures

Benchmarks published with v0.1 were withdrawn: the update-every-10th result measured
a no-op, the script/paint splits could not be regenerated, the adapter carried
mutation-counting instrumentation, and the figures described an implementation that
has since changed. They remain in this file's git history and in
[`bench-results/`](../bench-results/) for reference; nothing above depends on them.
