# Optimisation log

One entry per attempt, including the ones that failed or were reverted. Newest last.

Numbers here come from named harnesses. Where a number came from the in-page
`apps/swap-demo` harness it says so — that harness has a ±50% run-to-run spread and
cannot adjudicate anything smaller than a large effect. Harness numbers from
`.bench-harness/` (the real js-framework-benchmark) are marked as such.

---

## 001 — Keyed list: rebind reused rows to their current item

**Status: kept.** Correctness fix, not an optimisation. Logged because it has a
measurable performance cost that required a fresh benchmark comparison.

**What changed.** `packages/renderer/src/index.ts`. On key reuse, `list()` kept the DOM
node and stored the new item but never re-evaluated anything the row had bound to it, so
a reused row showed the first item ever seen for that key. Each row now owns a signal
holding its current item, and `render()` is handed a proxy that reads through it; on
reuse the signal is republished and exactly the affected bindings re-run. `render()` is
called inside a new `untrack()` (added to `@rrjs/signals`) so a row's own reads do not
subscribe the *list* effect to that row.

**Mechanism in one line.** Per-row item signal + read-through proxy, so a reused node's
bindings re-run without the node being rebuilt.

**Hypothesis.** `swap` should be unaffected: a pure reorder moves the same item objects,
so the per-row signal is set to the value it already holds and `Object.is` bailout means
no binding re-runs. `create_*` may pay for one extra signal and one extra Proxy per row.
`update_10th` becomes real work for the first time — it previously updated nothing.

**Before / after — `apps/swap-demo`, 15 runs after 3 discarded warm-ups, unthrottled,
Chrome 151.0.7922.170:**

| | before | after |
|---|---|---|
| Reactive React swap, median | 34.9 / 34.4 ms | 36.0 / 36.7 / 35.8 ms |
| Reactive React swap, spread | ±48% | ±53% |
| React 19 swap, median | 150.4 ms | 141.5 ms |

**Verdict on the delta.** ~+1.5 ms, ~+4.4%. That is far inside the ±50% run-to-run
spread, but the medians cluster tightly enough (three post-fix runs within 0.9 ms) that
it reads as a small systematic cost rather than noise. Attributed to 1,000 no-op signal
writes on the reuse path — one per row per swap, each bailing out on `Object.is`. Swap
remains ~3.9× faster than React 19 on the same page.

**Not yet measured.** Create-heavy work. The proxy and signal are allocated per row at
row-creation time, so `create_1k` / `create_10k` are where this fix could cost real
time, and the in-page demo does not measure them. Deferred to the harness run.

**Tests.** `packages/renderer/tests/list-content.test.ts`, 11 new tests; 10 of the 11
fail against the pre-fix renderer, verified by reverting. Full suite 210 passed, 0
failed, 0 skipped.

**Known limitation, asserted in the suite.** Primitive items cannot be proxied, so a
primitive row under a key that is not derived from its value (index-as-key over an array
of strings) still shows stale content. React updates it. Recorded as an explicit test in
`list.test.ts` rather than left to be discovered.

**Generalises?** Yes — verified on a second workload. `apps/todomvc` toggle and edit were
both silently broken by this defect and both now work, with node identity preserved.

---

## 002 — Strip `key` from the emitted DOM

**Status: kept.** Correctness fix with a possible small create-path win.

**What changed.** `createElement` in `packages/renderer/src/index.ts` now skips the `key`
prop. Rows previously rendered as `<tr key="1">` — one extra `setAttribute` per row on
every keyed list, plus the attribute's memory. Nothing internal ever read it back:
`list()` gets keys from `getKey(item, i)` and from its own `entry.key` records, never
from the element. Verified by grep across the renderer before changing anything.

**Hypothesis.** Should show up, if anywhere, in create-heavy tests as one fewer
`setAttribute` per row. Should be invisible on `swap`, which creates no rows.

