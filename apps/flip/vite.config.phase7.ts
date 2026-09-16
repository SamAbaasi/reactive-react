import { defineConfig } from 'vite'
import babel from '@babel/core'
import reactiveReact, { resolveModuleMetadata } from '@rrjs/babel-plugin'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { assertNoReactRuntime } from '../../scripts/acceptance/gates.mjs'
import { phase7ModuleContracts } from './phase7.module-contracts'

const sourceHashes: Record<string, string> = {}

export default defineConfig({
  resolve: {
    alias: [{ find: /^react$/, replacement: fileURLToPath(new URL('./node_modules/@rrjs/react-compat/dist/index.js', import.meta.url)) }],
  },
  esbuild: { jsx: 'preserve', keepNames: true },
  plugins: [
    {
      name: 'phase7-entry',
      transformIndexHtml: { order: 'pre', handler: html => html.replace('/src/main.react.tsx', '/src/main.phase7.tsx') },
    },
    {
      name: 'phase7-run-once-compiler',
      enforce: 'pre',
      async transform(code, id) {
        if (!/\.(tsx|jsx)$/.test(id.split('?')[0])) return null
        sourceHashes[id.replace(/\\/g, '/')] = createHash('sha256').update(code).digest('hex')
        const moduleMetadata = resolveModuleMetadata(phase7ModuleContracts, id)
        const result = await babel.transformAsync(code, {
          filename: id,
          plugins: [[reactiveReact, { runOnce: true, moduleMetadata }]],
          presets: ['@babel/preset-typescript'],
          configFile: false,
          babelrc: false,
        })
        return { code: result?.code ?? code, map: result?.map }
      },
      generateBundle(_options, bundle) {
        const modules = [...this.getModuleIds()]
        assertNoReactRuntime(modules)
        const rendered = Object.values(bundle).filter(output => output.type === 'chunk')
          .flatMap(output => Object.entries(output.modules).map(([id, info]) => ({ id, exports: info.renderedExports })))
        this.emitFile({ type: 'asset', fileName: 'acceptance-build.json', source: JSON.stringify({ sourceHashes, modules, rendered }, null, 2) })
      },
    },
  ],
  build: { outDir: 'dist-phase7' },
})
