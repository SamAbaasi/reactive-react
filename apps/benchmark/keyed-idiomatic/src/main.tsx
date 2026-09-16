// Reactive React — idiomatic adapter.
//
// A direct translation of the official keyed/react-hooks reference adapter:
// the same reducer, the same plain {id, label} row objects, the same immutable
// updates, the same keyed .map(). This is what a React developer porting their
// code would actually write.
//
// The only unavoidable divergences from the reference, both forced by the
// architecture rather than chosen for speed:
//
//   1. State is read as `state()`, not `state`. Components run once, so state
//      has to be a getter. This is the documented compatibility break.
//   2. No React.memo and no <Row> component. memo exists to stop a component
//      re-running, and in this architecture components never re-run in the first
//      place, so it has nothing to prevent. Rows are inlined; the emitted DOM is
//      identical to the reference's.
//
// No per-row signals. See ../../keyed-signals for the version that uses them.

import { h, list, mount } from '@rrjs/renderer'
import { useReducer } from '@rrjs/react-compat'

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

interface Row { id: number; label: string }
interface State { data: Row[]; selected: number }

const buildData = (count: number): Row[] => {
  const data: Row[] = new Array(count)
  for (let i = 0; i < count; i++) {
    data[i] = {
      id: nextId++,
      label: `${A[random(A.length)]} ${C[random(C.length)]} ${N[random(N.length)]}`,
    }
  }
  return data
}

const initialState: State = { data: [], selected: 0 }

type Action =
  | { type: 'RUN' } | { type: 'RUN_LOTS' } | { type: 'ADD' } | { type: 'UPDATE' }
  | { type: 'CLEAR' } | { type: 'SWAP_ROWS' }
  | { type: 'REMOVE'; id: number } | { type: 'SELECT'; id: number }

const listReducer = (state: State, action: Action): State => {
  const { data, selected } = state

  switch (action.type) {
    case 'RUN':
      return { data: buildData(1000), selected: 0 }
    case 'RUN_LOTS':
      return { data: buildData(10000), selected: 0 }
    case 'ADD':
      return { data: data.concat(buildData(1000)), selected }
    case 'UPDATE': {
      const newData = data.slice(0)
      for (let i = 0; i < newData.length; i += 10) {
        const r = newData[i]
        newData[i] = { id: r.id, label: r.label + ' !!!' }
      }
      return { data: newData, selected }
    }
    case 'CLEAR':
      return { data: [], selected: 0 }
    case 'SWAP_ROWS': {
      const newdata = [...data]
      if (data.length > 998) {
        const d1 = newdata[1]
        const d998 = newdata[998]
        newdata[1] = d998
        newdata[998] = d1
      }
      return { data: newdata, selected }
    }
    case 'REMOVE': {
      const idx = data.findIndex(d => d.id === action.id)
      return { data: [...data.slice(0, idx), ...data.slice(idx + 1)], selected }
    }
    case 'SELECT':
      return { data, selected: action.id }
    default:
      return state
  }
}

function Main() {
  const [state, dispatch] = useReducer(listReducer, initialState)

  return (
    <div className="container">
      <div className="jumbotron">
        <div className="row">
          <div className="col-md-6"><h1>Reactive React keyed</h1></div>
          <div className="col-md-6">
            <div className="row">
              <div className="col-sm-6 smallpad">
                <button type="button" className="btn btn-primary btn-block" id="run" onClick={() => dispatch({ type: 'RUN' })}>Create 1,000 rows</button>
              </div>
              <div className="col-sm-6 smallpad">
                <button type="button" className="btn btn-primary btn-block" id="runlots" onClick={() => dispatch({ type: 'RUN_LOTS' })}>Create 10,000 rows</button>
              </div>
              <div className="col-sm-6 smallpad">
                <button type="button" className="btn btn-primary btn-block" id="add" onClick={() => dispatch({ type: 'ADD' })}>Append 1,000 rows</button>
              </div>
              <div className="col-sm-6 smallpad">
                <button type="button" className="btn btn-primary btn-block" id="update" onClick={() => dispatch({ type: 'UPDATE' })}>Update every 10th row</button>
              </div>
              <div className="col-sm-6 smallpad">
                <button type="button" className="btn btn-primary btn-block" id="clear" onClick={() => dispatch({ type: 'CLEAR' })}>Clear</button>
              </div>
              <div className="col-sm-6 smallpad">
                <button type="button" className="btn btn-primary btn-block" id="swaprows" onClick={() => dispatch({ type: 'SWAP_ROWS' })}>Swap Rows</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <table className="table table-hover table-striped test-data">
        <tbody>
          {state().data.map((item: Row) => (
            <tr key={item.id} className={state().selected === item.id ? 'danger' : ''}>
              <td className="col-md-1">{item.id}</td>
              <td className="col-md-4">
                <a onClick={() => dispatch({ type: 'SELECT', id: item.id })}>{item.label}</a>
              </td>
              <td className="col-md-1">
                <a onClick={() => dispatch({ type: 'REMOVE', id: item.id })}>
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
