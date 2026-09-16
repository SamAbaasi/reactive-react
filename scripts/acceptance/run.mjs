import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const manifest = JSON.parse(readFileSync(resolve(root, 'scripts/acceptance/manifest.json'), 'utf8'))
const phaseArgument = process.argv.find(argument => argument.startsWith('--phase='))
const phase = phaseArgument ? Number(phaseArgument.slice('--phase='.length)) : 0
if (![0, 1, 2, 3, 4, 5, 6, 7].includes(phase)) throw new Error(`Unsupported acceptance phase: ${phaseArgument}`)
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const directory = resolve(root, '.private/acceptance', stamp)
mkdirSync(directory, { recursive: true })
const digest = value => createHash('sha256').update(value).digest('hex')
function fingerprint() {
  const files = {}
  function walk(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (['node_modules', '.git', '.private'].includes(entry.name) || entry.name.startsWith('dist')) continue
      const child = resolve(path, entry.name)
      if (entry.isDirectory()) walk(child)
      else if (/\.(tsx?|jsx?|mjs|json)$/.test(entry.name)) files[relative(root, child).replace(/\\/g, '/')] = digest(readFileSync(child))
    }
  }
  for (const folder of ['packages', 'scripts', 'apps/compat-audit/tests', 'apps/flip/src']) walk(resolve(root, folder))
  for (const name of ['vite.config.run-once.ts', 'vite.config.run-once-reference.ts', 'vite.config.phase6.ts', 'vite.config.react.ts', 'phase6.module-contracts.ts', 'vite.config.phase7.ts', 'vite.config.phase7.react.ts', 'phase7.module-contracts.ts']) {
    const path = 'apps/flip/' + name
    files[path] = digest(readFileSync(resolve(root, path)))
  }
  return { digest: digest(JSON.stringify(Object.entries(files).sort())), files }
}
const before = fingerprint()
const phaseScopes = { 0: manifest.scope, 1: manifest.phase1Scope, 2: manifest.phase2Scope, 3: manifest.phase3Scope, 4: manifest.phase4Scope, 5: manifest.phase5Scope, 6: manifest.phase6Scope, 7: manifest.phase7Scope }
const report = { phase, scope: phaseScopes[phase], started: new Date().toISOString(), node: process.version, platform: process.platform, architecture: process.arch, source: before, status: 'RUNNING', steps: [], limits: manifest.explicitLimits }
const steps = [
  ['build-packages', 'scripts/build-all.mjs', [], '.'],
  ['negative-controls', 'scripts/acceptance/controls.mjs', [], '.'],
  ['same-source-node', 'scripts/verify-run-once.mjs', [], '.'],
  ['package-tests', 'scripts/test-all.mjs', [], '.'],
  ['integration-tests', 'apps/compat-audit/node_modules/vitest/vitest.mjs', ['run', '--maxWorkers=1', '--minWorkers=1'], 'apps/compat-audit'],
  ['production-target', 'apps/flip/node_modules/vite/bin/vite.js', ['build', '--config', 'vite.config.run-once.ts'], 'apps/flip'],
  ['production-reference', 'apps/flip/node_modules/vite/bin/vite.js', ['build', '--config', 'vite.config.run-once-reference.ts'], 'apps/flip'],
  ['production-browser', 'scripts/verify-run-once-browser.mjs', [], '.'],
  ['oracle-build', 'apps/oracle/src/build.mjs', [], 'apps/oracle'],
  ['oracle-regression', 'apps/oracle/src/run.mjs', ['--explore', '100'], 'apps/oracle'],
]
if (phase >= 6) steps.push(
  ['phase6-target', 'apps/flip/node_modules/vite/bin/vite.js', ['build', '--config', 'vite.config.phase6.ts'], 'apps/flip'],
  ['phase6-reference', 'apps/flip/node_modules/vite/bin/vite.js', ['build', '--config', 'vite.config.react.ts'], 'apps/flip'],
  ['phase6-browser', 'scripts/verify-phase6-browser.mjs', [], '.'],
  ['node-esm', 'scripts/verify-node-esm.mjs', [], '.'],
  ['external-consumer', 'scripts/verify-external-consumer.mjs', [], '.'],
)
if (phase === 7) steps.push(
  ['phase7-target', 'apps/flip/node_modules/vite/bin/vite.js', ['build', '--config', 'vite.config.phase7.ts'], 'apps/flip'],
  ['phase7-reference', 'apps/flip/node_modules/vite/bin/vite.js', ['build', '--config', 'vite.config.phase7.react.ts'], 'apps/flip'],
  ['phase7-browser', 'scripts/verify-phase7-browser.mjs', [], '.'],
)
try {
  for (const [name, script, args, cwd] of steps) {
    console.log('Acceptance: ' + name)
    const started = Date.now()
    const result = spawnSync(process.execPath, [resolve(root, script), ...args], { cwd: resolve(root, cwd), encoding: 'utf8', timeout: 300000 })
    const output = (result.stdout ?? '') + (result.stderr ?? '')
    writeFileSync(resolve(directory, name + '.log'), output)
    report.steps.push({ name, command: [process.execPath, script, ...args], cwd, exitCode: result.status, elapsedMs: Date.now() - started })
    if (result.status !== 0) throw new Error(name + ' failed: ' + (result.error?.message ?? output.slice(-2500)))
    if (name === 'package-tests') console.log(output.trim())
  }
  const after = fingerprint()
  if (before.digest !== after.digest) throw new Error('Source changed during acceptance; results cannot certify the final tree')
  const browserArtifact = phase === 7 ? '.private/acceptance/phase7-browser.json'
    : phase === 6 ? '.private/acceptance/phase6-browser.json'
      : '.private/acceptance/browser.json'
  report.browser = JSON.parse(readFileSync(resolve(root, browserArtifact), 'utf8'))
  report.status = 'PASS'
} catch (error) {
  report.status = 'FAIL'
  report.error = error.message
  console.error(error.message)
} finally {
  report.finished = new Date().toISOString()
  writeFileSync(resolve(directory, 'report.json'), JSON.stringify(report, null, 2))
  console.log('Acceptance ' + report.status + ': ' + relative(root, resolve(directory, 'report.json')))
}
process.exit(report.status === 'PASS' ? 0 : 1)
