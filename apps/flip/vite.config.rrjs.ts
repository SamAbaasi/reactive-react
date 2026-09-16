import { defineConfig } from 'vite'
import babel from '@babel/core'
import reactiveReact from '@rrjs/babel-plugin'
import { fileURLToPath } from 'node:url'

// Signal-engine target. Two differences from the React config:
//   1. JSX goes through @rrjs/babel-plugin instead of esbuild's React runtime.
//   2. 'react' resolves to @rrjs/react-compat.
// No component source is transformed beyond the JSX itself.
export default defineConfig({
  resolve: {
    alias: {
      react: fileURLToPath(new URL('./node_modules/@rrjs/react-compat/dist/index.js', import.meta.url)),
    },
  },
  esbuild: { jsx: 'preserve' },
  optimizeDeps: { esbuildOptions: { jsx: 'preserve' } },
  plugins: [
    {
      // One index.html serves both targets; the config swaps the entry script.
      name: 'rrjs-entry',
      transformIndexHtml: {
        order: 'pre',
        handler(html: string) {
          return html.replace('/src/main.react.tsx', '/src/main.rrjs.tsx')
        },
      },
    },
    {
      name: 'rrjs-jsx',
      enforce: 'pre',
      async transform(code, id) {
        if (!/\.(tsx|jsx)$/.test(id.split('?')[0])) return null
        const result = await babel.transformAsync(code, {
          filename: id,
          plugins: [reactiveReact],
          presets: ['@babel/preset-typescript'],
          parserOpts: { plugins: ['jsx', 'typescript'] },
          configFile: false,
          babelrc: false,
        })
        return { code: result?.code ?? code, map: result?.map }
      },
    },
  ],
  server: { port: 5211 },
  build: { outDir: 'dist-rrjs' },
})
