import { h, mount, list } from '@reactive-react/renderer'
import { createSignal, batch } from '@reactive-react/signals'
// ─── Diagnostic: count DOM writes per state change ──────────────────────────
let mutationCount = 0
const _origSetAttribute = Element.prototype.setAttribute
const _origRemoveAttribute = Element.prototype.removeAttribute

Element.prototype.setAttribute = function (name, value) {
  mutationCount++
  return _origSetAttribute.call(this, name, value)
}
Element.prototype.removeAttribute = function (name) {
  mutationCount++
  return _origRemoveAttribute.call(this, name)
}

// Also count className assignments
const _classNameDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'className')!
Object.defineProperty(Element.prototype, 'className', {
  configurable: true,
  get() { return _classNameDescriptor.get!.call(this) },
  set(value) { mutationCount++; _classNameDescriptor.set!.call(this, value) },
})

;(window as any).countMutations = (action: () => void): number => {
  mutationCount = 0
  action()
  return mutationCount
}

;(globalThis as any).h = h

// ─── Random data generator (identical across all js-framework-benchmark entries) ──

const A = ['pretty', 'large', 'big', 'small', 'tall', 'short', 'long', 'handsome', 'plain', 'quaint', 'clean', 'elegant', 'easy', 'angry', 'crazy', 'helpful', 'mushy', 'odd', 'unsightly', 'adorable', 'important', 'inexpensive', 'cheap', 'expensive', 'fancy']
const C = ['red', 'yellow', 'blue', 'green', 'pink', 'brown', 'purple', 'brown', 'white', 'black', 'orange']
const N = ['table', 'chair', 'house', 'bbq', 'desk', 'car', 'pony', 'cookie', 'sandwich', 'burger', 'pizza', 'mouse', 'keyboard']

let nextId = 1

function _random(max: number): number {
  return Math.round(Math.random() * 1000) % max
}

interface Row {
  id: number
  label: string
}

function buildData(count: number): Row[] {
  const data: Row[] = new Array(count)
  for (let i = 0; i < count; i++) {
    data[i] = {
      id: nextId++,
      label: `${A[_random(A.length)]} ${C[_random(C.length)]} ${N[_random(N.length)]}`,
    }
  }
  return data
}

// ─── State ──────────────────────────────────────────────────────────────────

const [rows, setRows] = createSignal<Row[]>([])
const [selected, setSelected] = createSignal<number>(-1)

// ─── Actions (the eight standard tests) ─────────────────────────────────────

function run() {
  setRows(buildData(1000))
  setSelected(-1)
}

function runLots() {
  setRows(buildData(10000))
  setSelected(-1)
}

function add() {
  setRows([...rows(), ...buildData(1000)])
}

function update() {
  const data = rows()
  // Update every 10th row's label (append " !!!")
  // We must create a new array because the list reconciler compares by identity
  const next = data.slice()
  for (let i = 0; i < next.length; i += 10) {
    next[i] = { id: next[i].id, label: next[i].label + ' !!!' }
  }
  setRows(next)
}

function clear() {
  setRows([])
  setSelected(-1)
}

function swapRows() {
  const data = rows()
  if (data.length <= 998) return
  const next = data.slice()
  const tmp = next[1]
  next[1] = next[998]
  next[998] = tmp
  setRows(next)
}

function select(id: number) {
  setSelected(id)
}

function deleteRow(id: number) {
  setRows(rows().filter((r) => r.id !== id))
}

// ─── Main UI: action buttons ────────────────────────────────────────────────

function ButtonRow() {
  return (
    <div class="row">
      <div class="col-sm-6 smallpad">
        <button type="button" class="btn btn-primary btn-block" id="run" onClick={run}>Create 1,000 rows</button>
      </div>
      <div class="col-sm-6 smallpad">
        <button type="button" class="btn btn-primary btn-block" id="runlots" onClick={runLots}>Create 10,000 rows</button>
      </div>
      <div class="col-sm-6 smallpad">
        <button type="button" class="btn btn-primary btn-block" id="add" onClick={add}>Append 1,000 rows</button>
      </div>
      <div class="col-sm-6 smallpad">
        <button type="button" class="btn btn-primary btn-block" id="update" onClick={update}>Update every 10th row</button>
      </div>
      <div class="col-sm-6 smallpad">
        <button type="button" class="btn btn-primary btn-block" id="clear" onClick={clear}>Clear</button>
      </div>
      <div class="col-sm-6 smallpad">
        <button type="button" class="btn btn-primary btn-block" id="swaprows" onClick={swapRows}>Swap rows</button>
      </div>
    </div>
  )
}

