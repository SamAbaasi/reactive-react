import { buildData, SWAP_A, SWAP_B } from './data'
import { measureSwap, median, spread, settle, calibrateCpu, type Sample } from './measure'
import { compareStructure, compareComputed, compareBoxes, type Diff } from './dom-compare'
import { mountReactPane } from './react-pane.react'
import { mountRrPane } from './rr-pane.rr'
import './styles.css'

const ROW_COUNT = 1000
const BENCH_RUNS = 15
const WARMUP_RUNS = 3

interface Pane {
  id: 'react' | 'rrjs'
  name: string
  swap: () => void
  tbody: () => HTMLElement
  samples: Sample[]
}

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T

function idAt(tbody: HTMLElement, index: number): string {
  const tr = tbody.children[index] as HTMLElement | undefined
  return tr?.firstElementChild?.textContent?.trim() ?? ''
}

// One swap, measured. The completion check reads only the DOM, so it is the
// same check for both frameworks - neither side gets a framework-specific hook.
async function runOnce(pane: Pane): Promise<Sample> {
  const tbody = pane.tbody()
  const beforeA = idAt(tbody, SWAP_A)
  const beforeB = idAt(tbody, SWAP_B)
  if (!beforeA || !beforeB) throw new Error(pane.name + ': table is not populated')

  const sample = await measureSwap(
    pane.id + '-swap',
    pane.swap,
    () => idAt(tbody, SWAP_A) === beforeB && idAt(tbody, SWAP_B) === beforeA
  )
  pane.samples.push(sample)
  render(pane)
  return sample
}

function fmt(n: number | null, digits = 1): string {
  return n === null || Number.isNaN(n) ? '-' : n.toFixed(digits)
}

function render(pane: Pane): void {
  const totals = pane.samples.map(s => s.total)
  const last = pane.samples[pane.samples.length - 1] ?? null
  const sp = spread(totals)

  $('#' + pane.id + '-last').textContent = last ? fmt(last.total) : '-'
  $('#' + pane.id + '-median').textContent = totals.length ? fmt(median(totals)) : '-'
  $('#' + pane.id + '-runs').textContent = String(totals.length)
  $('#' + pane.id + '-spread').textContent = totals.length > 1
    ? fmt(sp.min) + '-' + fmt(sp.max) + ' ms (+/-' + fmt(sp.pct, 0) + '%)'
    : '-'

  const splitEl = $('#' + pane.id + '-split')
  if (!last) {
    splitEl.textContent = '-'
    splitEl.className = 'split'
  } else if (last.noLongFrame) {
    splitEl.textContent = 'no long frame (<50 ms) - browser reported no script/paint split'
    splitEl.className = 'split split--none'
  } else {
    splitEl.textContent =
      'script ' + fmt(last.script) + ' ms / style+paint ' + fmt(last.render) + ' ms (browser LoAF)'
    splitEl.className = 'split split--loaf'
  }
}

function setStatus(msg: string, busy = false): void {
  const el = $('#status')
  el.textContent = msg
  el.classList.toggle('busy', busy)
}

function setButtonsDisabled(disabled: boolean): void {
  for (const b of Array.from(document.querySelectorAll('button'))) {
    ;(b as HTMLButtonElement).disabled = disabled
  }
}

