import { useState } from 'react'
import type { Issue } from './types'
import { useTheme } from './ThemeContext'

export function Stats({ issues }: { issues: Issue[] }) {
  const [count, setCount] = useState(0)
  const theme = useTheme()

  const done = issues.filter((i) => i.done).length
  const open = issues.length - done
  const high = issues.filter((i) => i.priority === 'high' && !i.done).length

  // Built as a variable rather than inline, which is how React's own docs
  // introduce list rendering.
  const rows = [
    { label: 'Total', value: issues.length },
    { label: 'Open', value: open },
    { label: 'Done', value: done },
    { label: 'High priority, still open', value: high },
  ].map((row) => (
    <tr key={row.label}>
      <td className="stat-label">{row.label}</td>
      <td className="stat-value">{row.value}</td>
    </tr>
  ))

  return (
    <section className={`stats theme-${theme.name}`}>
      <table className="stats-table">
        <tbody>{rows}</tbody>
      </table>

      {open === 0 ? (
        <p className="all-clear">Everything is done. Signed in as {theme.user}.</p>
      ) : (
        <p className="remaining">{open} still open.</p>
      )}

      <div className="counter-demo">
        <p>
          Clicks: <span className="click-count">{count}</span>
        </p>
        <button className="secondary" onClick={() => setCount(count + 1)}>
          Increment by reading state
        </button>
        <button className="secondary" onClick={() => setCount((c) => c + 1)}>
          Increment with an updater
        </button>
      </div>
    </section>
  )
}
