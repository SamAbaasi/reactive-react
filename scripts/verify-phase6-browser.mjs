import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve, sep, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertArchitecture, assertNoReactiveWork, assertNoReactRuntime, assertSourceManifests } from './acceptance/gates.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const { chromium } = require(require.resolve('playwright', { paths: [resolve(root, 'apps/compat-audit'), resolve(root, '.bench-harness/webdriver-ts')] }))
const referenceBuild = JSON.parse(readFileSync(resolve(root, 'apps/flip/dist-react/acceptance-build.json'), 'utf8'))
const targetBuild = JSON.parse(readFileSync(resolve(root, 'apps/flip/dist-phase6/acceptance-build.json'), 'utf8'))
const hash = value => createHash('sha256').update(value).digest('hex')
const componentFiles = ['App.tsx', 'IssueList.tsx', 'IssueForm.tsx', 'Stats.tsx', 'ThemeContext.tsx']
const componentManifest = build => Object.fromEntries(componentFiles.map(name => {
  const entry = Object.entries(build.sourceHashes).find(([path]) => path.endsWith('/src/' + name))
  assert.ok(entry, `Missing ${name} from production source manifest`)
  return [name, entry[1]]
}))
const referenceSources = componentManifest(referenceBuild)
const targetSources = componentManifest(targetBuild)
assertSourceManifests(referenceSources, targetSources, componentFiles)
for (const name of componentFiles) {
  const path = resolve(root, 'apps/flip/src', name)
  assert.equal(hash(readFileSync(path, 'utf8')), targetSources[name], `P4: compiled source changed after hashing: ${name}`)
}
assertNoReactRuntime(targetBuild.modules)

const outputHashes = directory => {
  const result = {}
  const walk = (path, prefix = '') => {
    for (const name of readdirSync(path)) {
      const absolute = resolve(path, name)
      const relative = prefix ? `${prefix}/${name}` : name
      if (statSync(absolute).isDirectory()) walk(absolute, relative)
      else if (name !== 'acceptance-build.json') result[relative] = hash(readFileSync(absolute))
    }
  }
  walk(directory)
  return result
}

