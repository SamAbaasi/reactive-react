#!/usr/bin/env node
/**
 * Runs the full test suite across all four @rrjs packages and prints a
 * per-package breakdown plus a single summary line.
 *
 * Why the build step: packages/renderer/tests and 4 of the react-compat
 * suites import the bare specifiers '@rrjs/signals' / '@rrjs/react-compat',
 * which resolve through node_modules to each package's `main` -> ./dist.
 * On a clean checkout those dist folders do not exist and the suites fail to
 * collect (they report as failed *files*, not failed tests). So we compile
 * signals and react-compat first.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const TMP = join(ROOT, 'node_modules', '.rrjs-test-results')

// Order matters: dependencies are compiled before their dependents are tested.
const PACKAGES = ['signals', 'react-compat', 'renderer', 'babel-plugin']
const BUILD_FIRST = ['signals', 'react-compat']

const run = (cmd, args, cwd) =>
  spawnSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

function fail(msg) {
  console.error(`\n  ${msg}\n`)
  process.exit(1)
}

function localBin(pkgDir, rel) {
  const p = join(pkgDir, 'node_modules', rel)
  return existsSync(p) ? p : null
}

// ---------------------------------------------------------------- preflight
for (const name of PACKAGES) {
  const dir = join(ROOT, 'packages', name)
  if (!existsSync(join(dir, 'node_modules'))) {
    fail(`packages/${name}/node_modules is missing. Run: npm run install:all`)
  }
}

// ------------------------------------------------------------------- build
process.stdout.write('building dependencies ')
for (const name of BUILD_FIRST) {
  const dir = join(ROOT, 'packages', name)
  const tsc = localBin(dir, 'typescript/bin/tsc')
  if (!tsc) fail(`typescript not installed in packages/${name}`)
  const r = run(process.execPath, [tsc], dir)
  if (r.status !== 0) {
    console.error(`\n  tsc failed in packages/${name}:\n${r.stdout || ''}${r.stderr || ''}`)
    process.exit(1)
  }
  process.stdout.write('.')
}
console.log(' ok\n')

// ------------------------------------------------------------------- tests
rmSync(TMP, { recursive: true, force: true })
mkdirSync(TMP, { recursive: true })

const rows = []
let anyRunnerError = false

for (const name of PACKAGES) {
  const dir = join(ROOT, 'packages', name)
  const vitest = localBin(dir, 'vitest/vitest.mjs')
  if (!vitest) fail(`vitest not installed in packages/${name}`)

  const outFile = join(TMP, `${name}.json`)
  const r = run(
    process.execPath,
    [vitest, 'run', '--reporter=json', `--outputFile=${outFile}`],
    dir
  )

  if (!existsSync(outFile)) {
    anyRunnerError = true
    rows.push({ name, total: 0, passed: 0, failed: 0, skipped: 0, files: 0, ms: 0, crashed: true })
    console.error(`  ! packages/${name}: runner produced no report\n${r.stderr || r.stdout || ''}`)
    continue
  }

  const j = JSON.parse(readFileSync(outFile, 'utf8'))
  const skipped = (j.numPendingTests || 0) + (j.numTodoTests || 0)
  rows.push({
    name,
    total: j.numTotalTests || 0,
    passed: j.numPassedTests || 0,
    failed: j.numFailedTests || 0,
    skipped,
    files: (j.testResults || []).length,
    // suite-level collection errors surface as failed files with zero tests
    fileFailures: (j.testResults || []).filter((t) => t.status === 'failed' && !(t.assertionResults || []).length).length,
    // vitest's json reporter has no top-level endTime; derive it from the files.
    ms: Math.max(0, Math.max(...(j.testResults || []).map((t) => t.endTime || 0), 0) - (j.startTime || 0)),
    crashed: false,
  })

  // Name every failure and every skip, so the number can be defended.
  for (const file of j.testResults || []) {
    for (const a of file.assertionResults || []) {
      if (a.status === 'failed') {
        console.log(`  FAIL  ${name}  ${a.fullName}`)
        for (const m of a.failureMessages || []) console.log(`        ${m.split('\n')[0]}`)
      } else if (a.status === 'pending' || a.status === 'todo') {
        console.log(`  ${a.status.toUpperCase().padEnd(4)}  ${name}  ${a.fullName}`)
      }
    }
    if (file.status === 'failed' && !(file.assertionResults || []).length) {
      console.log(`  FAIL  ${name}  ${file.name} (suite failed to load — 0 tests collected)`)
      for (const m of file.message ? [file.message] : []) console.log(`        ${m.split('\n')[0]}`)
    }
  }
}

// ------------------------------------------------------------------ report
const sum = (k) => rows.reduce((a, r) => a + (r[k] || 0), 0)
const pad = (s, n) => String(s).padEnd(n)
const lp = (s, n) => String(s).padStart(n)

console.log('')
console.log(`  ${pad('package', 20)}${lp('files', 6)}${lp('tests', 7)}${lp('pass', 7)}${lp('fail', 6)}${lp('skip', 6)}${lp('ms', 8)}`)
console.log(`  ${'-'.repeat(60)}`)
for (const r of rows) {
  console.log(
    `  ${pad('@rrjs/' + r.name, 20)}${lp(r.files, 6)}${lp(r.total, 7)}${lp(r.passed, 7)}${lp(r.failed, 6)}${lp(r.skipped, 6)}${lp(r.ms, 8)}`
  )
}
console.log(`  ${'-'.repeat(60)}`)
console.log(
  `  ${pad('TOTAL', 20)}${lp(sum('files'), 6)}${lp(sum('total'), 7)}${lp(sum('passed'), 7)}${lp(sum('failed'), 6)}${lp(sum('skipped'), 6)}${lp(sum('ms'), 8)}`
)

const failed = sum('failed')
const skipped = sum('skipped')
const fileFailures = sum('fileFailures')
const ok = failed === 0 && fileFailures === 0 && !anyRunnerError

console.log('')
console.log(
  `SUMMARY: ${sum('total')} tests across ${rows.length} packages — ` +
    `${sum('passed')} passed, ${failed} failed, ${skipped} skipped` +
    (fileFailures ? `, ${fileFailures} suite(s) failed to load` : '') +
    ` — ${ok ? 'PASS' : 'FAIL'}`
)

process.exit(ok ? 0 : 1)
