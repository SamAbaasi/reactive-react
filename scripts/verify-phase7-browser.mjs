import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertArchitecture, assertNamespaceMap, assertNoReactiveWork, assertNoReactRuntime, assertSourceManifests } from './acceptance/gates.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const { chromium } = require(require.resolve('playwright', { paths: [resolve(root, 'apps/compat-audit'), resolve(root, '.bench-harness/webdriver-ts')] }))
const digest = value => createHash('sha256').update(value).digest('hex')
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }

function serve(directory) {
  return new Promise((accept, reject) => {
    const server = createServer((request, response) => {
      const pathname = new URL(request.url, 'http://localhost').pathname
      const path = resolve(directory, pathname === '/' ? 'index.html' : `.${pathname}`)
      try {
        const body = readFileSync(path)
        response.writeHead(200, { 'content-type': mime[extname(path)] ?? 'application/octet-stream' })
        response.end(body)
      } catch {
        response.writeHead(404)
        response.end('not found')
      }
    })
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => accept(server))
  })
}

function outputHashes(directory) {
  const output = {}
  const walk = (path, prefix = '') => {
    for (const name of readdirSync(path)) {
      if (name === 'acceptance-build.json') continue
      const child = resolve(path, name)
      const relative = prefix ? `${prefix}/${name}` : name
      if (statSync(child).isDirectory()) walk(child, relative)
      else output[relative] = digest(readFileSync(child))
    }
  }
  walk(directory)
  return output
}

const referenceDirectory = resolve(root, 'apps/flip/dist-phase7-react')
const targetDirectory = resolve(root, 'apps/flip/dist-phase7')
const referenceBuild = JSON.parse(readFileSync(resolve(referenceDirectory, 'acceptance-build.json'), 'utf8'))
const targetBuild = JSON.parse(readFileSync(resolve(targetDirectory, 'acceptance-build.json'), 'utf8'))
const sourceEntry = build => Object.entries(build.sourceHashes).find(([path]) => path.endsWith('/src/SvgPhase7.tsx'))?.[1]
const referenceSources = { 'SvgPhase7.tsx': sourceEntry(referenceBuild) }
const targetSources = { 'SvgPhase7.tsx': sourceEntry(targetBuild) }
assertSourceManifests(referenceSources, targetSources, ['SvgPhase7.tsx'])
assert.equal(digest(readFileSync(resolve(root, 'apps/flip/src/SvgPhase7.tsx'))), targetSources['SvgPhase7.tsx'])
assertNoReactRuntime(targetBuild.modules)

