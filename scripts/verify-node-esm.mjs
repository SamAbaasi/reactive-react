#!/usr/bin/env node
/**
 * D13 instrument: import every compiled package with Node's ESM loader.
 * Bundlers hide extensionless specifiers; this does not.
 *
 * Requires dist/ (run `npm run build:all` first).
 *
 * This ends with a forced exit, so it cannot tell whether a package keeps Node
 * alive after import. That is asserted, with no forced exit, by the lifetime
 * check in verify-external-consumer.mjs.
 */
import { pathToFileURL } from 'node:url'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const PACKAGES = ['signals', 'react-compat', 'renderer', 'babel-plugin']

let failed = 0
for (const name of PACKAGES) {
  const entry = join(ROOT, 'packages', name, 'dist', 'index.js')
  if (!existsSync(entry)) {
    console.error(`FAIL  @rrjs/${name}  dist/index.js missing — run npm run build:all`)
    failed++
    continue
  }
  try {
    const mod = await import(pathToFileURL(entry).href)
    const keys = Object.keys(mod).sort()
    console.log(`ok    @rrjs/${name}  ${keys.length} exports`)
  } catch (err) {
    console.error(`FAIL  @rrjs/${name}  ${err.message}`)
    failed++
  }
}

if (failed) {
  console.error(`\nverify-node-esm: ${failed} package(s) failed`)
  process.exit(1)
}
console.log('\nverify-node-esm: PASS')
process.exit(0)
