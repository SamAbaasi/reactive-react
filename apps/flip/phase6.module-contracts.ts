import { defineModuleContracts } from '@rrjs/babel-plugin'
import { fileURLToPath } from 'node:url'

export const phase6ModuleContracts = defineModuleContracts({
  root: fileURLToPath(new URL('./src', import.meta.url)),
  modules: {
    'main.phase6.tsx': {
      imports: {
        './App': { components: { App: [] } },
      },
    },
    'App.tsx': {
      imports: {
        './ThemeContext': {
          hooks: ['useTheme'],
          components: { ThemeProvider: ['children'] },
        },
        './IssueList': {
          components: {
            IssueList: {
              props: ['issues', 'onToggle', 'onDelete', 'onRename', 'onMove'],
              operationKeys: { issues: 'id' },
            },
          },
        },
        './IssueForm': { components: { IssueForm: ['onAdd'] } },
        './Stats': { components: { Stats: ['issues'] } },
      },
    },
    'IssueList.tsx': {
      imports: { './ThemeContext': { hooks: ['useTheme'] } },
      operationProps: ['issues'],
      operationKeyProps: { issues: 'id' },
    },
    'IssueForm.tsx': {},
    'Stats.tsx': {
      imports: { './ThemeContext': { hooks: ['useTheme'] } },
      operationProps: ['issues'],
    },
    'ThemeContext.tsx': {},
  },
})
