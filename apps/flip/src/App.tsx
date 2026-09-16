import { useState, useEffect } from 'react'
import type { Issue, Priority, Route } from './types'
import { ThemeProvider, useTheme } from './ThemeContext'
import { IssueList } from './IssueList'
import { IssueForm } from './IssueForm'
import { Stats } from './Stats'

const SEED: Issue[] = [
  { id: 1, title: 'Reconciler drops the last row', priority: 'high', done: false },
  { id: 2, title: 'Docs still mention the old API', priority: 'low', done: false },
  { id: 3, title: 'Flaky test in the scheduler suite', priority: 'medium', done: true },
  { id: 4, title: 'Bundle size regressed by 3 kB', priority: 'medium', done: false },
]

function routeFromHash(): Route {
  const hash = window.location.hash.replace('#/', '')
  if (hash === 'new' || hash === 'stats') return hash
  return 'board'
}

function Shell() {
  const [route, setRoute] = useState<Route>(routeFromHash())
  const [issues, setIssues] = useState<Issue[]>(SEED)
  const theme = useTheme()

  useEffect(() => {
    function onHashChange() {
      setRoute(routeFromHash())
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    const openCount = issues.filter((i) => !i.done).length
    document.title = openCount > 0 ? `(${openCount}) Issues` : 'Issues'
  }, [issues])

  function addIssue(title: string, priority: Priority) {
    const nextId = issues.reduce((max, i) => Math.max(max, i.id), 0) + 1
    setIssues([...issues, { id: nextId, title, priority, done: false }])
    window.location.hash = '#/board'
  }

  function toggleIssue(id: number) {
    setIssues(issues.map((i) => (i.id === id ? { ...i, done: !i.done } : i)))
  }

  function deleteIssue(id: number) {
    setIssues(issues.filter((i) => i.id !== id))
  }

  function renameIssue(id: number, title: string) {
    setIssues(issues.map((i) => (i.id === id ? { ...i, title } : i)))
  }

  function moveIssue(id: number, direction: -1 | 1) {
    const index = issues.findIndex((i) => i.id === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= issues.length) return
    const next = issues.slice()
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    setIssues(next)
  }

  return (
    <div className={`app theme-${theme.name}`}>
      <header className="topbar">
        <h1 className="brand">Issues</h1>

        <nav className="nav">
          <a className={route === 'board' ? 'tab active' : 'tab'} href="#/board">
            Board
          </a>
          <a className={route === 'new' ? 'tab active' : 'tab'} href="#/new">
            New
          </a>
          <a className={route === 'stats' ? 'tab active' : 'tab'} href="#/stats">
            Stats
          </a>
        </nav>

        <button className="secondary" onClick={theme.toggle}>
          {theme.name === 'light' ? 'Dark' : 'Light'} theme
        </button>
      </header>

      <main className="content">
        {route === 'board' && (
          <IssueList
            issues={issues}
            onToggle={toggleIssue}
            onDelete={deleteIssue}
            onRename={renameIssue}
            onMove={moveIssue}
          />
        )}

        {route === 'new' && <IssueForm onAdd={addIssue} />}

        {route === 'stats' && <Stats issues={issues} />}
      </main>

      <footer className="footer">
        Signed in as {theme.user} · {issues.length} issues
      </footer>
    </div>
  )
}

export function App() {
  return (
    <ThemeProvider>
      <Shell />
    </ThemeProvider>
  )
}
