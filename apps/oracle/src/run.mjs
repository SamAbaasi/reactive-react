#!/usr/bin/env node
// Differential tester. Runs identical operation sequences against React 19 and
// @rrjs/renderer and diffs the resulting DOM after every step.
//
//   node src/run.mjs                 regression seeds + default exploration
//   node src/run.mjs --explore 200   more exploration
//   node src/run.mjs --seed 12345    one seed, verbose
//
// Every divergence it finds is by definition a silent failure: a loud one would
// have thrown instead of rendering the wrong thing.

import { JSDOM } from 'jsdom'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeSequence, applyOp } from './model.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SEEDS_FILE = join(HERE, '..', 'seeds', 'regression-seeds.json')

// ── jsdom must exist before React or the renderer are imported ──────────────
const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })
globalThis.window = dom.window
globalThis.document = dom.window.document
// Node 24 defines navigator as a getter-only global; define it rather than assign.
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.Node = dom.window.Node
// jsdom does not always expose MessageChannel; Node has had a global one since
// v15, so only take jsdom's if it exists. react-compat schedules passive effects
// on it, so it must be a real constructor.
if (typeof dom.window.MessageChannel === 'function') globalThis.MessageChannel = dom.window.MessageChannel
globalThis.requestAnimationFrame = (cb) => dom.window.setTimeout(() => cb(Date.now()), 0)
globalThis.cancelAnimationFrame = (id) => dom.window.clearTimeout(id)
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const React = (await import('react')).default
const { createRoot } = await import('react-dom/client')
const { act } = await import('react')
// The compiled packages emit extensionless relative imports (tsconfig
// moduleResolution: "Bundler"), which Node's ESM loader cannot resolve. Bundlers
// cope; raw Node does not. Recorded as D13. Until that is fixed the oracle
// consumes a pre-bundled build, produced by `npm run build:rrjs`.
const { h, list, unmountNode, createSignal } = await import('../.build/rrjs.mjs')

// ── The app under test, expressed twice ─────────────────────────────────────
// Same tags, same classes, same order, same conditional. If these two ever
// disagree about anything, one of them is wrong.

function ReactApp({ state }) {
  return React.createElement(
    'div',
    { className: 'root', title: state.title },
    React.createElement(
      'ul',
      null,
      state.items.map((item) =>
        React.createElement(
          'li',
          { key: item.id, className: item.flag ? 'on' : 'off' },
          React.createElement('span', { className: 'label' }, item.label),
          item.flag ? React.createElement('em', null, 'YES') : null
        )
      )
    )
  )
}

function mountRr(container, getState) {
  const node = h(
    'div',
    { class: 'root', title: () => getState().title },
    h(
      'ul',
      null,
      list(
        () => getState().items,
        (item) => item.id,
        (item) =>
          h(
            'li',
            { class: () => (item.flag ? 'on' : 'off') },
            h('span', { class: 'label' }, () => item.label),
            () => (item.flag ? h('em', null, 'YES') : null)
          )
      )
    )
  )
  container.appendChild(node)
}

// ── Normalisation ───────────────────────────────────────────────────────────
// Only two differences are treated as benign, and both are recorded here rather
// than silently swallowed:
//   1. rrjs `list()` leaves a comment anchor node in the DOM.
//   2. React writes class="" where rrjs omits the attribute entirely.
//   3. rrjs leaves an empty text node where a conditional child renders nothing.
// All three are recorded as defects. Everything else counts as a divergence.

function canonical(node) {
  // 3. A conditional child that renders nothing leaves an EMPTY TEXT NODE in
  //    rrjs, where React removes the node entirely. appendChild's reactive path
  //    always creates a placeholder text node (renderer/src/index.ts:215).
  //    Recorded as D14. Normalised here because it fires on every sequence and
  //    would mask every other divergence.
  if (node.nodeType === 3) {
    return node.textContent === '' ? null : JSON.stringify(node.textContent)
  }
  if (node.nodeType === 8) return null // comment anchor — benign
  if (node.nodeType !== 1) return null
  const tag = node.tagName.toLowerCase()
  const attrs = Array.from(node.attributes)
    .filter((a) => !(a.name === 'class' && a.value === '')) // benign
    .map((a) => `${a.name}=${JSON.stringify(a.value)}`)
    .sort()
  const kids = Array.from(node.childNodes).map(canonical).filter((x) => x !== null)
  return `${tag}[${attrs.join(' ')}](${kids.join(',')})`
}

function serialise(container) {
  return Array.from(container.childNodes).map(canonical).filter((x) => x !== null).join('')
}

// ── One sequence, both implementations ──────────────────────────────────────

