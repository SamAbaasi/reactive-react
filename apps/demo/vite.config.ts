import { defineConfig } from 'vite'
import babel from '@babel/core'
import reactiveReactPlugin from 'babel-plugin-reactive-react'

export default defineConfig({
  esbuild: {
    jsx: 'preserve',
  },
  plugins: [
    {
      name: 'reactive-react-jsx',
      enforce: 'pre',
      async transform(code, id) {
        if (!id.endsWith('.tsx') && !id.endsWith('.jsx')) return null

        const result = await babel.transformAsync(code, {
          filename: id,
          plugins: [reactiveReactPlugin],
          presets: ['@babel/preset-typescript'],
          parserOpts: { plugins: ['jsx', 'typescript'] },
          sourceMaps: true,
        })

        return { code: result?.code ?? code, map: result?.map }
      },
    },
  ],
  server: { port: 3000 },
})