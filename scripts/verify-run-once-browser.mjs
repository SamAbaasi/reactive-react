import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve, sep, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertArchitecture, assertNoReactRuntime } from './acceptance/gates.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const { chromium } = require(require.resolve('playwright', { paths: [resolve(root, 'apps/compat-audit'), resolve(root, '.bench-harness/webdriver-ts')] }))
const readBuild = name => JSON.parse(readFileSync(resolve(root, 'apps/flip', name, 'acceptance-build.json'), 'utf8'))
const referenceBuild = readBuild('dist-run-once-reference')
const targetBuild = readBuild('dist-run-once')
const componentHash = build => Object.entries(build.sourceHashes).find(([path]) => path.endsWith('/src/RunOnce.tsx'))?.[1]
const componentSource = readFileSync(resolve(root, 'apps/flip/src/RunOnce.tsx'), 'utf8')
assert.ok(componentHash(referenceBuild), 'Missing reference source identity')
assert.equal(componentHash(targetBuild), componentHash(referenceBuild), 'P4: production component source changed')
assert.match(componentSource, /function isVisible\(value: number\)\s*{\s*return value > 0\s*}/, 'Phase 2 production helper must remain a pure expression')
assert.doesNotMatch(componentSource, /predicateCalls|__RRJS_PHASE2_PREDICATE_CALLS__/, 'Effectful helper-count instrumentation is unsound')
assertNoReactRuntime(targetBuild.modules)
const results = []
let targetEvidence
let targetBranchDisposals = 0
let referenceListFocusEvents
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const target of ['reference', 'target']) {
    const directory = resolve(root, 'apps/flip', target === 'reference' ? 'dist-run-once-reference' : 'dist-run-once')
    const server = createServer((request, response) => {
      try {
        const pathname = new URL(request.url, 'http://localhost').pathname
        const path = resolve(directory, '.' + (pathname === '/' ? '/index.html' : decodeURIComponent(pathname)))
        if (!path.startsWith(directory + sep)) { response.writeHead(403).end(); return }
        response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' })[extname(path)] ?? 'application/octet-stream')
        response.end(readFileSync(path))
      } catch { response.writeHead(404).end() }
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      const identities = new WeakMap()
      let next = 1
      const id = value => { if (!value) return undefined; if (!identities.has(value)) identities.set(value, next++); return identities.get(value) }
      globalThis.__RRJS_EVENTS__ = []
      globalThis.__RRJS_MUTATIONS__ = []
      globalThis.__RRJS_ACCEPTANCE_OBSERVER__ = event => globalThis.__RRJS_EVENTS__.push({ kind: event.kind, id: id(event.subject), dependency: id(event.dependency) })
      new MutationObserver(records => {
        const root = document.querySelector('#root')
        for (const record of records) if (root?.contains(record.target)) globalThis.__RRJS_MUTATIONS__.push({ type: record.type, target: record.target.nodeName, added: record.addedNodes.length, removed: record.removedNodes.length, attribute: record.attributeName })
      }).observe(document, { childList: true, subtree: true, attributes: true, characterData: true })
    })
    const checkpoints = []
    const snapshot = async () => checkpoints.push(await page.evaluate(() => {
      const count = document.querySelector('#executions').textContent
      const input = document.querySelector('#retained-input')
      return {
        visibleText: document.querySelector('#root').innerText.replace('Component body executions: ' + count, 'Component body executions: [instrumentation]'),
        input: input?.value ?? null,
        selection: input ? [input.selectionStart, input.selectionEnd] : null,
        focusedId: document.activeElement.id,
      }
    }))
    try {
      await page.goto('http://127.0.0.1:' + server.address().port + '/')
      await page.locator('#increment').waitFor()
      assert.equal(await page.locator('#executions').textContent(), '1')
      const rootTail = await page.locator('#root-range-tail').elementHandle()
      assert.equal(await page.locator('#inactive-branch').count(), 1)
      assert.equal(await page.locator('#safe-read').count(), 0)
      const retainedRow = await page.locator('#row-b').evaluateHandle(element => element.closest('li'))
      await page.locator('#row-b').fill('kept row value')
      await page.locator('#row-b').evaluate(element => {
        globalThis.__RRJS_LIST_FOCUS_EVENTS__ = []
        element.addEventListener('focus', () => globalThis.__RRJS_LIST_FOCUS_EVENTS__.push('focus'))
        element.addEventListener('blur', () => globalThis.__RRJS_LIST_FOCUS_EVENTS__.push('blur'))
        element.focus()
        element.setSelectionRange(2, 6)
      })
      await page.locator('#list-append').evaluate(element => element.click())
      await page.locator('#list-reverse').evaluate(element => element.click())
      assert.deepEqual(await page.locator('#phase5-list li span').allTextContents(), ['C', 'B', 'A'])
      assert.deepEqual(await page.locator('#phase5-list li').evaluateAll(elements => elements.map(element => element.dataset.index)), ['0', '1', '2'])
      assert.equal(await retainedRow.evaluate(element => element === document.querySelector('#row-b').closest('li')), true)
      assert.equal(await page.locator('#row-b').inputValue(), 'kept row value')
      assert.equal(await page.locator('#row-b').evaluate(element => element === document.activeElement), true)
      assert.deepEqual(await page.locator('#row-b').evaluate(element => [element.selectionStart, element.selectionEnd]), [2, 6])
      const listFocusEvents = await page.evaluate(() => globalThis.__RRJS_LIST_FOCUS_EVENTS__)
      if (target === 'reference') referenceListFocusEvents = listFocusEvents
      else assert.deepEqual(listFocusEvents, referenceListFocusEvents, 'Phase 5 focus/blur event trace diverged')
      await snapshot()
      await page.locator('#increment').click()
      const original = await page.locator('#retained-input').elementHandle()
      await page.locator('#retained-input').fill('keep this value')
      await page.locator('#retained-input').evaluate(element => element.setSelectionRange(2, 7))
      assert.equal(await page.locator('#retained-input').evaluate(element => element === document.activeElement), true)
      assert.equal(await page.locator('#retained-input').getAttribute('placeholder'), 'one')
      assert.equal(await page.locator('#safe-read').textContent(), 'ready 1')
      await snapshot()
      await page.locator('#increment').click()
      assert.equal(await original.evaluate(element => element === document.querySelector('#retained-input')), true)
      assert.equal(await page.locator('#retained-input').inputValue(), 'keep this value')
      assert.equal(await page.locator('#retained-input').getAttribute('placeholder'), 'two-plus')
      assert.equal(await page.locator('#nested-branch').textContent(), 'nested ready 2')
      assert.deepEqual(await page.locator('#retained-input').evaluate(element => [element.selectionStart, element.selectionEnd]), [2, 7])
      assert.equal(await rootTail.evaluate(element => element === document.querySelector('#root-range-tail')), true)
      await snapshot()
      await page.locator('#snapshot').click()
      assert.equal(await page.locator('#count').textContent(), '3')
      assert.equal(await page.locator('#doubled').textContent(), '6')
      await snapshot()
      await page.locator('#reset').click()
      assert.equal(await page.locator('#retained-input').count(), 0)
      assert.equal(await page.locator('#nested-branch').count(), 0)
      assert.equal(await page.locator('#inactive-branch').count(), 1)
      assert.equal(await rootTail.evaluate(element => element === document.querySelector('#root-range-tail')), true)
      if (target === 'target') targetBranchDisposals = await page.evaluate(() => globalThis.__RRJS_EVENTS__.filter(event => event.kind === 'computation-dispose').length)
      await snapshot()
      await page.locator('#increment').click()
      assert.equal(await page.locator('#retained-input').inputValue(), '')
      assert.equal(await page.locator('#retained-input').getAttribute('placeholder'), 'one')
      assert.equal(await page.locator('#safe-read').textContent(), 'ready 1')
      await snapshot()
      if (target === 'target') {
        const executions = Number(await page.locator('#executions').textContent())
        assert.equal(executions, 1)
        await page.evaluate(() => globalThis.__RRJS_ACCEPTANCE_UNMOUNT__())
        targetEvidence = await page.evaluate(() => ({ events: globalThis.__RRJS_EVENTS__, mutations: globalThis.__RRJS_MUTATIONS__ }))
        assertArchitecture(targetEvidence.events, { bodyExecutions: executions })
        assert.ok(targetEvidence.mutations.some(event => event.type === 'characterData'), 'No direct text mutations observed')
        assert.ok(targetEvidence.events.filter(event => event.kind === 'list-operation').length >= 2, 'Phase 5 list operations were not traced')
        assert.ok(targetBranchDisposals > 0, 'Removed branch did not dispose owned computations')
        assert.equal(await page.locator('#root').textContent(), '')
      }
      assert.deepEqual(errors, [])
      results.push(checkpoints)
    } finally { await page.close(); await new Promise(resolve => server.close(resolve)) }
  }
  assert.deepEqual(results[1], results[0], 'P5: production browser behavior diverged')
  const report = { status: 'PASS', browser: browser.version(), sourceHash: componentHash(targetBuild), checkpoints: results, phase2: { pureHelperSource: true, pureHelperEvaluationCountEvidence: 'apps/compat-audit/tests/phase2.test.ts', removedBranchComputationDisposals: targetBranchDisposals, rootRange: true, sameElementIdentity: true }, phase5: { appendAndReverse: true, stableRowIdentity: true, uncontrolledValue: true, focusSelection: true, focusEventTrace: referenceListFocusEvents }, instrumentationExclusion: 'Displayed component execution count differs intentionally from React; target count is asserted as one', targetEvidence }
  const out = resolve(root, '.private/acceptance/browser.json')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(report, null, 2))
  console.log('Chrome ' + browser.version() + ': PASS; six identical-source checkpoints; Phase 2 control-flow and Phase 5 list-operation identity/focus/selection/event-trace gates pass; trace saved to .private/acceptance/browser.json')
} finally { await browser.close() }
