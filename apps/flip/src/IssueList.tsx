import { useState } from 'react'
import type { Issue } from './types'
import { useTheme } from './ThemeContext'

interface Props {
  issues: Issue[]
  onToggle: (id: number) => void
  onDelete: (id: number) => void
  onRename: (id: number, title: string) => void
  onMove: (id: number, direction: -1 | 1) => void
}

export function IssueList({ issues, onToggle, onDelete, onRename, onMove }: Props) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const theme = useTheme()

  function startEdit(issue: Issue) {
    setEditingId(issue.id)
    setDraft(issue.title)
  }

  function commit() {
    if (editingId !== null && draft.trim().length > 0) {
      onRename(editingId, draft.trim())
    }
    setEditingId(null)
  }

  if (issues.length === 0) {
    return <p className="empty">Nothing here yet. Add an issue to get started.</p>
  }

  return (
    <ul className={`issues theme-${theme.name}`}>
      {issues.map((issue, index) => (
        <li key={issue.id} className={issue.done ? 'issue done' : 'issue'}>
          <input
            type="checkbox"
            className="check"
            checked={issue.done}
            onChange={() => onToggle(issue.id)}
          />

          {editingId === issue.id ? (
            <input
              className="edit"
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit()
                if (e.key === 'Escape') setEditingId(null)
              }}
            />
          ) : (
            <span className="title" onDoubleClick={() => startEdit(issue)}>
              {issue.title}
            </span>
          )}

          <span className={`badge badge-${issue.priority}`}>{issue.priority}</span>

          {issue.priority === 'high' && !issue.done && <strong className="flag">!</strong>}

          <span className="controls">
            <button
              className="move"
              disabled={index === 0}
              onClick={() => onMove(issue.id, -1)}
            >
              ↑
            </button>
            <button
              className="move"
              disabled={index === issues.length - 1}
              onClick={() => onMove(issue.id, 1)}
            >
              ↓
            </button>
            <button className="delete" onClick={() => onDelete(issue.id)}>
              ×
            </button>
          </span>
        </li>
      ))}
    </ul>
  )
}
