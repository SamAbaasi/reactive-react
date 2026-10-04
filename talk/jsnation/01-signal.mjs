// Step 1 — a signal is a function that writes down who called it.
let caller = null

export function signal(value) {
  const readers = new Set()
  const read = () => {
    if (caller) readers.add(caller)       // write down who called
    return value
  }
  const write = (next) => {
    value = next
    readers.forEach(reader => reader())   // call them back
  }
  return [read, write]
}

export function effect(fn) {
  caller = fn
  fn()
  caller = null
}
