import {
  useState,
  useMemo,
  useEffect,
  useRef,
} from '@rrjs/react-compat'
import { h, list } from '@rrjs/renderer'

interface TodoItemProps {
  todo: Todo
  editingId: () => number | null
  editingText: () => string
  startEditing: (todo: Todo) => void
  commitEdit: () => void
  cancelEdit: () => void
  toggleTodo: (id: number) => void
  removeTodo: (id: number) => void
  handleEditKey: (e: KeyboardEvent) => void
  handleEditInput: (e: Event) => void
}

function TodoItem(props: TodoItemProps) {
  const { todo } = props
  const isEditing = () => props.editingId() === todo.id

  return (
    <li class={() => {
      const c = []
      if (todo.done) c.push('completed')
      if (isEditing()) c.push('editing')
      return c.join(' ')
    }}>
      <div class="view">
        <input class="toggle" type="checkbox" checked={todo.done} onChange={() => props.toggleTodo(todo.id)} />
        <label onDblClick={() => props.startEditing(todo)}>{todo.text}</label>
        <button class="destroy" onClick={() => props.removeTodo(todo.id)} />
      </div>
      <input
        class="edit"
        value={() => (isEditing() ? props.editingText() : todo.text)}
        onInput={props.handleEditInput as any}
        onBlur={props.commitEdit}
        onKeyDown={props.handleEditKey as any}
      />
    </li>
  )
}
interface Todo {
  id: number
  text: string
  done: boolean
}

type Filter = 'all' | 'active' | 'completed'

const STORAGE_KEY = 'reactive-react-todos'

function loadTodos(): Todo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function saveTodos(todos: Todo[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos))
  } catch {}
}

export function App() {
  const [todos, setTodos] = useState<Todo[]>(loadTodos())
  const [filter, setFilter] = useState<Filter>('all')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingText, setEditingText] = useState<string>('')
  const newTodoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    saveTodos(todos())
  }, [todos])

  const activeCount = useMemo(
    () => todos().filter((t) => !t.done).length,
    [todos]
  )

  const completedCount = useMemo(
    () => todos().filter((t) => t.done).length,
    [todos]
  )

  const filteredTodos = useMemo(() => {
    const all = todos()
    const f = filter()
    if (f === 'active') return all.filter((t) => !t.done)
    if (f === 'completed') return all.filter((t) => t.done)
    return all
  }, [todos, filter])

  function addTodo(text: string) {
    if (!text.trim()) return
    setTodos([...todos(), { id: Date.now(), text: text.trim(), done: false }])
  }

  function toggleTodo(id: number) {
    setTodos(todos().map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
  }

  function removeTodo(id: number) {
    setTodos(todos().filter((t) => t.id !== id))
  }

  function startEditing(todo: Todo) {
    setEditingId(todo.id)
    setEditingText(todo.text)
  }

  function commitEdit() {
    const id = editingId()
    if (id === null) return
    const text = editingText().trim()
    if (!text) {
      removeTodo(id)
    } else {
      setTodos(todos().map((t) => (t.id === id ? { ...t, text } : t)))
    }
    setEditingId(null)
    setEditingText('')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditingText('')
  }

  function toggleAll() {
    const allDone = todos().every((t) => t.done)
    setTodos(todos().map((t) => ({ ...t, done: !allDone })))
  }

  function clearCompleted() {
    setTodos(todos().filter((t) => !t.done))
  }

  function handleNewTodoKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && newTodoRef.current) {
      addTodo(newTodoRef.current.value)
      newTodoRef.current.value = ''
    }
  }

  function handleEditKey(e: KeyboardEvent) {
    if (e.key === 'Enter') commitEdit()
    else if (e.key === 'Escape') cancelEdit()
  }

  function handleEditInput(e: Event) {
    setEditingText((e.target as HTMLInputElement).value)
  }

  return (
    <div>
      <header class="header">
        <h1>todos</h1>
        <input ref={newTodoRef} class="new-todo" placeholder="What needs to be done?" autofocus onKeyDown={handleNewTodoKey as any} />
      </header>

      <section class="main">
        <input id="toggle-all" class="toggle-all" type="checkbox" checked={() => todos().length > 0 && activeCount() === 0} onChange={toggleAll} />
        <label htmlFor="toggle-all">Mark all as complete</label>

<ul class="todo-list">
  {filteredTodos().map((todo: Todo) => (
    <TodoItem
      key={todo.id}
      todo={todo}
      editingId={editingId}
      editingText={editingText}
      startEditing={startEditing}
      commitEdit={commitEdit}
      cancelEdit={cancelEdit}
      toggleTodo={toggleTodo}
      removeTodo={removeTodo}
      handleEditKey={handleEditKey}
      handleEditInput={handleEditInput}
    />
  ))}
</ul>
      </section>

      <footer class="footer" style={{ display: () => todos().length === 0 ? 'none' : 'block' }}>
        <span class="todo-count">
          <strong>{activeCount}</strong>
          {() => ` item${activeCount() === 1 ? '' : 's'} left`}
        </span>

        <ul class="filters">
          <li><a href="#/" class={() => (filter() === 'all' ? 'selected' : '')} onClick={(e: Event) => { e.preventDefault(); setFilter('all') }}>All</a></li>
          <li><a href="#/active" class={() => (filter() === 'active' ? 'selected' : '')} onClick={(e: Event) => { e.preventDefault(); setFilter('active') }}>Active</a></li>
          <li><a href="#/completed" class={() => (filter() === 'completed' ? 'selected' : '')} onClick={(e: Event) => { e.preventDefault(); setFilter('completed') }}>Completed</a></li>
        </ul>

        <button class="clear-completed" style={{ display: () => completedCount() === 0 ? 'none' : 'inline-block' }} onClick={clearCompleted}>
          Clear completed
        </button>
      </footer>
    </div>
  )
}

interface ItemHandlers {
  editingId: () => number | null
  editingText: () => string
  startEditing: (todo: Todo) => void
  commitEdit: () => void
  cancelEdit: () => void
  toggleTodo: (id: number) => void
  removeTodo: (id: number) => void
  handleEditKey: (e: KeyboardEvent) => void
  handleEditInput: (e: Event) => void
}
