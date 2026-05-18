import { defineConfig } from 'vite'
import babel from '@babel/core'
import reactiveReact from '@rrjs/babel-plugin'

export default defineConfig({
  // Tell esbuild to treat .tsx and .jsx as TypeScript.
  // TypeScript's JSX support is more permissive than the standalone JSX loader —
  // it does not validate JSX syntax, just strips/transforms types.
  // We rely on Babel to do the real JSX transform via the plugin below.
  esbuild: {
    loader: 'tsx',
    include: /\.(tsx?|jsx?)$/,
    exclude: [],
    jsx: 'preserve',
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.ts': 'ts',
        '.tsx': 'tsx',
        '.js': 'ts',
        '.jsx': 'tsx',
      },
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
          sourceMaps: true,
        })
        return { code: result?.code ?? code, map: result?.map }
      },
    },
  ],
  server: { port: 3001 },
})