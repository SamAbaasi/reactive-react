#!/usr/bin/env node
/** Clear dist/ and tsc every package, in dependency order. */
import { spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
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
  // tsc never deletes output whose source has gone, and each package publishes
  // dist/ whole: @rrjs/react-compat and @rrjs/renderer 0.2.0 and 0.2.1 shipped
  // files compiled from an experiment that was never committed.
  rmSync(join(dir, 'dist'), { recursive: true, force: true })
  const r = spawnSync(process.execPath, [tsc], { cwd: dir, stdio: 'inherit' })
  if (r.status !== 0) process.exit(r.status ?? 1)
  console.log(`built @rrjs/${name}`)
}
