import { useState } from 'react'

let executions = 0

function isVisible(value: number) {
  return value > 0
}

export function RunOnce() {
  executions++
  const [count, setCount] = useState(0)
  const [rows, setRows] = useState([
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ])
  const doubled = count * 2
  const size = doubled >= 6 ? 'large' : 'small'
  const visible = isVisible(count)
  const details: any = visible ? { label: `ready ${count}` } : null

  return (
    <>
      <main className="app">
        <h1>Run-once compiler</h1>
        <p>Component body executions: <output id="executions">{executions}</output></p>
        <p>Count: <output id="count">{count}</output></p>
        <p>Doubled: <output id="doubled">{doubled}</output> ({size})</p>
        <button id="increment" onClick={() => setCount(count + 1)}>Increment</button>
        <button id="snapshot" onClick={() => { setCount(count + 1); setCount(count + 1) }}>Two updates from one snapshot</button>
        <button id="reset" onClick={() => setCount(0)}>Reset</button>
        <section id="phase2-branch">
          {visible ? <>
            <label>Type here, then increment again: {count >= 2
              ? <input id="retained-input" placeholder="two-plus" />
              : <input id="retained-input" placeholder="one" />}
            </label>
            <strong id="safe-read">{details.label}</strong>
            {count >= 2 ? <em id="nested-branch">nested {details.label}</em> : null}
          </> : <p id="inactive-branch">Increment to show the input.</p>}
        </section>
        <section id="phase5-list">
          <button id="list-append" onClick={() => setRows(previous => [...previous, { id: 'c', label: 'C' }])}>Append row</button>
          <button id="list-reverse" onClick={() => setRows(previous => previous.toReversed())}>Reverse rows</button>
          <ul>{rows.map((row, index) => <li key={row.id} data-index={index}>
            <input id={`row-${row.id}`} defaultValue={row.label} />
            <span>{row.label}</span>
          </li>)}</ul>
        </section>
      </main>
      <footer id="root-range-tail">root range tail</footer>
    </>
  )
}
