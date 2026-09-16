// The shared model and operation vocabulary.
//
// Both implementations render the SAME model through the SAME markup. Anything
// that differs in the resulting DOM is a divergence, because nothing in the spec
// permits it.

/** Deterministic PRNG so a seed reproduces a sequence exactly. */
export function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const OPS = [
  'insert',
  'remove',
  'move',
  'changeContent',      // new object, same key
  'changeContentAndMove',
  'toggleFlag',         // conditional rendering inside a row
  'changeProp',         // a prop on every row
  'replaceAll',
  'clear',
  'reorderAll',
]

let nextId = 1
export function resetIds() { nextId = 1 }

const WORDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel']

export function makeItem(rand) {
  return { id: nextId++, label: WORDS[Math.floor(rand() * WORDS.length)], flag: rand() < 0.5 }
}

export function initialState(rand, n) {
  return { items: Array.from({ length: n }, () => makeItem(rand)), title: 't0' }
}

/** Applies one operation to the model, returning a NEW state (immutably). */
export function applyOp(state, op, rand) {
  const items = state.items
  switch (op) {
    case 'insert': {
      const at = items.length ? Math.floor(rand() * (items.length + 1)) : 0
      const next = items.slice()
      next.splice(at, 0, makeItem(rand))
      return { ...state, items: next }
    }
    case 'remove': {
      if (!items.length) return state
      const at = Math.floor(rand() * items.length)
      const next = items.slice()
      next.splice(at, 1)
      return { ...state, items: next }
    }
    case 'move': {
      if (items.length < 2) return state
      const from = Math.floor(rand() * items.length)
      let to = Math.floor(rand() * items.length)
      if (to === from) to = (to + 1) % items.length
      const next = items.slice()
      const [m] = next.splice(from, 1)
      next.splice(to, 0, m)
      return { ...state, items: next }
    }
    case 'changeContent': {
      if (!items.length) return state
      const at = Math.floor(rand() * items.length)
      const next = items.slice()
      next[at] = { ...next[at], label: next[at].label + '*' }
      return { ...state, items: next }
    }
    case 'changeContentAndMove': {
      if (items.length < 2) return state
      const from = Math.floor(rand() * items.length)
      let to = Math.floor(rand() * items.length)
      if (to === from) to = (to + 1) % items.length
      const next = items.slice()
      const [m] = next.splice(from, 1)
      next.splice(to, 0, { ...m, label: m.label + '#' })
      return { ...state, items: next }
    }
    case 'toggleFlag': {
      if (!items.length) return state
      const at = Math.floor(rand() * items.length)
      const next = items.slice()
      next[at] = { ...next[at], flag: !next[at].flag }
      return { ...state, items: next }
    }
    case 'changeProp':
      return { ...state, title: 't' + Math.floor(rand() * 1000) }
    case 'replaceAll': {
      const n = 1 + Math.floor(rand() * 6)
      return { ...state, items: Array.from({ length: n }, () => makeItem(rand)) }
    }
    case 'clear':
      return { ...state, items: [] }
    case 'reorderAll': {
      const next = items.slice()
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1))
        ;[next[i], next[j]] = [next[j], next[i]]
      }
      return { ...state, items: next }
    }
    default:
      return state
  }
}

export function makeSequence(seed, { length = 25, initialItems = 10 } = {}) {
  resetIds()
  const rand = mulberry32(seed)
  const start = initialState(rand, initialItems)
  const ops = []
  for (let i = 0; i < length; i++) ops.push(OPS[Math.floor(rand() * OPS.length)])
  return { seed, start, ops, rand: mulberry32(seed ^ 0x9e3779b9) }
}
