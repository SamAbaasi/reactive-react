import { defineModuleContracts } from '@rrjs/babel-plugin'
import { fileURLToPath } from 'node:url'

export const phase7ModuleContracts = defineModuleContracts({
  root: fileURLToPath(new URL('./src', import.meta.url)),
  modules: {
    'main.phase7.tsx': {
      imports: { './SvgPhase7': { components: { SvgPhase7: [] } } },
    },
    'SvgPhase7.tsx': {},
  },
})
