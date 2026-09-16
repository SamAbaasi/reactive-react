// Attribute-by-attribute comparison of the DOM the two renderers actually
// produced. Two jobs:
//   1. Back the demo's claim that both panes use the same row markup. If they
//      diverge, the comparison is invalid and the page should say so.
//   2. Tooling for the open question in docs/BENCHMARKS.md, which guesses that
//      "React's <td> elements have different layout characteristics". A guess is
//      testable: compare the structure, then compare the resolved styles that
//      actually govern layout and containment.

export interface Diff {
  path: string
  what: string
  react: string
  rrjs: string
}

/** Properties that change layout, sizing, or containment behaviour. */
const LAYOUT_PROPS = [
  'display', 'position', 'box-sizing', 'contain', 'content-visibility',
  'width', 'height', 'min-width', 'max-width', 'padding-top', 'padding-right',
  'padding-bottom', 'padding-left', 'border-top-width', 'border-right-width',
  'border-bottom-width', 'border-left-width', 'margin-top', 'margin-bottom',
  'table-layout', 'vertical-align', 'white-space', 'overflow-x', 'overflow-y',
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
  'text-align', 'transform', 'will-change', 'writing-mode',
]

function attrsOf(el: Element): Map<string, string> {
  const map = new Map<string, string>()
  for (const a of Array.from(el.attributes)) map.set(a.name, a.value)
  return map
}

function describe(node: Node): string {
  if (node.nodeType === Node.ELEMENT_NODE) return (node as Element).tagName.toLowerCase()
  if (node.nodeType === Node.TEXT_NODE) return `#text(${JSON.stringify(node.textContent)})`
  if (node.nodeType === Node.COMMENT_NODE) return `#comment(${JSON.stringify(node.textContent)})`
  return `#node(${node.nodeType})`
}

/**
 * Structural + attribute diff. Text nodes are compared by content, so a label
 * difference shows up rather than hiding behind matching tag names.
 */
export function compareStructure(a: Node, b: Node, path = 'tr', out: Diff[] = []): Diff[] {
  if (a.nodeType !== b.nodeType) {
    out.push({ path, what: 'nodeType', react: describe(a), rrjs: describe(b) })
    return out
  }

  if (a.nodeType === Node.TEXT_NODE || a.nodeType === Node.COMMENT_NODE) {
    if ((a.textContent ?? '') !== (b.textContent ?? '')) {
      out.push({ path, what: 'text', react: a.textContent ?? '', rrjs: b.textContent ?? '' })
    }
    return out
  }

  if (a.nodeType !== Node.ELEMENT_NODE) return out

  const ea = a as Element
  const eb = b as Element

  if (ea.tagName !== eb.tagName) {
    out.push({ path, what: 'tagName', react: ea.tagName, rrjs: eb.tagName })
    return out
  }

  const aa = attrsOf(ea)
  const ab = attrsOf(eb)
  for (const name of new Set([...aa.keys(), ...ab.keys()])) {
    const va = aa.get(name)
    const vb = ab.get(name)
    if (va !== vb) {
      out.push({
        path,
        what: `attribute "${name}"`,
        react: va === undefined ? '(absent)' : va,
        rrjs: vb === undefined ? '(absent)' : vb,
      })
    }
  }

  // Compare children, including text and comment nodes — the rr renderer emits
  // comment anchors for lists, and those are a real structural difference worth
  // surfacing rather than filtering away.
  const ca = Array.from(a.childNodes)
  const cb = Array.from(b.childNodes)
  if (ca.length !== cb.length) {
    out.push({
      path,
      what: 'child count',
      react: `${ca.length} [${ca.map(describe).join(', ')}]`,
      rrjs: `${cb.length} [${cb.map(describe).join(', ')}]`,
    })
  }
  const n = Math.min(ca.length, cb.length)
  for (let i = 0; i < n; i++) {
    compareStructure(ca[i], cb[i], `${path} > ${describe(ca[i])}[${i}]`, out)
  }
  return out
}

/** Resolved-style diff over the properties that can move layout cost around. */
export function compareComputed(a: Element, b: Element, path = 'tr', out: Diff[] = []): Diff[] {
  const sa = getComputedStyle(a)
  const sb = getComputedStyle(b)
  for (const prop of LAYOUT_PROPS) {
    const va = sa.getPropertyValue(prop)
    const vb = sb.getPropertyValue(prop)
    if (va !== vb) out.push({ path, what: `computed ${prop}`, react: va, rrjs: vb })
  }
  const ca = Array.from(a.children)
  const cb = Array.from(b.children)
  const n = Math.min(ca.length, cb.length)
  for (let i = 0; i < n; i++) {
    compareComputed(ca[i], cb[i], `${path} > ${ca[i].tagName.toLowerCase()}[${i}]`, out)
  }
  return out
}

/** Box geometry — catches a difference that resolved styles alone would miss. */
export function compareBoxes(a: Element, b: Element, path = 'tr', out: Diff[] = []): Diff[] {
  const ra = a.getBoundingClientRect()
  const rb = b.getBoundingClientRect()
  const round = (n: number) => Math.round(n * 100) / 100
  for (const dim of ['width', 'height'] as const) {
    if (round(ra[dim]) !== round(rb[dim])) {
      out.push({ path, what: `box ${dim}`, react: `${round(ra[dim])}px`, rrjs: `${round(rb[dim])}px` })
    }
  }
  const ca = Array.from(a.children)
  const cb = Array.from(b.children)
  const n = Math.min(ca.length, cb.length)
  for (let i = 0; i < n; i++) {
    compareBoxes(ca[i], cb[i], `${path} > ${ca[i].tagName.toLowerCase()}[${i}]`, out)
  }
  return out
}