function escapeHtml(s: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
  return s.replace(/[&<>"]/g, c => map[c])
}

function renderDiffs(title: string, diffs: Diff[], note: string): void {
  const out = $('#compare-out')
  const rows = diffs.length
    ? diffs
        .map(
          d =>
            '<tr><td class="mono">' + escapeHtml(d.path) +
            '</td><td class="mono">' + escapeHtml(d.what) +
            '</td><td class="mono react">' + escapeHtml(d.react) +
            '</td><td class="mono rrjs">' + escapeHtml(d.rrjs) + '</td></tr>'
        )
        .join('')
    : '<tr><td colspan="4" class="ok">no differences found</td></tr>'

  out.innerHTML =
    '<h3>' + escapeHtml(title) +
    ' <span class="count">' + diffs.length + ' difference' + (diffs.length === 1 ? '' : 's') + '</span></h3>' +
    '<p class="note">' + note + '</p>' +
    '<table class="difftable"><thead><tr><th>path</th><th>property</th>' +
    '<th>React 19</th><th>Reactive React</th></tr></thead><tbody>' + rows + '</tbody></table>'
  out.hidden = false
}

async function main(): Promise<void> {
  setStatus('building ' + ROW_COUNT + ' rows...', true)

  // Same contents, separate arrays - a shared array would let one pane's
  // in-place work become visible to the other.
  const reactData = buildData(ROW_COUNT)
  const rrData = buildData(ROW_COUNT)

  const reactSwap = await mountReactPane($('#react-mount'), reactData)
  const rrSwap = mountRrPane($('#rrjs-mount'), rrData)

  const panes: Record<'react' | 'rrjs', Pane> = {
    react: {
      id: 'react',
      name: 'React 19',
      swap: reactSwap,
      samples: [],
      tbody: () => $('#react-mount').querySelector('tbody') as HTMLElement,
    },
    rrjs: {
      id: 'rrjs',
      name: 'Reactive React',
      swap: rrSwap,
      samples: [],
      tbody: () => $('#rrjs-mount').querySelector('tbody') as HTMLElement,
    },
  }

  // Wait for both to have their rows on screen before enabling anything.
  for (let i = 0; i < 300; i++) {
    const a = panes.react.tbody()?.children.length ?? 0
    const b = panes.rrjs.tbody()?.children.length ?? 0
    if (a === ROW_COUNT && b === ROW_COUNT) break
    await new Promise(r => requestAnimationFrame(() => r(undefined)))
  }

  const reactRows = panes.react.tbody().children.length
  const rrRows = panes.rrjs.tbody().children.length
  if (reactRows !== ROW_COUNT || rrRows !== ROW_COUNT) {
    setStatus('mount failed - React ' + reactRows + ' rows, Reactive React ' + rrRows + ' rows')
    return
  }

  setStatus('ready - ' + ROW_COUNT + ' rows in each pane, identical data')

  $('#swap-both').addEventListener('click', async () => {
    setButtonsDisabled(true)
    // Sequential, not simultaneous. Both panes share one main thread; running
    // them together would have each pane's work inflate the other's number.
    // You still see React stall and the signals pane snap - one after the other.
    setStatus('swapping - React 19...', true)
    await runOnce(panes.react)
    setStatus('swapping - Reactive React...', true)
    await runOnce(panes.rrjs)
    setStatus('done')
    setButtonsDisabled(false)
  })

  $('#run-many').addEventListener('click', async () => {
    setButtonsDisabled(true)
    for (const pane of [panes.react, panes.rrjs]) {
      pane.samples = []
      render(pane)
    }
    for (const pane of [panes.react, panes.rrjs]) {
      setStatus(pane.name + ': ' + WARMUP_RUNS + ' warm-up runs (discarded)...', true)
      for (let i = 0; i < WARMUP_RUNS; i++) await runOnce(pane)
      pane.samples = []
      render(pane)

      for (let i = 0; i < BENCH_RUNS; i++) {
        setStatus(pane.name + ': run ' + (i + 1) + ' of ' + BENCH_RUNS + '...', true)
        await runOnce(pane)
      }
    }
    const rMed = median(panes.react.samples.map(s => s.total))
    const sMed = median(panes.rrjs.samples.map(s => s.total))
    setStatus(
      BENCH_RUNS + ' runs each (after ' + WARMUP_RUNS + ' discarded warm-ups) - React ' +
      fmt(rMed) + ' ms, Reactive React ' + fmt(sMed) + ' ms, ratio ' + fmt(rMed / sMed, 2) + 'x'
    )
    setButtonsDisabled(false)
  })

  $('#calibrate').addEventListener('click', async () => {
    setButtonsDisabled(true)
    setStatus('running CPU calibration...', true)
    await settle()
    const ms = median([calibrateCpu(), calibrateCpu(), calibrateCpu()])
    const el = $('#cpu-reading')
    const previous = Number(el.dataset.baseline ?? '0')
    if (!previous) {
      el.dataset.baseline = String(ms)
      el.textContent =
        fmt(ms) + ' ms (baseline). Now enable CPU throttling in DevTools and click again.'
    } else {
      el.textContent =
        fmt(ms) + ' ms - ' + fmt(ms / previous, 2) + 'x slower than this session baseline of ' +
        fmt(previous) + ' ms'
    }
    setStatus('calibration done')
    setButtonsDisabled(false)
  })

  $('#compare-structure').addEventListener('click', () => {
    const a = panes.react.tbody().children[0] as Element
    const b = panes.rrjs.tbody().children[0] as Element
    renderDiffs(
      'Row 1 - structure and attributes',
      compareStructure(a, b),
      'If this is empty, both panes really are rendering the same markup, and the timing comparison is fair.'
    )
  })

  $('#compare-layout').addEventListener('click', () => {
    const a = panes.react.tbody().children[0] as Element
    const b = panes.rrjs.tbody().children[0] as Element
    const diffs = compareComputed(a, b).concat(compareBoxes(a, b))
    renderDiffs(
      'Row 1 - resolved layout properties and box geometry',
      diffs,
      'This is the check behind the open question in docs/BENCHMARKS.md, which guessed that React&rsquo;s &lt;td&gt; elements &ldquo;have different layout characteristics&rdquo;. An empty table means that guess is wrong at the level of a single row.'
    )
  })

  setButtonsDisabled(false)
}

main().catch(err => {
  setStatus('error: ' + err.message)
  console.error(err)
})