**Before / after — `apps/swap-demo`:** no measurable effect, as predicted. Measured in
the same runs as 001, so the two are not separately attributable on this workload; both
are within noise there and neither creates rows.

**Not yet measured.** `create_1k` / `create_10k` / `append_1k` on the real harness, which
is the only place a per-row `setAttribute` could be visible.

**Tests.** 2 tests in `list-content.test.ts` covering the list path and a bare `h()` call.

**Note.** `@rrjs/babel-plugin` still *emits* `key` into the `h()` props; the renderer now
discards it. Fixing the plugin as well would avoid constructing the prop at all, but that
is a second change and has not been made.

---

## 003 — Harness baseline, and the create-path cost of 001

**Status: measured, unresolved.** No code changed. This entry exists to record what the
real harness says about entry 001's cost, which the in-page swap demo could not see.

**Setup.** Vendored `js-framework-benchmark` at `.bench-harness/`, puppeteer runner (the
harness default — the bundled chromedriver is 150.x and cannot drive the installed Chrome
151.0.7922.170, but the default path does not use it). Two conforming adapters,
`keyed/reactive-react` (idiomatic) and `keyed/reactive-react-signals`, both passing the
harness's own `isKeyed` validation alongside `keyed/react-hooks`. 15 iterations per test.

**Throttling, corrected.** The harness does NOT apply 4x uniformly. From
`webdriver-ts/src/benchmarksCommon.ts`: 4x on `03_update10th`, `04_select`, `05_swap`,
`09_clear`; 2x on `06_remove`; and **no throttling at all** on `01_run1k`,
`02_replace1k`, `07_create10k`, `08_append1k`. `docs/BENCHMARKS.md`'s "CPU throttling: 4x"
is wrong for four of the nine tests.

**A/B: shipped library (HEAD, both defects) vs fixed library (001 + 002).** Idiomatic
adapter, unthrottled, single-framework runs so machine state matches. sigma is on the
difference of medians, n=15 each.

| test | metric | shipped | fixed | delta | sigma |
|---|---|---|---|---|---|
| create 1k | total | 129.2 (sd 18.1) | 150.2 (sd 36.6) | +21.0 (+16%) | 2.0 |
| create 1k | script | 31.8 (sd 5.7) | 41.7 (sd 9.5) | +9.9 (+31%) | 3.5 |
| create 1k | paint | 95.6 (sd 12.7) | 106.9 (sd 26.9) | +11.3 (+12%) | 1.5 |
| create 10k | total | 1176.3 (sd 166.6) | 1636.3 (sd 407.7) | +460.0 (+39%) | 4.0 |
| create 10k | script | 225.9 (sd 24.0) | 325.8 (sd 122.5) | +99.9 (+44%) | 3.1 |
| create 10k | paint | 933.8 (sd 146.6) | 1284.6 (sd 299.3) | +350.8 (+38%) | 4.1 |

**Verdict: the fix costs real time on the create path, well outside noise.** Script time is
the expected cost — one `createSignal` and one `Proxy` per row, so 10,000 of each on
`create10k`. Paint rising by a similar proportion is *not* explained by the fix directly;
the most likely mechanism is allocation pressure from those 20,000 objects extending the
frame and landing in what the trace attributes to rendering. That remains a hypothesis, not
a finding.

Note the A/B conflates 001 and 002. 002 (dropping a `setAttribute` per row) should make the
create path slightly *faster*, so 001's true cost is marginally larger than the table shows.

**Session effect, worth recording.** The same fixed build measured `create10k` at 1909.1 ms
inside a three-framework run and 1636.3 ms in a fresh single-framework run — a 17% gap from
machine state alone. Numbers from different run shapes are not comparable, and the final
table must come from one run.

**Next.** Allocate the per-row signal and proxy lazily, on first reuse, so the create path
pays nothing and only reconciliation pays. Tracked as attempt 004.

---
