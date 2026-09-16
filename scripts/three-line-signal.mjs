#!/usr/bin/env node
// "Building a signal from 3 lines of code" — what is the smallest HONEST version?
//
// Honest here means: it must actually work for the demo it is used in. Each
// candidate below is run against the same acceptance test. A candidate that fails
// any assertion is not a signal, however short it is.
//
// Run: node scripts/three-line-signal.mjs

const candidates = []

// ── 3 lines: tracking + effect. No batching, no cleanup, no same-value bailout.
candidates.push({
  lines: 3,
  name: '3 lines — tracking + effect',
  src: `
let observer
const signal = v => [() => (observer && subs(v).add(observer), value(v)), n => (set(v, n), subs(v).forEach(f => f()))]
const effect = f => { observer = f; f(); observer = null }
`,
  // The one-liner above needs helper state; the honest formulation is below.
  factory: () => {
    let observer
    const createSignal = (value) => { const subs = new Set(); return [() => (observer && subs.add(observer), value), (n) => { value = n; subs.forEach(f => f()) }] }
    const effect = (f) => { observer = f; f(); observer = null }
    return { createSignal, effect }
  },
  realLines: 3,
})

// ── 5 lines: adds a same-value bailout, which the demo needs the moment you
//    set the same value twice and ask "why did it run again?"
candidates.push({
  lines: 5,
  name: '5 lines — + same-value bailout',
  factory: () => {
    let observer
    const createSignal = (value) => {
      const subs = new Set()
      return [() => (observer && subs.add(observer), value), (n) => { if (Object.is(n, value)) return; value = n; subs.forEach(f => f()) }]
    }
    const effect = (f) => { observer = f; f(); observer = null }
    return { createSignal, effect }
  },
  realLines: 5,
})

// ── 8 lines: adds dependency cleanup, so conditional dependencies work.
candidates.push({
  lines: 8,
  name: '8 lines — + conditional dependencies',
  factory: () => {
    let observer = null
    const createSignal = (value) => {
      const subs = new Set()
      const get = () => { if (observer) { subs.add(observer); observer.deps.push(subs) } return value }
      const set = (n) => { if (Object.is(n, value)) return; value = n; [...subs].forEach(s => s.run()) }
      return [get, set]
    }
    const effect = (fn) => {
      const s = { deps: [], run: () => { s.deps.forEach(d => d.delete(s)); s.deps = []; const p = observer; observer = s; try { fn() } finally { observer = p } } }
      s.run()
    }
    return { createSignal, effect }
  },
  realLines: 8,
})

// ── Acceptance test every candidate must pass to be called "a signal".
function accept({ createSignal, effect }) {
  const failures = []
  const check = (label, cond) => { if (!cond) failures.push(label) }

  // 1. reads the current value
  const [a, setA] = createSignal(1)
  check('reads initial value', a() === 1)
  setA(2)
  check('reads updated value', a() === 2)

  // 2. an effect re-runs when a signal it read changes
  const seen = []
  effect(() => seen.push(a()))
  check('effect runs once immediately', seen.length === 1 && seen[0] === 2)
  setA(3)
  check('effect re-runs on change', seen.length === 2 && seen[1] === 3)

  // 3. two effects on the same signal both run
  const other = []
  effect(() => other.push(a()))
  setA(4)
  check('multiple subscribers', other.length === 2 && seen.length === 3)

  // 4. an effect that reads two signals is subscribed to both
  const [b, setB] = createSignal('x')
  const both = []
  effect(() => both.push(a() + b()))
  const n0 = both.length
  setB('y')
  check('subscribes to every signal read', both.length === n0 + 1)

  return failures
}

// ── Extra properties the real library has, checked but not required for a demo.
function extras({ createSignal, effect }) {
  const out = {}
  const [a, setA] = createSignal(1)
  const seen = []
  effect(() => seen.push(a()))
  const before = seen.length
  setA(1)
  out.sameValueBailout = seen.length === before

  const [flag, setFlag] = createSignal(true)
  const [x, setX] = createSignal(1)
  let runs = 0
  effect(() => { runs++; if (flag()) x() })
  setFlag(false)
  const afterFlag = runs
  setX(99)
  out.conditionalDeps = runs === afterFlag
  return out
}

console.log('\n  smallest honest createSignal\n  ' + '-'.repeat(70))
for (const c of candidates) {
  let failures, ex
  try {
    failures = accept(c.factory())
    ex = extras(c.factory())
  } catch (e) {
    failures = ['THREW: ' + e.message]
    ex = {}
  }
  const verdict = failures.length === 0 ? 'PASSES' : 'FAILS'
  console.log(`  ${String(c.realLines).padStart(2)} lines  ${verdict.padEnd(7)} ${c.name}`)
  if (failures.length) for (const f of failures) console.log(`            - ${f}`)
  console.log(`            same-value bailout: ${ex.sameValueBailout ?? '?'} | conditional deps: ${ex.conditionalDeps ?? '?'}`)
}

// ── What the real library actually costs, for comparison.
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const src = readFileSync(join(ROOT, 'packages', 'signals', 'src', 'index.ts'), 'utf8')
const code = src.split('\n').filter(l => {
  const t = l.trim()
  return t && !t.startsWith('//')
})
console.log('  ' + '-'.repeat(70))
console.log(`  @rrjs/signals src/index.ts: ${src.split('\n').length} lines total, ${code.length} non-comment non-blank`)
console.log('')
