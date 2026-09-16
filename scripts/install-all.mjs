#!/usr/bin/env node
/** npm install in every package (no npm workspaces here — each package has its own lockfile). */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const TARGETS = [
  'packages/signals',
  'packages/react-compat',
  'packages/renderer',
  'packages/babel-plugin',
]
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

for (const t of TARGETS) {
  const dir = join(ROOT, t)
  if (!existsSync(dir)) continue
  console.log(`\n=== npm install — ${t} ===`)
  const r = spawnSync(npm, ['install', '--no-audit', '--no-fund'], {
    cwd: dir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (r.status !== 0) process.exit(r.status ?? 1)
}
console.log('\nall packages installed')
