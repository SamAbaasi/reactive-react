import { defineConfig } from 'vite'
import { createHash } from 'node:crypto'

const sourceHashes: Record<string, string> = {}

export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  plugins: [{
    name: 'phase7-reference',
    enforce: 'pre',
    transformIndexHtml: { order: 'pre', handler: html => html.replace('/src/main.react.tsx', '/src/main.phase7.react.tsx') },
    transform(code, id) {
      if (/\.(tsx|jsx)$/.test(id.split('?')[0])) sourceHashes[id.replace(/\\/g, '/')] = createHash('sha256').update(code).digest('hex')
      return null
    },
    generateBundle(_options, bundle) {
      const modules = [...this.getModuleIds()]
      const rendered = Object.values(bundle).filter(output => output.type === 'chunk')
        .flatMap(output => Object.entries(output.modules).map(([id, info]) => ({ id, exports: info.renderedExports })))
      this.emitFile({ type: 'asset', fileName: 'acceptance-build.json', source: JSON.stringify({ sourceHashes, modules, rendered }, null, 2) })
    },
  }],
  build: { outDir: 'dist-phase7-react' },
})
