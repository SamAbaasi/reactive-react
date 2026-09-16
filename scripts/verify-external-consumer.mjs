#!/usr/bin/env node
/** Pack all public packages and verify them from a fresh temporary consumer. */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, writeFileSync, rmSync, existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const PACKAGES = ['signals', 'react-compat', 'renderer', 'babel-plugin']
const require = createRequire(import.meta.url)

function run(cmd, args, cwd) {
  const npmCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
  const windowsNpm = cmd === 'npm' && process.platform === 'win32'
  const command = windowsNpm ? process.execPath : cmd
  const commandArgs = windowsNpm ? [npmCli, ...args] : args
  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    // A fresh npm install can spend more than two minutes resolving peer
    // dependencies on slower Windows runners even though every rrjs input is a
    // local tarball. Keep a finite guard, but leave enough room for that work.
    timeout: 300_000,
  })
  if (result.status !== 0) {
    const error = [result.stderr, result.stdout, result.error?.message].filter(Boolean).join('\n').trim()
    throw new Error(`${cmd} ${args.join(' ')} exited ${result.status} in ${cwd}:\n${error}`)
  }
  return result
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

for (const name of PACKAGES) {
  if (!existsSync(join(ROOT, 'packages', name, 'dist', 'index.js'))) {
    throw new Error(`dist missing for @rrjs/${name}; run npm run build:all`)
  }
}

const workspace = mkdtempSync(join(tmpdir(), 'rrjs-consumer-check-'))
const packDir = join(workspace, 'packs')
const consumer = join(workspace, 'consumer')
const versions = {}

try {
  mkdirSync(packDir)
  mkdirSync(consumer)
  const tarballs = []
  for (const name of PACKAGES) {
    const packageDir = join(ROOT, 'packages', name)
    const packageJson = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
    versions[packageJson.name] = packageJson.version
    // Installing the four tarballs together satisfies every internal import
    // whatever the manifest says, so a workspace-only specifier survives this
    // gate and reaches the registry. @rrjs/renderer@0.1.7 shipped with
    // `file:../signals` and cannot be installed from npm at all. Check the
    // declared specifier itself, before packing.
    for (const field of ['dependencies', 'peerDependencies']) {
      for (const [dependency, range] of Object.entries(packageJson[field] ?? {})) {
        if (!dependency.startsWith('@rrjs/')) continue
        if (/^(file|link|workspace):/.test(range)) {
          throw new Error(`${packageJson.name} declares ${field}.${dependency} as "${range}"; a published package cannot resolve a workspace path`)
        }
      }
    }
    run('npm', ['pack', '--silent', '--pack-destination', packDir], packageDir)
  }
  for (const file of readdirSync(packDir).filter(file => file.endsWith('.tgz')).sort()) tarballs.push(join(packDir, file))
  if (tarballs.length !== PACKAGES.length) throw new Error(`expected ${PACKAGES.length} tarballs, found ${tarballs.length}`)

  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ name: 'rrjs-consumer', private: true, type: 'module' }, null, 2))
  run('npm', [
    'install',
    '--silent',
    '--offline',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--package-lock=false',
    ...tarballs,
  ], consumer)

  writeFileSync(join(consumer, 'import-check.mjs'), `
for (const name of ['@rrjs/react-compat', '@rrjs/renderer', '@rrjs/signals', '@rrjs/babel-plugin']) {
  const exports = Object.keys(await import(name)).sort()
  if (exports.length === 0) throw new Error(name + ' has no exports')
  console.log(name, exports.length)
}
process.exit(0)
`)
  run(process.execPath, ['import-check.mjs'], consumer)

  writeFileSync(join(consumer, 'contract-check.ts'), `
import type { ModuleContractManifest, ModuleMetadata, PluginOptions } from '@rrjs/babel-plugin'
import { defineModuleContracts, resolveModuleMetadata } from '@rrjs/babel-plugin'
import { createPortal } from '@rrjs/renderer'
const metadata: ModuleMetadata = { imports: { './Rows': { components: { Rows: { props: ['rows'], operationKeys: { rows: 'id' } } } } } }
const manifest: ModuleContractManifest = defineModuleContracts({ root: '/consumer/src', modules: { 'App.tsx': metadata } })
const options: PluginOptions = { runOnce: true, moduleMetadata: resolveModuleMetadata(manifest, '/consumer/src/App.tsx') }
declare const portalTarget: HTMLElement
const portal: Node = createPortal('typed', portalTarget)
if (!options.runOnce) throw new Error('invalid options')
if (!portal) throw new Error('invalid portal type')
`)
  writeFileSync(join(consumer, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { strict: true, noEmit: true, module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ES2022', skipLibCheck: false },
    include: ['contract-check.ts'],
  }, null, 2))
  const typescript = require.resolve('typescript/bin/tsc', { paths: [join(ROOT, 'packages', 'babel-plugin')] })
  run(process.execPath, [typescript, '-p', 'tsconfig.json'], consumer)

  writeFileSync(join(consumer, 'App.jsx'), `
import { useState } from '@rrjs/react-compat'
import { createPortal } from 'react-dom'
const portalTarget = document.getElementById('portal')
export function App() {
  const [rows, setRows] = useState([{ id: 'a', value: 1 }])
  return <main>
    <button onClick={() => setRows(previous => [...previous, { id: 'b', value: 2 }])}>add</button>
    <ul>{rows.map((row, index) => <li key={row.id} data-index={index}>{row.value}</li>)}</ul>
    {createPortal(<output>packed portal</output>, portalTarget)}
  </main>
}
`)
  writeFileSync(join(consumer, 'compile.mjs'), `
import { transformSync } from '@babel/core'
import plugin from '@rrjs/babel-plugin'
import { readFileSync, writeFileSync } from 'node:fs'
const output = transformSync(readFileSync('App.jsx', 'utf8'), {
  filename: 'App.jsx', plugins: [[plugin, { runOnce: true }]], parserOpts: { plugins: ['jsx'] },
  sourceType: 'module', configFile: false, babelrc: false,
})?.code
if (!output?.includes('operationList') || !output.includes('listAppend')) throw new Error('strict compiler omitted direct list operations')
if (output.includes("from 'react-dom'") || output.includes('from "react-dom"')) throw new Error('strict compiler did not rewrite createPortal')
writeFileSync('App.compiled.mjs', output)
writeFileSync('entry.mjs', "import { mount } from '@rrjs/renderer'; import { App } from './App.compiled.mjs'; mount(App, document.getElementById('app'));\\n")
`)
  run(process.execPath, ['compile.mjs'], consumer)

  const esbuildPath = pathToFileURL(require.resolve('esbuild/lib/main.js', { paths: [join(ROOT, 'apps', 'flip')] })).href
  writeFileSync(join(consumer, 'bundle.mjs'), `
import { build } from ${JSON.stringify(esbuildPath)}
await build({ entryPoints: ['entry.mjs'], bundle: true, format: 'esm', platform: 'browser', minify: true, outfile: 'dist/app.js' })
`)
  run(process.execPath, ['bundle.mjs'], consumer)

  const record = {
    node: process.version,
    npm: run('npm', ['--version'], consumer).stdout.trim(),
    packages: versions,
    tarballs: Object.fromEntries(tarballs.map(path => [path.split(/[\\/]/).at(-1), sha256(path)])),
    output: { 'dist/app.js': sha256(join(consumer, 'dist', 'app.js')) },
  }
  console.log(JSON.stringify(record, null, 2))
  console.log('verify-external-consumer: PASS')
} finally {
  rmSync(workspace, { recursive: true, force: true })
}
