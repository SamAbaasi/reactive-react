import { defineConfig } from 'vite'
import babel from '@babel/core'
import reactiveReact from '@rrjs/babel-plugin'

// Emits a single dist/main.js, which is what the harness's index.html loads.
// No hashing, no code splitting, no module preload — the reference adapters ship
// one classic script and anything else would change what the size benchmark
// measures.
export default defineConfig({
  plugins: [
    {
      name: 'reactive-react-jsx',
      enforce: 'pre',
      async transform(code, id) {
        if (!/\.(tsx|jsx)$/.test(id.split('?')[0])) return null
        const result = await babel.transformAsync(code, {
          filename: id,
          plugins: [[reactiveReact, { runOnce: false }]],
          presets: ['@babel/preset-typescript'],
          parserOpts: { plugins: ['jsx', 'typescript'] },
        })
        return { code: result?.code ?? code, map: result?.map }
      },
    },
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: 'terser',
    sourcemap: false,
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: 'src/main.tsx',
      output: { entryFileNames: 'main.js', format: 'iife', inlineDynamicImports: true },
    },
  },
})
