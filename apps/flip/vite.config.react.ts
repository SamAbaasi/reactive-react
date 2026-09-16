import { defineConfig } from 'vite'
import { createHash } from 'node:crypto'

const sourceHashes: Record<string, string> = {}

// React target: esbuild's automatic JSX runtime, nothing else.
export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  plugins: [{
    name: 'react-acceptance-manifest',
    enforce: 'pre',
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
  server: { port: 5210 },
  build: { outDir: 'dist-react' },
})
