#!/usr/bin/env node
// Copies the adapters from apps/benchmark into the vendored js-framework-benchmark
// checkout at .bench-harness/frameworks/keyed/. The adapters live in this repo and
// are version-controlled; .bench-harness is a gitignored clone. This script is the
// only thing that writes into it, so the harness side is always reproducible from
// a clean clone plus one command.
import { cpSync, existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const HARNESS = join(ROOT, '.bench-harness')

const ADAPTERS = [
  { src: 'apps/benchmark/keyed-idiomatic', name: 'reactive-react' },
  { src: 'apps/benchmark/keyed-signals', name: 'reactive-react-signals' },
]

if (!existsSync(HARNESS)) {
  console.error('.bench-harness is missing. Run:\n  git clone --depth 1 https://github.com/krausest/js-framework-benchmark.git .bench-harness')
  process.exit(1)
}

for (const { src, name } of ADAPTERS) {
  const from = join(ROOT, src)
  const to = join(HARNESS, 'frameworks', 'keyed', name)

  if (!existsSync(join(from, 'dist', 'main.js'))) {
    console.error(`${src}/dist/main.js missing — build it first:\n  npx vite build --config ${src}/vite.config.ts`)
    process.exit(1)
  }

  rmSync(to, { recursive: true, force: true })
  mkdirSync(to, { recursive: true })

  for (const entry of ['index.html', 'package.json', 'package-lock.json', 'dist', 'src']) {
    const s = join(from, entry)
    if (existsSync(s)) cpSync(s, join(to, entry), { recursive: true })
  }

  // The harness resolves a framework's version out of its package-lock.json. Our
  // packages are file: links, which npm records as {"link": true} with no version,
  // so frameworkVersionFromPackage cannot work here. Stamp an explicit
  // frameworkVersion instead, read from the real @rrjs/renderer manifest at sync
  // time so it cannot drift from what is actually being measured.
  const rendererPkg = JSON.parse(
    readFileSync(join(ROOT, 'packages', 'renderer', 'package.json'), 'utf8')
  )
  const manifestPath = join(to, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  delete manifest['js-framework-benchmark'].frameworkVersionFromPackage
  manifest['js-framework-benchmark'].frameworkVersion = rendererPkg.version
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')

  console.log(`synced ${src} -> frameworks/keyed/${name}  (@rrjs/renderer ${rendererPkg.version})`)
}