const SVG = 'http://www.w3.org/2000/svg'
const HTML = 'http://www.w3.org/1999/xhtml'
const XLINK = 'http://www.w3.org/1999/xlink'
const expectedNamespaces = { svg: SVG, group: SVG, circle: SVG, text: SVG, use: SVG, foreign: SVG, html: HTML }
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const runs = []
try {
  for (const [kind, directory] of [['react', referenceDirectory], ['phase7', targetDirectory]]) {
    const server = await serve(directory)
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      const identities = new WeakMap(); let next = 1
      const id = value => { if (!value) return undefined; if (!identities.has(value)) identities.set(value, next++); return identities.get(value) }
      globalThis.__RRJS_EVENTS__ = []
      globalThis.__RRJS_ACCEPTANCE_OBSERVER__ = event => globalThis.__RRJS_EVENTS__.push({ kind: event.kind, id: id(event.subject), dependency: id(event.dependency) })
    })
    const checkpoints = []
    const snapshot = async label => {
      const value = await page.evaluate(({ label, xlink }) => {
        const pick = kind => document.querySelector(`[data-kind="${kind}"]`)
        const namespaces = Object.fromEntries(['svg', 'group', 'circle', 'text', 'use', 'foreign', 'html']
          .map(kind => [kind, pick(kind)?.namespaceURI ?? null]))
        const circle = pick('circle')
        const group = pick('group')
        const use = pick('use')
        return {
          label,
          namespaces,
          className: pick('svg')?.getAttribute('class'),
          viewBox: pick('svg')?.getAttribute('viewBox'),
          radius: [circle?.getAttribute('cx'), circle?.getAttribute('r')],
          strokeWidth: group?.getAttribute('stroke-width'),
          href: use?.getAttribute('href') ?? null,
          xlinkHref: use?.getAttributeNS(xlink, 'href') ?? null,
          portalText: document.querySelector('#phase7-portal-target')?.textContent ?? null,
          portalTitle: document.querySelector('[data-kind="portal"]')?.getAttribute('title') ?? null,
          portalInSource: Boolean(document.querySelector('#root [data-kind="portal"]')),
          text: document.querySelector('#root')?.textContent,
        }
      }, { label, xlink: XLINK })
      if (value.namespaces.use === null) {
        const { use: _use, ...withoutUse } = expectedNamespaces
        assertNamespaceMap(value.namespaces, { ...withoutUse, use: null })
      } else assertNamespaceMap(value.namespaces, expectedNamespaces)
      checkpoints.push(value)
    }
    try {
      await page.goto(`http://127.0.0.1:${server.address().port}/`)
      await page.locator('[data-kind="svg"]').waitFor()
      await page.evaluate(() => {
        const source = document.querySelector('#root')
        const target = document.querySelector('#phase7-portal-target')
        if (!source || !target) throw new Error('portal containers missing')
      })
      const placement = await page.evaluate(() => ({
        inline: Boolean(document.querySelector('#root [data-kind="portal"]')),
        targeted: Boolean(document.querySelector('#phase7-portal-target [data-kind="portal"]')),
      }))
      assert.equal(placement.inline, false, `${kind}: portal rendered inline`)
      assert.equal(placement.targeted, true, `${kind}: portal missing from target`)
      const svg = await page.locator('[data-kind="svg"]').elementHandle()
      const circle = await page.locator('[data-kind="circle"]').elementHandle()
      const html = await page.locator('[data-kind="html"]').elementHandle()
      const portal = await page.locator('[data-kind="portal"]').elementHandle()
      await snapshot('initial')
      await page.locator('.increment').click()
      await snapshot('button-update')
      assert.equal(await portal.evaluate(node => node === document.querySelector('[data-kind="portal"]')), true, `${kind}: portal identity changed on owner update`)
      await page.locator('[data-kind="circle"]').evaluate(node => node.dispatchEvent(new MouseEvent('click', { bubbles: true })))
      await snapshot('svg-event-update')
      assert.equal(await portal.evaluate(node => node === document.querySelector('[data-kind="portal"]')), true, `${kind}: portal identity changed on portal event`)
      await page.locator('.toggle').click()
      await snapshot('conditional-hidden')
      await page.locator('.toggle').click()
      await snapshot('conditional-restored')
      assert.equal(await svg.evaluate(node => node === document.querySelector('[data-kind="svg"]')), true, `${kind}: svg identity changed`)
      assert.equal(await circle.evaluate(node => node === document.querySelector('[data-kind="circle"]')), true, `${kind}: circle identity changed`)
      assert.equal(await html.evaluate(node => node === document.querySelector('[data-kind="html"]')), true, `${kind}: foreignObject HTML identity changed`)
      assert.equal(await portal.evaluate(node => node === document.querySelector('[data-kind="portal"]')), false, `${kind}: restored portal reused a removed node`)
      assert.deepEqual(errors, [])

      let events = []
      if (kind === 'phase7') {
        await page.evaluate(() => globalThis.__RRJS_ACCEPTANCE_UNMOUNT__())
        const disposed = await page.locator('#phase7-portal-target').evaluate(node => node.querySelector('[data-kind="portal"]') === null)
        assert.equal(disposed, true, 'phase7: portal leaked after owner unmount')
        events = await page.evaluate(() => globalThis.__RRJS_EVENTS__)
        assertArchitecture(events, { instances: 1 })
        const end = events.length
        await circle.evaluate(node => node.dispatchEvent(new MouseEvent('click', { bubbles: true })))
        await page.waitForTimeout(25)
        events = await page.evaluate(() => globalThis.__RRJS_EVENTS__)
        assertNoReactiveWork(events, end)
        await page.evaluate(() => globalThis.__RRJS_ACCEPTANCE_STOP__?.())
      } else await page.evaluate(() => globalThis.__RRJS_ACCEPTANCE_UNMOUNT__())
      runs.push({ kind, checkpoints, events })
    } finally {
      await page.close()
      await new Promise(close => server.close(close))
    }
  }
  assert.deepEqual(runs[1].checkpoints, runs[0].checkpoints, 'P5: SVG browser behavior diverged')
  const report = {
    status: 'PASS',
    browser: browser.version(),
    componentSources: targetSources,
    outputHashes: { react: outputHashes(referenceDirectory), phase7: outputHashes(targetDirectory) },
    runs,
  }
  const out = resolve(root, '.private/acceptance/phase7-browser.json')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(report, null, 2))
  console.log(`Chrome ${browser.version()}: PASS; ${runs[1].checkpoints.length} SVG/portal checkpoints; report ${out}`)
} finally {
  await browser.close()
}
