import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

await build({
  absWorkingDir: fileURLToPath(new URL('..', import.meta.url)),
  entryPoints: ['.build/entry.mjs'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: '.build/rrjs.mjs',
  logLevel: 'error',
})
