// JSX text must come out the way React's JSX transform leaves it. The same source
// is compiled by @babel/preset-react for React and by the plugin's default path
// for the target, rendered by each, and every non-empty text node compared
// exactly. The shared `text()` helper collapses whitespace, which is why a
// difference here went unnoticed: `{name} theme` followed by a line break kept
// the break and the indentation on the target.
import { it, expect } from 'vitest'
import * as babel from '@babel/core'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { run, compileDefault } from './harness'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

const source = `function App() {
  const [name, setName] = useState('Light')
  return (
    <main>
      <button id="toggle" onClick={() => setName(name === 'Light' ? 'Dark' : 'Light')}>
        {name} theme
      </button>
      <p id="lines">
        Hello
        world,   again
      </p>
      <p id="inline">a <b>b</b> c</p>
      <p id="entity">
        &nbsp;kept&nbsp;
      </p>
      <p id="tabs">\ttabbed\ttext\t</p>
      <p id="trailing">{name}
        !</p>
    </main>
  )
}`

// Non-empty text nodes in document order. The target keeps empty text anchors
// for reactive positions; that difference is recorded in the acceptance limits
// and is not what this test is about.
function texts(root: Element): string[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const values: string[] = []
  while (walker.nextNode()) if (walker.currentNode.nodeValue) values.push(walker.currentNode.nodeValue)
  return values
}
const probes = ['toggle', 'lines', 'inline', 'entity', 'tabs', 'trailing']
const textOf = (root: Element) => Object.fromEntries(probes.map(id => [id, root.querySelector(`#${id}`)!.textContent]))

it('renders JSX text exactly as React does, before and after an update', async () => {
  const reactCode = babel.transformSync(source, {
    presets: [['@babel/preset-react', { runtime: 'classic' }]],
    configFile: false, babelrc: false, sourceType: 'script',
  })!.code!
  const ReactApp = new Function('React', 'useState', `${reactCode}\nreturn App;`)(React, React.useState)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await React.act(async () => { root.render(React.createElement(ReactApp)) })

  const target = run(source, 'App', compileDefault)
  if (target.error) throw target.error

  // The values React produces, stated so the test cannot pass with both sides wrong.
  expect(textOf(host)).toEqual({
    toggle: 'Light theme',
    lines: 'Hello world,   again',
    inline: 'a b c',
    entity: ' kept ',
    tabs: ' tabbed text ',
    trailing: 'Light!',
  })
  expect(textOf(target.container)).toEqual(textOf(host))
  expect(texts(target.container)).toEqual(texts(host))

  await React.act(async () => { host.querySelector<HTMLElement>('#toggle')!.click() })
  target.container.querySelector<HTMLElement>('#toggle')!.click()
  expect(textOf(host).toggle).toBe('Dark theme')
  expect(textOf(target.container)).toEqual(textOf(host))
  expect(texts(target.container)).toEqual(texts(host))

  await React.act(async () => { root.unmount() })
})
