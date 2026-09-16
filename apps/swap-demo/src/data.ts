// Shared dataset. Both panes are handed the *same* array contents, built from a
// seeded PRNG so a reload produces byte-identical data — otherwise the two panes
// would be laying out different label lengths, and label length changes text
// measurement cost, which is part of what we are timing.

export interface Row {
  id: number
  label: string
}

const A = ['pretty', 'large', 'big', 'small', 'tall', 'short', 'long', 'handsome', 'plain', 'quaint', 'clean', 'elegant', 'easy', 'angry', 'crazy', 'helpful', 'mushy', 'odd', 'unsightly', 'adorable', 'important', 'inexpensive', 'cheap', 'expensive', 'fancy']
const C = ['red', 'yellow', 'blue', 'green', 'pink', 'brown', 'purple', 'brown', 'white', 'black', 'orange']
const N = ['table', 'chair', 'house', 'bbq', 'desk', 'car', 'pony', 'cookie', 'sandwich', 'burger', 'pizza', 'mouse', 'keyboard']

/** Deterministic PRNG — same seed, same data, every reload. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function buildData(count: number, seed = 0xc0ffee): Row[] {
  const rand = mulberry32(seed)
  const pick = (arr: string[]) => arr[Math.floor(rand() * arr.length)]
  const data: Row[] = new Array(count)
  for (let i = 0; i < count; i++) {
    data[i] = { id: i + 1, label: `${pick(A)} ${pick(C)} ${pick(N)}` }
  }
  return data
}

/** js-framework-benchmark's swap: indices 1 and 998 of a 1000-row list. */
export const SWAP_A = 1
export const SWAP_B = 998

export function swapped(rows: Row[]): Row[] {
  const next = rows.slice()
  const tmp = next[SWAP_A]
  next[SWAP_A] = next[SWAP_B]
  next[SWAP_B] = tmp
  return next
}