const serve = directory => {
  const server = createServer((request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname
      const path = resolve(directory, '.' + (pathname === '/' ? '/index.html' : decodeURIComponent(pathname)))
      if (!path.startsWith(directory + sep)) return response.writeHead(403).end()
      response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' })[extname(path)] ?? 'application/octet-stream')
      response.end(readFileSync(path))
    } catch { response.writeHead(404).end() }
  })
  return new Promise(resolveReady => server.listen(0, '127.0.0.1', () => resolveReady(server)))
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const runs = []
try {
  for (const kind of ['react', 'phase6']) {
    const server = await serve(resolve(root, `apps/flip/dist-${kind}`))
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      const identities = new WeakMap(); let next = 1
      const id = value => { if (!value) return undefined; if (!identities.has(value)) identities.set(value, next++); return identities.get(value) }
      globalThis.__RRJS_EVENTS__ = []
      globalThis.__RRJS_ACCEPTANCE_OBSERVER__ = event => globalThis.__RRJS_EVENTS__.push({ kind: event.kind, id: id(event.subject), dependency: id(event.dependency), component: event.subject?.displayName })
    })
    const checkpoints = []
    const snapshot = async label => checkpoints.push(await page.evaluate(label => ({
      label,
      hash: location.hash,
      title: document.title,
      text: document.querySelector('#root').innerText,
      theme: document.querySelector('.app')?.className,
      active: document.activeElement?.className || document.activeElement?.tagName,
      checked: [...document.querySelectorAll('.check')].map(input => input.checked),
      options: [...document.querySelectorAll('option')].map(option => [option.value, option.selected]),
      form: (() => {
        const input = document.querySelector('input[placeholder="Something to fix"]')
        const select = document.querySelector('select')
        const submit = document.querySelector('.issue-form button[type="submit"]')
        return input ? {
          value: input.value,
          className: input.className,
          selection: [input.selectionStart, input.selectionEnd],
          priority: select?.value,
          disabled: submit?.disabled,
          error: document.querySelector('.error')?.textContent ?? null,
        } : null
      })(),
      issues: [...document.querySelectorAll('.issues li')].map(row => ({
        title: row.querySelector('.title')?.textContent ?? row.querySelector('.edit')?.value,
        done: row.classList.contains('done'),
        moves: [...row.querySelectorAll('.move')].map(button => button.disabled),
      })),
    }), label))
    try {
      await page.goto(`http://127.0.0.1:${server.address().port}/`)
      await page.locator('.issues').waitFor()
      const appNode = await page.locator('.app').elementHandle()
      const initialList = await page.locator('.issues').elementHandle()
      await snapshot('initial')

      await page.locator('.issues li').nth(0).locator('.check').click()
      await page.waitForFunction(() => document.title === '(2) Issues')
      assert.equal(await page.title(), '(2) Issues')
      await snapshot('toggle')
      assert.equal(await initialList.evaluate(node => node === document.querySelector('.issues')), true, `${kind}: list remounted on item update`)

      const retained = await page.locator('.issues li').nth(1).elementHandle()
      await page.locator('.issues li').nth(1).locator('.title').dblclick()
      await page.locator('.issues li').nth(1).locator('.edit').fill('Updated documentation')
      await page.locator('.issues li').nth(1).locator('.edit').press('Enter')
      await page.locator('.issues li').nth(1).locator('.title').waitFor()
      assert.equal(await retained.evaluate(node => node === document.querySelectorAll('.issues li')[1]), true)
      await snapshot('rename')

      await page.locator('.issues li').nth(1).locator('.move').nth(1).click()
      await page.waitForFunction(node => node === document.querySelectorAll('.issues li')[2], retained)
      assert.equal(await retained.evaluate(node => node === document.querySelectorAll('.issues li')[2]), true, `${kind}: moved keyed row lost identity`)
      await page.locator('.issues li').nth(3).locator('.delete').click()
      await page.waitForFunction(() => document.title === '(1) Issues')
      await snapshot('move-delete')
      assert.equal(await appNode.evaluate(node => node === document.querySelector('.app')), true, `${kind}: application root remounted`)

      await page.locator('.topbar button.secondary').click()
      await page.getByRole('link', { name: 'Stats' }).click()
      await page.locator('.stats').waitFor()
      await page.getByRole('button', { name: 'Increment by reading state' }).click()
      await page.getByRole('button', { name: 'Increment with an updater' }).click()
      await snapshot('stats')

      await page.getByRole('link', { name: 'Board' }).click()
      await page.locator('.issues').waitFor()
      await page.getByRole('link', { name: 'Stats' }).click()
      await page.locator('.stats').waitFor()
      assert.equal(await page.locator('.click-count').textContent(), '0', `${kind}: routed Stats state did not reset on genuine remount`)
      await snapshot('stats-remount')

      await page.getByRole('link', { name: 'New' }).click()
      await page.locator('.issue-form').waitFor()
      await snapshot('form-initial')
      const titleInput = page.locator('input[placeholder="Something to fix"]')
      await titleInput.fill('x')
      await titleInput.evaluate(input => input.setSelectionRange(0, 1))
      await titleInput.press('Enter')
      assert.equal(await page.locator('.error').textContent(), 'Title must be at least 3 characters')
      await snapshot('form-invalid-short')
      await titleInput.fill('x'.repeat(61))
      assert.equal(await page.locator('.error').textContent(), 'Title must be 60 characters or fewer')
      await snapshot('form-invalid-long')
      await titleInput.fill('x'.repeat(60))
      assert.equal(await page.locator('.error').count(), 0)
      await snapshot('form-valid-maximum')
      await titleInput.fill('Renamed issue title')
      await page.locator('select').selectOption('high')
      await titleInput.evaluate(input => input.setSelectionRange(2, 7))
      await snapshot('form-valid')
      await page.getByRole('button', { name: 'Add issue' }).click()
      await page.locator('.issues').waitFor()
      assert.equal(await page.locator('.title').last().textContent(), 'Renamed issue title')
      await snapshot('add')

      await page.locator('.issues li').nth(0).locator('.title').dblclick()
      await page.locator('.issues li').nth(0).locator('.edit').fill('discarded title')
      await page.locator('.issues li').nth(0).locator('.edit').press('Escape')
      await page.locator('.issues li').nth(0).locator('.title').waitFor()
      assert.notEqual(await page.locator('.issues li').nth(0).locator('.title').textContent(), 'discarded title')
      await page.locator('.issues li').nth(0).locator('.title').dblclick()
      await page.locator('.issues li').nth(0).locator('.edit').fill('Blurred title')
      await page.locator('.brand').click()
      assert.equal(await page.locator('.issues li').nth(0).locator('.title').textContent(), 'Blurred title')
      await snapshot('edit-escape-blur')

      while (await page.locator('.delete').count()) await page.locator('.delete').last().click()
      await page.locator('.empty').waitFor()
      await page.waitForFunction(() => document.title === 'Issues')
      await snapshot('empty')
      await page.locator('.topbar button.secondary').click()
      await page.locator('.topbar button.secondary').click()
      await page.getByRole('link', { name: 'New' }).click()
      await page.locator('input[placeholder="Something to fix"]').fill('Restored issue')
      await page.getByRole('button', { name: 'Add issue' }).click()
      await page.locator('.issues').waitFor()
      await snapshot('recreated')
      assert.equal(await appNode.evaluate(node => node === document.querySelector('.app')), true, `${kind}: application root remounted during workflow`)

      let events = []
      if (kind === 'phase6') {
        await page.evaluate(() => globalThis.__RRJS_ACCEPTANCE_UNMOUNT__())
        events = await page.evaluate(() => globalThis.__RRJS_EVENTS__)
        const created = events.filter(event => event.kind === 'component-create')
        assert.deepEqual(created.map(event => event.component), ['App', 'ThemeProvider', 'Shell', 'IssueList', 'Stats', 'IssueList', 'Stats', 'IssueForm', 'IssueList', 'IssueForm', 'IssueList'])
        assertArchitecture(events, { instances: 11 })
        assert.equal(await page.locator('#root').textContent(), '')
        const afterUnmount = events.length
        await page.evaluate(() => { location.hash = '#/stats'; window.dispatchEvent(new HashChangeEvent('hashchange')) })
        await page.waitForTimeout(25)
        events = await page.evaluate(() => globalThis.__RRJS_EVENTS__)
        assertNoReactiveWork(events, afterUnmount)
        await page.evaluate(() => globalThis.__RRJS_ACCEPTANCE_STOP__?.())
      }
      assert.deepEqual(errors, [])
      runs.push({ kind, checkpoints, events })
    } finally {
      await page.close()
      await new Promise(resolveClose => server.close(resolveClose))
    }
  }
  assert.deepEqual(runs[1].checkpoints, runs[0].checkpoints, 'P5: unchanged-app browser behavior diverged')
  const report = {
    status: 'PASS', browser: browser.version(), componentSources: targetSources,
    outputHashes: {
      react: outputHashes(resolve(root, 'apps/flip/dist-react')),
      phase6: outputHashes(resolve(root, 'apps/flip/dist-phase6')),
    },
    runs,
  }
  const out = resolve(root, '.private/acceptance/phase6-browser.json')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(report, null, 2))
  console.log(`Chrome ${browser.version()}: PASS; ${runs[1].checkpoints.length} unchanged-app checkpoints; report ${out}`)
} finally { await browser.close() }
