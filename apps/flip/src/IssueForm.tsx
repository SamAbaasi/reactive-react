import { useState } from 'react'
import type { Priority } from './types'

interface Props {
  onAdd: (title: string, priority: Priority) => void
}

const PRIORITIES: Priority[] = ['low', 'medium', 'high']

export function IssueForm({ onAdd }: Props) {
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [touched, setTouched] = useState(false)

  const trimmed = title.trim()
  const tooShort = trimmed.length < 3
  const tooLong = trimmed.length > 60
  const error = tooShort ? 'Title must be at least 3 characters' : tooLong ? 'Title must be 60 characters or fewer' : null
  const showError = touched && error !== null

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (error !== null) return
    onAdd(trimmed, priority)
    setTitle('')
    setPriority('medium')
    setTouched(false)
  }

  return (
    <form className="issue-form" onSubmit={submit}>
      <label className="field">
        <span className="label">Title</span>
        <input
          className={showError ? 'input invalid' : 'input'}
          value={title}
          placeholder="Something to fix"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => setTouched(true)}
        />
      </label>

      <label className="field">
        <span className="label">Priority</span>
        <select
          className="input"
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>

      {showError && <p className="error">{error}</p>}

      <p className="counter">{trimmed.length} / 60 characters</p>

      <button className="primary" type="submit" disabled={error !== null && touched}>
        Add issue
      </button>
    </form>
  )
}
