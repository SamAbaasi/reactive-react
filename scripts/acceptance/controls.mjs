import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createSignal, effect } from '../../packages/signals/dist/index.js'
import { createInstance, withInstance } from '../../packages/react-compat/dist/index.js'
import { h, list as renamedStructuralHelper, mount } from '../../packages/renderer/dist/index.js'
import { captureRuntime, assertArchitecture, assertNamespaceMap, assertNoReactiveWork, assertPortalDisposed, assertPortalPlacement, assertSameSource, assertSourceManifests, assertNoReactRuntime } from './gates.mjs'

const require = createRequire(fileURLToPath(new URL('../../apps/compat-audit/package.json', import.meta.url)))
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<body></body>')
for (const name of ['window', 'document', 'Node', 'DocumentFragment', 'HTMLElement']) globalThis[name] = dom.window[name]
const caught = []
function control(name, run, reason) {
  assert.throws(run, reason, `Negative control failed to catch: ${name}`)
  caught.push(name)
}
try {
  let capture = captureRuntime()
  const host = document.createElement('div')
  const [n, setN] = createSignal(0)
  const dispose = mount(() => h('output', null, n), host)
  setN(1)
  assert.equal(host.textContent, '1')
  dispose()
  const marker = capture.events.length
  setN(2)
  capture.stop()
  assertArchitecture(capture.events)
  assertNoReactiveWork(capture.events, marker)
  assert.ok(capture.events.some(event => event.kind === 'subscription-add'), 'Positive control did not observe actual subscriptions')

  capture = captureRuntime()
  const instance = createInstance()
  withInstance(instance, () => {})
  withInstance(instance, () => {})
  capture.stop()
  control('same-instance re-execution', () => assertArchitecture(capture.events, { unmounted: false }), /P1: component re-executed/)

  capture = captureRuntime()
  mount(() => h('p', null, 'one'), host)()
  mount(() => h('p', null, 'two'), host)()
  capture.stop()
  control('remount substitution', () => assertArchitecture(capture.events), /P1: unexpected component mounts/)

  capture = captureRuntime()
  mount(() => h('div', null, renamedStructuralHelper(() => [], value => value, () => document.createElement('i'))), host)()
  capture.stop()
  control('real reconciler through alias', () => assertArchitecture(capture.events), /P2: actual reconciler/)

  capture = captureRuntime()
  let leakedDispose
  mount(() => { leakedDispose = effect(() => { n() }); return h('p', null, 'leak') }, host)()
  const afterUnmount = capture.events.length
  setN(3)
  capture.stop()
  control('dropped computation disposal', () => assertArchitecture(capture.events), /P5: computation leaked/)
  control('post-unmount work', () => assertNoReactiveWork(capture.events, afterUnmount), /P5: reactive work/)
  leakedDispose()

  capture = captureRuntime()
  let executions = 0
  const replayedBody = () => { executions++; return h('p', null, 'valid') }
  mount(replayedBody, host)()
  replayedBody()
  capture.stop()
  control('body replay hidden outside instance', () => assertArchitecture(capture.events, { bodyExecutions: executions }), /P1: original component body replayed/)
  control('changed source', () => assertSameSource('const x = 1', 'const x = 2'), /P4: component source changed/)
  control('changed source manifest', () => assertSourceManifests({ 'App.tsx': 'one' }, { 'App.tsx': 'two' }, ['App.tsx']), /P4: component source changed/)
  control('incomplete reference source manifest', () => assertSourceManifests({}, { 'App.tsx': 'one' }, ['App.tsx']), /P4: reference source manifest/)
  control('wrong SVG namespace', () => assertNamespaceMap({ circle: 'http://www.w3.org/1999/xhtml' }, { circle: 'http://www.w3.org/2000/svg' }), /P5: DOM namespace map/)
  const portalSource = document.createElement('main')
  const portalTarget = document.createElement('aside')
  const misplacedPortal = document.createElement('button')
  misplacedPortal.dataset.kind = 'portal'
  portalSource.appendChild(misplacedPortal)
  control('inline portal placement', () => assertPortalPlacement(portalSource, portalTarget, '[data-kind="portal"]'), /P5: portal content rendered in the source container/)
  portalSource.removeChild(misplacedPortal)
  portalTarget.appendChild(misplacedPortal)
  control('leaked portal after owner unmount', () => assertPortalDisposed(portalTarget, '[data-kind="portal"]'), /P5: portal content leaked/)
  control('React runtime dependency', () => assertNoReactRuntime([require.resolve('react-dom/client')]), /P3: React runtime/)
  assertNoReactRuntime(['/packages/signals/dist/index.js', '/packages/renderer/dist/index.js'])
  assertSameSource('unchanged', 'unchanged')
  console.log(JSON.stringify({ status: 'PASS', positiveControl: 'actual lifecycle/subscription trace', negativeControls: caught }, null, 2))
  dom.window.close()
  process.exit(0)
} catch (error) { console.error(error); dom.window.close(); process.exit(1) }
