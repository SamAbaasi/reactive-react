// Step 4 — point the effect at the DOM.
import { effect } from './03-batch.mjs'

export function h(tag, props, ...children) {
  if (typeof tag === 'function') return tag(props ?? {})   // a component: called once
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(props ?? {})) {
    if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value)
    else if (typeof value === 'function') effect(() => el.setAttribute(key, value()))
    else el.setAttribute(key, value)
  }
  for (const child of children.flat()) {
    if (typeof child === 'function') {
      const text = document.createTextNode('')
      effect(() => { text.data = child() })               // the only thing that re-runs
      el.append(text)
    } else el.append(child)
  }
  return el
}
