#!/usr/bin/env node
// Reads the harness's raw result JSON and prints a comparison table plus a
// machine-readable roll-up. Reports median and spread for every figure, because
// a median with no spread cannot be argued with or against.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const RESULTS = join(ROOT, '.bench-harness', 'webdriver-ts', 'results')

const LABELS = {
  '01_run1k': 'create 1k',
  '02_replace1k': 'replace 1k',
  '03_update10th1k_x16': 'update 10th',
  '04_select1k': 'select row',
  '05_swap1k': 'swap rows',
  '06_remove-one-1k': 'remove row',
  '07_create10k': 'create 10k',
  '08_create1k-after1k_x2': 'append 1k',
  '09_clear1k_x8': 'clear',
}
const THROTTLE = {
  '01_run1k': 1, '02_replace1k': 1, '03_update10th1k_x16': 4, '04_select1k': 4,
  '05_swap1k': 4, '06_remove-one-1k': 2, '07_create10k': 1,
  '08_create1k-after1k_x2': 1, '09_clear1k_x8': 4,
}
const ORDER = Object.keys(LABELS)

const FRAMEWORKS = [
  { key: 'react-hooks-v19.2.0-keyed', label: 'React 19.2.0' },
  { key: 'reactive-react-v0.1.7-keyed', label: 'RR idiomatic' },
  { key: 'reactive-react-signals-v0.1.7-keyed', label: 'RR signals' },
]

if (!existsSync(RESULTS)) {
  console.error(`no results at ${RESULTS} — run the harness first`)
  process.exit(1)
}

// results/<framework>_<benchmark>.json holds
//   { framework, benchmark, type: 'cpu', values: { total: {...}, script: {...}, paint: {...} } }
// where each metric carries the raw per-iteration `values` array.
const data = {}
for (const file of readdirSync(RESULTS).filter(f => f.endsWith('.json'))) {
  const e = JSON.parse(readFileSync(join(RESULTS, file), 'utf8'))
  if (!e.framework || !e.benchmark) continue
  data[e.framework] ??= {}
  data[e.framework][e.benchmark] = e.values ?? {}
}

const f1 = n => (n == null || Number.isNaN(n) ? '—' : n.toFixed(1))

function cell(fw, bench, metric = 'total') {
  const e = data[fw]?.[bench]?.[metric]
  if (!e || !Array.isArray(e.values) || !e.values.length) return null
  const values = e.values
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  const min = sorted[0]
  const max = sorted[sorted.length - 1]
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length)
  return { median, min, max, mean, sd, n: values.length, spreadPct: ((max - min) / median) * 100 }
}

const pad = (s, n) => String(s).padEnd(n)
const lp = (s, n) => String(s).padStart(n)

console.log('')
console.log('  TOTAL (ms) — median, with run-to-run spread as % of median')
console.log('  ' + '-'.repeat(96))
console.log(
  '  ' + pad('benchmark', 14) + lp('thr', 4) +
  FRAMEWORKS.map(f => lp(f.label, 18)).join('') + lp('React/RRidio', 14)
)
console.log('  ' + '-'.repeat(96))

const rollup = { benchmarks: {} }

for (const b of ORDER) {
  const cells = FRAMEWORKS.map(f => cell(f.key, b))
  if (cells.every(c => c === null)) continue
  const [react, idio] = cells
  const ratio = react && idio ? react.median / idio.median : null
  console.log(
    '  ' + pad(LABELS[b], 14) + lp(THROTTLE[b] + 'x', 4) +
    cells.map(c => lp(c ? `${f1(c.median)} ±${c.spreadPct.toFixed(0)}%` : '—', 18)).join('') +
    lp(ratio ? ratio.toFixed(2) + 'x' : '—', 14)
  )
  rollup.benchmarks[b] = {
    label: LABELS[b],
    throttle: THROTTLE[b],
    frameworks: Object.fromEntries(
      FRAMEWORKS.map((f, i) => [f.label, cells[i] && {
        median: +cells[i].median.toFixed(1),
        min: +cells[i].min.toFixed(1),
        max: +cells[i].max.toFixed(1),
        stddev: +cells[i].sd.toFixed(1),
        spreadPctOfMedian: +cells[i].spreadPct.toFixed(0),
        iterations: cells[i].n,
        script: cell(f.key, b, 'script') && +cell(f.key, b, 'script').median.toFixed(1),
        paint: cell(f.key, b, 'paint') && +cell(f.key, b, 'paint').median.toFixed(1),
      }])
    ),
  }
}

console.log('')
console.log('  SCRIPT / PAINT split (ms, median) — from the harness CDP trace')
console.log('  ' + '-'.repeat(96))
console.log('  ' + pad('benchmark', 14) + FRAMEWORKS.map(f => lp(f.label, 26)).join(''))
console.log('  ' + '-'.repeat(96))
for (const b of ORDER) {
  const parts = FRAMEWORKS.map(f => {
    const s = cell(f.key, b, 'script')
    const p = cell(f.key, b, 'paint')
    return s && p ? `script ${f1(s.median)} / paint ${f1(p.median)}` : '—'
  })
  if (parts.every(p => p === '—')) continue
  console.log('  ' + pad(LABELS[b], 14) + parts.map(p => lp(p, 26)).join(''))
}
console.log('')

const envPath = join(ROOT, 'bench-results', 'environment.json')
if (existsSync(envPath)) rollup.environment = JSON.parse(readFileSync(envPath, 'utf8'))
writeFileSync(join(ROOT, 'bench-results', 'harness-summary.json'), JSON.stringify(rollup, null, 2) + '\n')
console.log('  wrote bench-results/harness-summary.json')
