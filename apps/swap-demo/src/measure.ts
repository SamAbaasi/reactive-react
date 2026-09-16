// ─── What this file measures, and what it does not ──────────────────────────
//
// MEASURED: total interaction latency. From the moment the swap action is
// invoked, until the first task that runs after the browser has painted a frame
// in which the DOM actually reflects the swap. We confirm the DOM reflects it by
// reading it back — we do not assume the framework finished. That matters for
// React, whose scheduler may defer the render into a later task; a naive
// "one rAF and stop" would stop the clock before React had painted and would
// report React as faster than it is.
//
// NOT MEASURED: a real script/paint split. This is an in-page harness, not a CDP
// trace. Where the browser reports a Long Animation Frame (LoAF) overlapping the
// interaction, we surface its script/render breakdown, because that number comes
// from the browser rather than from us. LoAF only fires for frames over ~50ms, so
// a fast swap legitimately produces no entry — in that case we report no split
// rather than inventing one.
//
// GRANULARITY: one animation frame. Under CPU throttling frames are long, so
// totals are coarse. Treat a difference of a few ms as nothing.

export interface Sample {
  total: number
  /** Script time from the browser's LoAF entry, or null when no long frame occurred. */
  script: number | null
  /** Style/layout/paint time from the same LoAF entry, or null. */
  render: number | null
  /** True when the browser reported no long frame, i.e. the work fit in one short frame. */
  noLongFrame: boolean
}

export interface PaneStats {
  last: Sample | null
  samples: Sample[]
}

function nextFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()))
}

/**
 * Resolves in the first task after the current frame has been presented.
 * rAF callbacks run *before* style/layout/paint; a timer scheduled from inside
 * one therefore fires after that frame has gone to the screen.
 */
function afterPaint(): Promise<void> {
  return new Promise(resolve => {
    requestAnimationFrame(() => setTimeout(resolve, 0))
  })
}

/** Let the main thread go quiet before starting a measurement. */
export async function settle(frames = 3): Promise<void> {
  for (let i = 0; i < frames; i++) await nextFrame()
  await new Promise(resolve => setTimeout(resolve, 40))
}

export function median(values: number[]): number {
  if (!values.length) return NaN
  const s = values.slice().sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function spread(values: number[]): { min: number; max: number; pct: number } {
  if (!values.length) return { min: NaN, max: NaN, pct: NaN }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const med = median(values)
  return { min, max, pct: med ? ((max - min) / med) * 100 : NaN }
}

interface LoafEntry extends PerformanceEntry {
  renderStart: number
  styleAndLayoutStart: number
}

/**
 * Runs `action`, then waits until `isDone()` reports the DOM has caught up and a
 * frame containing it has painted.
 */
export async function measureSwap(
  label: string,
  action: () => void,
  isDone: () => boolean
): Promise<Sample> {
  const loaf: LoafEntry[] = []
  let observer: PerformanceObserver | null = null
  try {
    observer = new PerformanceObserver(list => {
      loaf.push(...(list.getEntries() as LoafEntry[]))
    })
    observer.observe({ type: 'long-animation-frame', buffered: false } as PerformanceObserverInit)
  } catch {
    observer = null // Firefox/Safari, or a Chrome without LoAF — degrade to total only.
  }

  await settle()

  const startMark = `${label}-start`
  const endMark = `${label}-end`
  performance.mark(startMark)
  const t0 = performance.now()

  action()

  // Wait for the change to be observable in the DOM, then for it to be painted.
  // Bounded so a broken pane fails loudly instead of hanging the page.
  let guard = 0
  while (!isDone()) {
    if (++guard > 600) {
      observer?.disconnect()
      throw new Error(`${label}: the swap never became visible in the DOM`)
    }
    await nextFrame()
  }
  await afterPaint()

  const total = performance.now() - t0
  performance.mark(endMark)
  performance.measure(label, startMark, endMark)

  // A LoAF entry is only delivered once the frame it describes has finished, and
  // that frame can still be running when the DOM check first succeeds. One task
  // is not enough — waiting a single macrotask here silently produced "no long
  // frame" for a 263 ms React swap. This wait sits between samples, not inside
  // the measured window, so it costs nothing but wall-clock time.
  await new Promise(resolve => setTimeout(resolve, 150))
  observer?.disconnect()

  // Keep only long frames that overlap the interaction window.
  const overlapping = loaf.filter(e => e.startTime >= t0 - 1 && e.startTime <= t0 + total + 1)

  if (!overlapping.length) {
    return { total, script: null, render: null, noLongFrame: true }
  }

  // Sum across the window: React may spread the work over several long frames.
  let script = 0
  let render = 0
  for (const e of overlapping) {
    const frameScript = Math.max(0, e.renderStart - e.startTime)
    const frameRender = e.renderStart > 0 ? Math.max(0, e.startTime + e.duration - e.renderStart) : 0
    script += frameScript
    render += frameRender
  }

  return { total, script, render, noLongFrame: false }
}

/**
 * A fixed unit of work, so the page can state its own CPU conditions instead of
 * asking the viewer to trust a caption. Run it unthrottled, then again with
 * throttling on: the ratio is the throttle factor actually in effect.
 */
export function calibrateCpu(): number {
  const t0 = performance.now()
  let acc = 0
  for (let i = 0; i < 4_000_000; i++) acc += Math.sqrt(i % 1000)
  if (acc < 0) throw new Error('unreachable')
  return performance.now() - t0
}
