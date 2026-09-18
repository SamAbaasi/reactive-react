import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSignal, effect } from '../../packages/signals/dist/index.js'
import { createInstance, withInstance } from '../../packages/react-compat/dist/index.js'
import { h, list as renamedStructuralHelper, mount } from '../../packages/renderer/dist/index.js'
import { captureRuntime, assertArchitecture, assertNamespaceMap, assertNoReactiveWork, assertPortalDisposed, assertPortalPlacement, assertSameSource, assertSourceManifests, assertNoReactRuntime } from './gates.mjs'
import { assertDistMatchesSource, assertLifetime, runToExit } from './package-checks.mjs'

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

  // Release checks: a package ships exactly what compiling its source produces,
  // and a Node process that imports it ends by itself.
  const scratch = mkdtempSync(join(tmpdir(), 'rrjs-controls-'))
  try {
    const sourceRoot = join(scratch, 'source')
    const compiled = join(scratch, 'compiled', 'dist')
    const shipped = join(scratch, 'shipped')
    mkdirSync(compiled, { recursive: true })
    mkdirSync(join(shipped, 'dist'), { recursive: true })
    const code = 'export const value = 1;\n//# sourceMappingURL=index.js.map\n'
    const sourceMap = (source, mappings = 'AAAA') => JSON.stringify({ version: 3, file: 'index.js', sourceRoot: '', sources: [source], names: [], mappings })
    const shippedMap = sourceMap('../src/index.ts')
    writeFileSync(join(compiled, 'index.js'), code)
    writeFileSync(join(compiled, 'index.js.map'), sourceMap(relative(compiled, join(sourceRoot, 'src', 'index.ts')).split('\\').join('/')))
    writeFileSync(join(shipped, 'dist', 'index.js'), code)
    writeFileSync(join(shipped, 'dist', 'index.js.map'), shippedMap)
    const distCheck = () => assertDistMatchesSource({ name: 'fixture', shipped, compiled, sourceRoot })
    assert.deepEqual(distCheck(), { files: 2, identical: 1, sourceMaps: 1 }, 'Positive control: matching output was rejected, or its source map was not compared')
    writeFileSync(join(shipped, 'dist', 'react.js'), 'export {}\n')
    control('stale dist file', distCheck, /P7: fixture ships dist files its source does not produce: react\.js/)
    rmSync(join(shipped, 'dist', 'react.js'))
    rmSync(join(shipped, 'dist', 'index.js.map'))
    control('missing dist file', distCheck, /P7: fixture is missing compiled output: index\.js\.map/)
    writeFileSync(join(shipped, 'dist', 'index.js.map'), sourceMap('../src/index.ts', 'AACA'))
    control('changed source map', distCheck, /P7: fixture ships dist files that differ from compiling its current source: index\.js\.map$/)
    writeFileSync(join(shipped, 'dist', 'index.js.map'), shippedMap)
    writeFileSync(join(shipped, 'dist', 'index.js'), code.replace('1', '2'))
    control('changed dist file', distCheck, /P7: fixture ships dist files that differ from compiling its current source: index\.js$/)

    const stageScript = body => `import { appendFileSync } from 'node:fs'\nconst stage = name => appendFileSync(process.argv[2], name + '\\n')\n${body}\n`
    writeFileSync(join(scratch, 'exits.mjs'), stageScript("stage('finished')\nsetTimeout(() => stage('effect'), 0)"))
    writeFileSync(join(scratch, 'held-open.mjs'), stageScript("stage('effect')\nstage('finished')\nsetInterval(() => {}, 1000)"))
    writeFileSync(join(scratch, 'slow-start.mjs'), stageScript("setTimeout(() => { stage('effect'); stage('finished') }, 60000)"))
    writeFileSync(join(scratch, 'no-effect.mjs'), stageScript("stage('finished')"))
    writeFileSync(join(scratch, 'fails.mjs'), stageScript("stage('effect')\nstage('finished')\nprocess.exitCode = 3"))
    const lifetime = (script, finishWithinMs = 5000, exitWithinMs = 2000) =>
      runToExit(script, { cwd: scratch, stagesFile: join(scratch, `${script}.stages`), finishWithinMs, exitWithinMs })
    const stages = { finished: 'the script ended before its last line', effect: 'a passive effect scheduled before the process ended never ran' }
    assertLifetime(await lifetime('exits.mjs'), { name: 'exits.mjs', stages })
    const heldOpen = await lifetime('held-open.mjs', 5000, 500)
    control('Node held open after finishing', () => assertLifetime(heldOpen, { name: 'held-open.mjs', stages }), /P7: importing the packages keeps Node alive: held-open\.mjs finished/)
    const slowStart = await lifetime('slow-start.mjs', 500)
    control('slow start before finishing', () => assertLifetime(slowStart, { name: 'slow-start.mjs', stages }), /P7: slow-start\.mjs did not finish within 500 ms, so whether the packages let Node exit was not checked/)
    const noEffect = await lifetime('no-effect.mjs')
    control('dropped passive effect', () => assertLifetime(noEffect, { name: 'no-effect.mjs', stages }), /P7: a passive effect scheduled before the process ended never ran \(no-effect\.mjs/)
    const fails = await lifetime('fails.mjs')
    control('failing exit code', () => assertLifetime(fails, { name: 'fails.mjs', stages }), /P7: fails\.mjs exited with code 3/)
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
  assertNoReactRuntime(['/packages/signals/dist/index.js', '/packages/renderer/dist/index.js'])
  assertSameSource('unchanged', 'unchanged')
  console.log(JSON.stringify({ status: 'PASS', positiveControl: 'actual lifecycle/subscription trace', negativeControls: caught }, null, 2))
  dom.window.close()
  process.exit(0)
} catch (error) { console.error(error); dom.window.close(); process.exit(1) }
