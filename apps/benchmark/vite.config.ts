import { defineConfig } from 'vite'
import babel from '@babel/core'
import reactiveReact from 'babel-plugin-reactive-react'

export default defineConfig({
  base: './',
  esbuild: {
    loader: 'tsx',
    include: /\.(tsx?|jsx?)$/,
    exclude: [],
    jsx: 'preserve',
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: { '.ts': 'ts', '.tsx': 'tsx' },
      jsx: 'preserve',
    },
  },
  plugins: [
    {
      name: 'reactive-react-jsx',
      enforce: 'pre',
      async transform(code, id) {
        if (!id.endsWith('.tsx') && !id.endsWith('.jsx')) return null
        const result = await babel.transformAsync(code, {
          filename: id,
          plugins: [reactiveReact],
          presets: ['@babel/preset-typescript'],
          parserOpts: { plugins: ['jsx', 'typescript'] },
        })
        return { code: result?.code ?? code, map: result?.map }
      },
    },
  ],
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
  },
})