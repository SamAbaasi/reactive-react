import { defineConfig } from 'vite'
import { createHash } from 'node:crypto'

const sourceHashes: Record<string, string> = {}
export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  plugins: [{
    name: 'reference-evidence',
    enforce: 'pre',
    transformIndexHtml: { order: 'pre', handler: html => html.replace('/src/main.react.tsx', '/src/main.run-once-reference.tsx') },
    transform(code, id) {
      if (/\.(tsx|jsx)$/.test(id)) sourceHashes[id.replace(/\\/g, '/')] = createHash('sha256').update(code).digest('hex')
      return null
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'acceptance-build.json', source: JSON.stringify({ sourceHashes, modules: [...this.getModuleIds()] }, null, 2) })
    },
  }],
  build: { outDir: 'dist-run-once-reference' },
})
