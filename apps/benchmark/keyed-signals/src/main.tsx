// Reactive React — signal-optimised adapter.
//
// Same DOM, same tests, same data generator as the idiomatic adapter. The one
// difference is where the row's label lives: here each row carries its own
// signal, so `update every 10th row` sets 100 signals directly instead of
// rebuilding the array and reconciling 1,000 keys.
//
// This is a first-class pattern in the library, but it is NOT the idiomatic
// React translation, and the difference between this file and ../../keyed-idiomatic
// is exactly the cost of writing React-shaped code on this renderer. Both are
// measured; neither is presented as "the" number.
//
// Everything except UPDATE is deliberately identical to the idiomatic adapter,
// so the two are comparable test by test.

import { h, list, mount } from '@rrjs/renderer'
import { createSignal, batch } from '@rrjs/signals'

void h
void list

const random = (max: number) => Math.round(Math.random() * 1000) % max

const A = ['pretty', 'large', 'big', 'small', 'tall', 'short', 'long', 'handsome', 'plain', 'quaint', 'clean',
  'elegant', 'easy', 'angry', 'crazy', 'helpful', 'mushy', 'odd', 'unsightly', 'adorable', 'important', 'inexpensive',
  'cheap', 'expensive', 'fancy']
const C = ['red', 'yellow', 'blue', 'green', 'pink', 'brown', 'purple', 'brown', 'white', 'black', 'orange']
const N = ['table', 'chair', 'house', 'bbq', 'desk', 'car', 'pony', 'cookie', 'sandwich', 'burger', 'pizza', 'mouse',
  'keyboard']

let nextId = 1

// The row's label is a signal, not a string. That is the whole optimisation.
interface Row {
  id: number
  label: () => string
  setLabel: (next: string) => void
}

function buildData(count: number): Row[] {
  const data: Row[] = new Array(count)
  for (let i = 0; i < count; i++) {
    const [label, setLabel] = createSignal(
      `${A[random(A.length)]} ${C[random(C.length)]} ${N[random(N.length)]}`
    )
    data[i] = { id: nextId++, label, setLabel }
  }
  return data
}

const [rows, setRows] = createSignal<Row[]>([])
const [selected, setSelected] = createSignal<number>(0)

const run = () => { setRows(buildData(1000)); setSelected(0) }
const runLots = () => { setRows(buildData(10000)); setSelected(0) }
const add = () => setRows(rows().concat(buildData(1000)))
const clear = () => { setRows([]); setSelected(0) }

// The point of the signal adapter: touch 100 signals, leave the array and the
// reconciler alone entirely.
function update() {
  const data = rows()
  batch(() => {
    for (let i = 0; i < data.length; i += 10) {
      data[i].setLabel(data[i].label() + ' !!!')
    }
  })
}

function swapRows() {
  const data = rows()
  if (data.length > 998) {
    const next = [...data]
    const d1 = next[1]
    next[1] = next[998]
    next[998] = d1
    setRows(next)
  }
}

const remove = (id: number) => {
  const data = rows()
  const idx = data.findIndex(d => d.id === id)
  setRows([...data.slice(0, idx), ...data.slice(idx + 1)])
}

function Main() {
  return (
    <div className="container">
      <div className="jumbotron">
        <div className="row">
          <div className="col-md-6"><h1>Reactive React signals keyed</h1></div>
          <div className="col-md-6">
            <div className="row">
              <div className="col-sm-6 smallpad">
                <button type="button" className="btn btn-primary btn-block" id="run" onClick={run}>Create 1,000 rows</button>
              </div>
              <div className="col-sm-6 smallpad">
                <button type="button" className="btn btn-primary btn-block" id="runlots" onClick={runLots}>Create 10,000 rows</button>
              </div>
              <div className="col-sm-6 smallpad">
                <button type="button" className="btn btn-primary btn-block" id="add" onClick={add}>Append 1,000 rows</button>
              </div>
              <div className="col-sm-6 smallpad">
                <button type="button" className="btn btn-primary btn-block" id="update" onClick={update}>Update every 10th row</button>
              </div>
              <div className="col-sm-6 smallpad">
                <button type="button" className="btn btn-primary btn-block" id="clear" onClick={clear}>Clear</button>
              </div>
              <div className="col-sm-6 smallpad">
                <button type="button" className="btn btn-primary btn-block" id="swaprows" onClick={swapRows}>Swap Rows</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <table className="table table-hover table-striped test-data">
        <tbody>
          {rows().map((item: Row) => (
            <tr key={item.id} className={selected() === item.id ? 'danger' : ''}>
              <td className="col-md-1">{item.id}</td>
              <td className="col-md-4">
                <a onClick={() => setSelected(item.id)}>{item.label}</a>
              </td>
              <td className="col-md-1">
                <a onClick={() => remove(item.id)}>
                  <span className="glyphicon glyphicon-remove" aria-hidden="true"></span>
                </a>
              </td>
              <td className="col-md-6"></td>
            </tr>
          ))}
        </tbody>
      </table>
      <span className="preloadicon glyphicon glyphicon-remove" aria-hidden="true"></span>
    </div>
  )
}

mount(Main as any, document.getElementById('main')!)
