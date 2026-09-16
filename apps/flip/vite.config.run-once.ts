import { defineConfig } from 'vite'
import babel from '@babel/core'
import reactiveReact from '@rrjs/babel-plugin'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { assertNoReactRuntime } from '../../scripts/acceptance/gates.mjs'

const sourceHashes: Record<string, string> = {}

export default defineConfig({
  resolve: {
    alias: [{ find: /^react$/, replacement: fileURLToPath(new URL('./node_modules/@rrjs/react-compat/dist/index.js', import.meta.url)) }],
  },
  esbuild: { jsx: 'preserve' },
  plugins: [
    {
      name: 'run-once-entry',
      transformIndexHtml: { order: 'pre', handler: html => html.replace('/src/main.react.tsx', '/src/main.run-once.tsx') },
    },
    {
      name: 'run-once-compiler',
      enforce: 'pre',
      async transform(code, id) {
        if (!/\.(tsx|jsx)$/.test(id.split('?')[0])) return null
        sourceHashes[id.replace(/\\/g, '/')] = createHash('sha256').update(code).digest('hex')
        const result = await babel.transformAsync(code, {
          filename: id,
          plugins: [[reactiveReact, { runOnce: true }]],
          presets: ['@babel/preset-typescript'],
          configFile: false, babelrc: false,
        })
        return { code: result?.code ?? code, map: result?.map }
      },
      generateBundle(_options, bundle) {
        const modules = [...this.getModuleIds()]
        assertNoReactRuntime(modules)
        const rendered = Object.values(bundle).filter(output => output.type === 'chunk').flatMap(output => Object.entries(output.modules).map(([id, info]) => ({ id, exports: info.renderedExports })))
        if (rendered.some(module => /packages\/renderer\/dist\/index\.js$/.test(module.id.replace(/\\/g, '/')) && module.exports.includes('list'))) this.error('P2: keyed reconciler included in production chunk')
        this.emitFile({ type: 'asset', fileName: 'acceptance-build.json', source: JSON.stringify({ sourceHashes, modules, rendered }, null, 2) })
      },
    },
  ],
  server: { port: 5212, strictPort: true },
  build: { outDir: 'dist-run-once' },
})
