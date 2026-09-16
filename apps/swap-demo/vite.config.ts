import { defineConfig } from 'vite'
import babel from '@babel/core'
import reactiveReact from '@rrjs/babel-plugin'

// Two JSX pipelines in one page.
//
//   *.rr.tsx     -> Babel with @rrjs/babel-plugin, JSX becomes h()/list() calls.
//   everything   -> esbuild automatic runtime, JSX becomes react/jsx-runtime calls.
//
// The rr files are transformed in a `pre` plugin, so by the time esbuild sees
// them there is no JSX left and the automatic runtime setting is a no-op for
// them. @babel/preset-typescript strips the types in the same pass.
export default defineConfig({
  base: './',
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  plugins: [
    {
      name: 'rrjs-jsx',
      enforce: 'pre',
      async transform(code, id) {
        if (!/\.rr\.tsx$/.test(id.split('?')[0])) return null
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
  build: { outDir: 'dist', sourcemap: false, minify: 'terser' },
})