// ─── Rendered into the existing #app container ──────────────────────────────

mount(ButtonRow as any, document.getElementById('app')!)

// ─── Row list — mounted directly into #tbody, NOT through a component ───────
// The benchmark harness expects rows as direct children of <tbody id="tbody">.
// We render the list straight into tbody using the renderer's list() primitive.
// This is a low-level integration — no wrapping component, no extra DOM layers.

const tbody = document.getElementById('tbody')!

const rowList = list(
  rows,
  (row: Row) => row.id,
  (row: Row) => (
    <tr class={() => (selected() === row.id ? 'danger' : '')}>
      <td class="col-md-1">{row.id}</td>
      <td class="col-md-4">
        <a onClick={() => select(row.id)}>{row.label}</a>
      </td>
      <td class="col-md-1">
        <a onClick={() => deleteRow(row.id)}>
          <span class="glyphicon glyphicon-remove" aria-hidden="true"></span>
        </a>
      </td>
      <td class="col-md-6"></td>
    </tr>
  )
)

tbody.appendChild(rowList)


// ─── Manual benchmark harness ───────────────────────────────────────────────
// Run from the browser console: await window.bench.run()
// Each test is measured 10 times; median is reported.

interface Result {
  test: string
  median: number
  min: number
  max: number
  all: number[]
}

async function measure(label: string, action: () => void, iterations = 10): Promise<Result> {
  const times: number[] = []

  for (let i = 0; i < iterations; i++) {
    // Setup state for this iteration without measuring
    if (label === 'create 1k' || label === 'replace 1k') {
      setRows([])
    } else if (label === 'create lots') {
      setRows([])
    } else if (label === 'append 1k') {
      setRows(buildData(1000))
    } else {
      setRows(buildData(1000))
    }
    // Let the setup settle
    await new Promise<void>(r => requestAnimationFrame(() => r()))
    await new Promise<void>(r => setTimeout(r, 50))

    // Measure: from action start to next paint
    // We use rAF + postMessage to detect the frame after action completes
    const t0 = performance.now()
    action()

    // Wait for the synchronous + microtask + macrotask work to settle
    // and the browser to paint. We measure up to AND INCLUDING paint.
    await new Promise<void>(r => requestAnimationFrame(() => r()))

    const t1 = performance.now()
    times.push(t1 - t0)
  }

  times.sort((a, b) => a - b)
  const median = times[Math.floor(times.length / 2)]
  return { test: label, median, min: times[0], max: times[times.length - 1], all: times }
}

;(window as any).bench = {
  async run() {
    console.log('Starting benchmark — this takes about 60 seconds...')

    const results: Result[] = []

    results.push(await measure('create 1k',     () => { setRows(buildData(1000)) }))
    results.push(await measure('replace 1k',    () => { setRows(buildData(1000)) }))
    results.push(await measure('update 10th',   () => {
      const next = rows().slice()
      for (let i = 0; i < next.length; i += 10) {
        next[i] = { id: next[i].id, label: next[i].label + ' !!!' }
      }
      setRows(next)
    }))
    results.push(await measure('swap rows',     () => {
      const next = rows().slice()
      const tmp = next[1]; next[1] = next[998]; next[998] = tmp
      setRows(next)
    }))
    results.push(await measure('select row',    () => { setSelected(rows()[500].id) }))
    results.push(await measure('remove row',    () => { setRows(rows().filter(r => r.id !== rows()[500].id)) }))
    results.push(await measure('create lots',   () => { setRows(buildData(10000)) }, 3))
    results.push(await measure('append 1k',     () => { setRows([...rows(), ...buildData(1000)]) }))

    console.log('\n=== Reactive React benchmark results ===')
    console.table(results.map(r => ({
      test: r.test,
      median_ms: r.median.toFixed(2),
      min_ms: r.min.toFixed(2),
      max_ms: r.max.toFixed(2),
    })))

    console.log('\nRaw timings:')
    for (const r of results) {
      console.log(r.test, r.all.map(t => t.toFixed(1)).join(', '))
    }

    return results
  },
}

console.log('Benchmark ready. Run: await window.bench.run()')