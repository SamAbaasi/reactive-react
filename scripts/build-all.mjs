#!/usr/bin/env node
/** tsc every package, in dependency order. */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const ORDER = ['signals', 'react-compat', 'renderer', 'babel-plugin']

for (const name of ORDER) {
  const dir = join(ROOT, 'packages', name)
  const tsc = join(dir, 'node_modules', 'typescript', 'bin', 'tsc')
  if (!existsSync(tsc)) {
    console.error(`typescript missing in packages/${name} — run: npm run install:all`)
    process.exit(1)
  }
  const r = spawnSync(process.execPath, [tsc], { cwd: dir, stdio: 'inherit' })
  if (r.status !== 0) process.exit(r.status ?? 1)
  console.log(`built @rrjs/${name}`)
}
