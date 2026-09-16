import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import plugin from '../packages/babel-plugin/dist/index.js'
import { h, mount, choose } from '../packages/renderer/dist/index.js'
import { derive, useState } from '../packages/react-compat/dist/index.js'
import { createSignal, computed } from '../packages/signals/dist/index.js'
import { captureRuntime, assertArchitecture, assertNoReactiveWork, assertSameSource, hash } from './acceptance/gates.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(resolve(root, 'apps/compat-audit/package.json'))
const { JSDOM } = require('jsdom')
const { transformSync } = require('@babel/core')
const dom = new JSDOM('<body></body>', { url: 'http://localhost/' })
for (const name of ['window', 'document', 'Node', 'DocumentFragment', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'Event']) globalThis[name] = dom.window[name]
const React = require('react')
const { createRoot } = require('react-dom/client')
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const compilationInputs = {}
function compile(source, native = false) {
  compilationInputs[native ? 'reference' : 'target'] = source
  return transformSync(source, {
    plugins: native ? [] : [[plugin, { runOnce: true, injectImports: false }]],
    presets: native ? [[require.resolve('@babel/preset-react'), { runtime: 'classic', pragma: 'h' }]] : [],
    configFile: false, babelrc: false,
  }).code
}

try {
  const source = `function App() {
    entered(); const [count, setCount] = useState(0); expose(setCount);
    const alias = count; const doubled = alias * 2; const label = doubled > 2 ? 'large' : 'small';
    return <div><button onClick={() => {setCount(count + 1); setCount(count + 1);}}>add</button><output>{count}:{doubled}:{label}</output><aside>{count > 0 ? <input/> : null}</aside></div>;
  }`
  const traces = []
  let signalExecutions = 0
  let evaluations = 0
  let runtimeTrace
  for (const native of [true, false]) {
    let executions = 0
    let set
    const code = compile(source, native)
    if (!native) assert.doesNotMatch(code, /\blist\s*\(/)
    const App = new Function('choose', 'h', 'useState', 'derive', 'entered', 'expose', 'list', `${code};return App`)(
      choose,      native ? React.createElement : h, native ? React.useState : useState,
      factory => derive(() => { evaluations++; return factory() }),
      () => executions++, setter => { set = setter }, () => { throw new Error('Reconciler invoked') },
    )
    const host = document.createElement('div')
    document.body.appendChild(host)
    let dispose
    const capture = native ? null : captureRuntime()
    await React.act(async () => {
      if (native) { const root = createRoot(host); root.render(React.createElement(App)); dispose = () => root.unmount() }
      else dispose = mount(App, host)
    })
    const output = host.querySelector('output')
    const button = host.querySelector('button')
    const values = [output.textContent]
    let retainedInput
    for (let i = 0; i < 3; i++) {
      await React.act(async () => button.click())
      assert.equal(host.querySelector('output'), output)
      assert.equal(host.querySelector('button'), button)
      if (i === 0) { retainedInput = host.querySelector('input'); retainedInput.value = 'typed' }
      else { assert.equal(host.querySelector('input'), retainedInput); assert.equal(retainedInput.value, 'typed') }
      values.push(output.textContent)
    }
    traces.push(values)
    if (!native) { assert.equal(executions, 1); signalExecutions = executions }
    await React.act(async () => dispose())
    if (!native) {
      const before = evaluations
      const marker = capture.events.length
      set(100)
      assert.equal(evaluations, before); assert.equal(host.textContent, '')
      capture.stop()
      assertNoReactiveWork(capture.events, marker)
      assertArchitecture(capture.events, { bodyExecutions: executions })
      runtimeTrace = capture.events
    }
    host.remove()
  }
  assert.deepEqual(traces[1], traces[0])
  assertSameSource(compilationInputs.reference, compilationInputs.target)
  assert.deepEqual(traces[1], ['0:0:small', '1:2:small', '2:4:large', '3:6:large'])
  for (const source of [
    `function App(){const [xs]=useState([]);return <ul>{xs.map(x=><li key={x}>{x}</li>)}</ul>}`,
    `function App(){const [n]=useState(0);const d=[n];useEffect(()=>{},d);return <p>{n}</p>}`,
    `function App(){const [n]=useState(0);if(n){performWork();return <p>yes</p>;}return <p>no</p>}`,
  ]) assert.throws(() => compile(source), /runOnce:/)
  const [read, write] = createSignal(0)
  let computations = 0
  const value = () => { throw new Error('Computed result called as an updater') }
  const result = computed(() => { read(); computations++; return value })
  assert.equal(result(), value)
  write(1)
  assert.equal(computations, 2)
  result.dispose(); write(2)
  assert.equal(computations, 2)
  console.log(JSON.stringify({ status: 'PASS', sourceHash: hash(source), reactTrace: traces[0], signalTrace: traces[1], componentExecutions: signalExecutions, keyedReconcilerCalls: runtimeTrace.filter(event => event.kind === 'reconciler-enter').length, tracedEvents: runtimeTrace.length, stableDOM: true, derivationsDisposed: true, unsupportedInputsRejected: 3 }, null, 2))
  dom.window.close()
  process.exit(0)
} catch (error) {
  console.error(error)
  dom.window.close()
  process.exit(1)
}
