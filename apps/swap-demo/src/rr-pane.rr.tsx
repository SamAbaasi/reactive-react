// Explicit runtime imports also support the classic compiler configuration.
import { h, list, mount } from '@rrjs/renderer'
import { createSignal } from '@rrjs/signals'
import { swapped, type Row } from './data'

void h
void list

export function mountRrPane(container: HTMLElement, initial: Row[]): () => void {
  const [rows, setRows] = createSignal<Row[]>(initial)
  const [selected, setSelected] = createSignal<number>(-1)

  const remove = (id: number) => setRows(rows().filter(r => r.id !== id))

  function Table() {
    return (
      <table className="table table-hover table-striped test-data">
        <tbody>
          {rows().map(row => (
            <tr key={row.id} className={selected() === row.id ? 'danger' : ''}>
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

  mount(Table as any, container)

  return () => setRows(swapped(rows()))
}
