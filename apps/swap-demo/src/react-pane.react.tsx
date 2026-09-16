import { useState, useEffect, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { swapped, type Row } from './data'

// The row markup here is character-for-character the same as rr-pane.rr.tsx,
// apart from reading `rows` / `selected` as plain values instead of calling them
// as signals. Any other difference would make the comparison meaningless — the
// "Compare DOM" button in the UI checks this claim against the live DOM.

interface TableProps {
  initial: Row[]
  register: (swap: () => void) => void
}

function Table({ initial, register }: TableProps) {
  const [rows, setRows] = useState<Row[]>(initial)
  const [selected, setSelected] = useState<number>(-1)

  useEffect(() => {
    register(() => setRows(current => swapped(current)))
  }, [register])

  const remove = (id: number) => setRows(current => current.filter(r => r.id !== id))

  return (
    <table className="table table-hover table-striped test-data">
      <tbody>
        {rows.map(row => (
          <tr key={row.id} className={selected === row.id ? 'danger' : ''}>
            <td className="col-md-1">{row.id}</td>
            <td className="col-md-4">
              <a onClick={() => setSelected(row.id)}>{row.label}</a>
            </td>
            <td className="col-md-1">
              <a onClick={() => remove(row.id)}>
                <span className="glyphicon glyphicon-remove" aria-hidden="true"></span>
              </a>
            </td>
            <td className="col-md-6"></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function mountReactPane(container: HTMLElement, initial: Row[]): Promise<() => void> {
  return new Promise(resolve => {
    let swapFn: (() => void) | null = null
    const register = (fn: () => void) => {
      swapFn = fn
      resolve(() => swapFn!())
    }
    // No StrictMode: it double-invokes render in development and would make the
    // React pane do twice the work of the signals pane. Deliberately unfair the
    // other way, so we leave it off.
    void StrictMode
    createRoot(container).render(<Table initial={initial} register={register} />)
  })
}
