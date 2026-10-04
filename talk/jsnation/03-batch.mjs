// Step 3 — schedule instead of calling back, and derive values.
let caller = null
let depth = 0
let flushing = false
const queue = new Set()

export function signal(value) {
  const readers = new Set()
  const read = () => {
    if (caller) { readers.add(caller); caller.sources.add(readers) }
    return value
  }
  const write = (next) => {
    if (Object.is(next, value)) return
    value = next
    readers.forEach(reader => queue.add(reader))   // schedule, don't call
    flush()
  }
  return [read, write]
}

export function effect(fn) {
  const reader = {
    sources: new Set(),
    run() {
      reader.sources.forEach(s => s.delete(reader))
      reader.sources.clear()
      const previous = caller
      caller = reader
      try { fn() } finally { caller = previous }
    },
  }
  reader.run()
}

export function batch(fn) {
  depth++
  try { fn() } finally { depth--; flush() }
}

function flush() {
  if (depth > 0 || flushing) return
  flushing = true
  try {
    for (const reader of queue) { queue.delete(reader); reader.run() }
  } finally { flushing = false }
}

export function computed(fn) {
  const [read, write] = signal()
  effect(() => write(fn()))                      // a signal fed by an effect
  return read
}
