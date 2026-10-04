// Step 2 — know when to stay quiet, and when to forget.
let caller = null

export function signal(value) {
  const readers = new Set()
  const read = () => {
    if (caller) { readers.add(caller); caller.sources.add(readers) }
    return value
  }
  const write = (next) => {
    if (Object.is(next, value)) return    // same value: stay quiet
    value = next
    ;[...readers].forEach(reader => reader.run())
  }
  return [read, write]
}

export function effect(fn) {
  const reader = {
    sources: new Set(),
    run() {
      reader.sources.forEach(s => s.delete(reader))   // forget last time
      reader.sources.clear()
      const previous = caller
      caller = reader
      try { fn() } finally { caller = previous }
    },
  }
  reader.run()
}