async function runSequence(seed, opts = {}) {
  const { start, ops, rand } = makeSequence(seed, opts)

  const reactHost = document.createElement('div')
  document.body.appendChild(reactHost)
  const root = createRoot(reactHost)

  const rrHost = document.createElement('div')
  document.body.appendChild(rrHost)
  const [rrState, setRrState] = createSignal(start)
  mountRr(rrHost, rrState)

  await act(async () => { root.render(React.createElement(ReactApp, { state: start })) })

  const divergences = []
  const check = (step, op) => {
    const a = serialise(reactHost)
    const b = serialise(rrHost)
    if (a !== b) divergences.push({ step, op, react: a, rrjs: b })
  }
  check(0, 'initial')

  let state = start
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]
    state = applyOp(state, op, rand)
    await act(async () => { root.render(React.createElement(ReactApp, { state })) })
    setRrState(state)
    check(i + 1, op)
    if (divergences.length) break // first divergence is the interesting one
  }

  await act(async () => { root.unmount() })
  unmountNode(rrHost)
  reactHost.remove()

  return divergences
}

// ── Reporting helpers ───────────────────────────────────────────────────────

function firstDifference(a, b) {
  const n = Math.min(a.length, b.length)
  let i = 0
  while (i < n && a[i] === b[i]) i++
  const from = Math.max(0, i - 40)
  return {
    at: i,
    react: a.slice(from, i + 60),
    rrjs: b.slice(from, i + 60),
  }
}

function loadSeeds() {
  if (!existsSync(SEEDS_FILE)) return { seeds: [], note: '' }
  return JSON.parse(readFileSync(SEEDS_FILE, 'utf8'))
}

function saveSeeds(data) {
  writeFileSync(SEEDS_FILE, JSON.stringify(data, null, 2) + '\n')
}

// ── Main ────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2)
const arg = (name, dflt) => {
  const i = argv.indexOf('--' + name)
  return i === -1 ? dflt : argv[i + 1]
}
const EXPLORE = Number(arg('explore', 100))
const SINGLE = arg('seed', null)
const LENGTH = Number(arg('length', 25))
const ITEMS = Number(arg('items', 10))
const PROMOTE = argv.includes('--promote')

if (SINGLE !== null) {
  const seed = Number(SINGLE)
  const d = await runSequence(seed, { length: LENGTH, initialItems: ITEMS })
  console.log(`seed ${seed}: ${d.length ? 'DIVERGED' : 'ok'}`)
  for (const x of d) {
    const diff = firstDifference(x.react, x.rrjs)
    console.log(`  step ${x.step} after "${x.op}", first difference at char ${diff.at}`)
    console.log(`    React: ...${diff.react}`)
    console.log(`    rrjs : ...${diff.rrjs}`)
  }
  process.exit(d.length ? 1 : 0)
}

const store = loadSeeds()
const regression = store.seeds ?? []

let regressionFailures = []
for (const entry of regression) {
  const d = await runSequence(entry.seed, { length: entry.length ?? LENGTH, initialItems: entry.items ?? ITEMS })
  if (d.length) regressionFailures.push({ entry, d })
}

const found = []
for (let i = 0; i < EXPLORE; i++) {
  const seed = (Date.now() ^ (i * 2654435761)) >>> 0
  const d = await runSequence(seed, { length: LENGTH, initialItems: ITEMS })
  if (d.length) found.push({ seed, d })
}

console.log('')
console.log(`  regression seeds: ${regression.length - regressionFailures.length}/${regression.length} pass`)
console.log(`  exploration:      ${EXPLORE} sequences, ${found.length} divergent`)

for (const f of regressionFailures) {
  console.log(`\n  REGRESSION FAIL seed ${f.entry.seed} (${f.entry.note ?? 'no note'})`)
  const x = f.d[0]
  const diff = firstDifference(x.react, x.rrjs)
  console.log(`    step ${x.step} after "${x.op}"`)
  console.log(`      React: ...${diff.react}`)
  console.log(`      rrjs : ...${diff.rrjs}`)
}

for (const f of found.slice(0, 5)) {
  const x = f.d[0]
  const diff = firstDifference(x.react, x.rrjs)
  console.log(`\n  NEW DIVERGENCE seed ${f.seed}, step ${x.step} after "${x.op}"`)
  console.log(`      React: ...${diff.react}`)
  console.log(`      rrjs : ...${diff.rrjs}`)
}

if (PROMOTE && found.length) {
  for (const f of found) {
    regression.push({ seed: f.seed, length: LENGTH, items: ITEMS, note: `auto-promoted: diverged after "${f.d[0].op}"` })
  }
  saveSeeds({ ...store, seeds: regression })
  console.log(`\n  promoted ${found.length} seed(s) into the regression set`)
}

const ok = regressionFailures.length === 0 && found.length === 0
console.log('')
console.log(
  `ORACLE: regression ${regression.length - regressionFailures.length}/${regression.length}, ` +
  `explored ${EXPLORE}, divergences ${regressionFailures.length + found.length} — ${ok ? 'PASS' : 'FAIL'}`
)
process.exit(ok ? 0 : 1)
