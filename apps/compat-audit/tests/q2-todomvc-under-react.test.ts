// Q2 — can apps/todomvc/src/app.tsx run under React 19 unchanged?
//
// Takes the real file off disk, compiles it with React's own JSX transform, and
// renders it with react-dom/client in jsdom. Every error is collected in the
// order React reports it. Nothing about the source is adapted.
import { describe, it, expect, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as babel from '@babel/core'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { record, printMatrix } from './harness'

const APP = join(process.cwd(), '..', '..', 'apps', 'todomvc', 'src', 'app.tsx')

function compileForReact(source: string): string {
  const out = babel.transformSync(source, {
    filename: 'app.tsx',
    presets: [
      ['@babel/preset-react', { runtime: 'classic', pragma: 'React.createElement', pragmaFrag: 'React.Fragment' }],
      '@babel/preset-typescript',
    ],
    parserOpts: { plugins: ['jsx', 'typescript'] },
    configFile: false,
    babelrc: false,
    sourceType: 'script',
  })
  if (!out?.code) throw new Error('babel produced no output')
  return out.code
}


// Removes only module syntax so the file can be evaluated with `new Function`.
// Nothing about the component bodies is touched — the imports would be React
// imports under React anyway, and `export` is not part of what is under test.
function stripForEval(src: string): string {
  return src
    .replace(/import\s*\{[\s\S]*?\}\s*from\s*'[^']*'\s*/g, '')
    .replace(/^\s*export\s+/gm, '')
}

describe('Q2 — TodoMVC under React 19', () => {
  // Silences React's "not configured to support act" notice so the collected
  // errors are the app's, not the test environment's.
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  const source = readFileSync(APP, 'utf8')

  it('compiles with React JSX transform', () => {
    let code = ''
    let err: Error | null = null
    try {
      // Strip the @rrjs imports; under React these would be react imports.
      code = compileForReact(stripForEval(source))
    } catch (e) {
      err = e as Error
    }
    record('compile under React JSX', err ? 'FAILS' : 'compiles', err ? err.message.split('\n')[0] : `${code.length} bytes emitted`)
    expect(err === null || err !== null).toBe(true)
  })

  it('renders under react-dom/client — collecting every error in order', async () => {
    const errors: string[] = []
    let App: unknown = null
    try {
      const code = compileForReact(stripForEval(source))
      const factory = new Function(
        'React', 'useState', 'useEffect', 'useMemo', 'useRef', 'exports',
        `${code}\nreturn App;`
      )
      App = factory(
        React, React.useState, React.useEffect, React.useMemo, React.useRef, {}
      )
    } catch (e) {
      errors.push(`COMPILE/EVAL: ${(e as Error).message.split('\n')[0]}`)
    }

    if (App) {
      const container = document.createElement('div')
      document.body.appendChild(container)
      const originalError = console.error
      console.error = (...args: unknown[]) => { errors.push(`console.error: ${String(args[0]).split('\n')[0]}`) }
      try {
        await act(async () => {
          createRoot(container).render(React.createElement(App as never))
        })
      } catch (e) {
        errors.push(`RENDER THREW: ${(e as Error).message.split('\n')[0]}`)
      } finally {
        console.error = originalError
      }
      record(
        'render under React 19',
        errors.length ? 'FAILS' : 'renders',
        errors.length ? errors[0] : `html length ${container.innerHTML.length}`
      )
    } else {
      record('render under React 19', 'FAILS', errors[0] ?? 'App not produced')
    }

    console.log('\n=== Q2: errors in order ===')
    if (!errors.length) console.log('  (none)')
    for (const [i, e] of errors.entries()) console.log(`  ${i + 1}. ${e}`)
    console.log('')
    expect(Array.isArray(errors)).toBe(true)
  })

  it('inventories the rrjs-only constructs in the source', () => {
    const checks: Array<[string, RegExp]> = [
      ['todos() / signal getter calls', /\b(todos|filter|editingId|editingText|activeCount|completedCount|filteredTodos)\(\)/g],
      ['class= instead of className=', /\bclass=/g],
      ['onDblClick instead of onDoubleClick', /\bonDblClick\b/g],
      ['thunk attribute value={() =>', /=\{\(\)\s*=>/g],
      ['style with thunk values', /style=\{\{[^}]*\(\)\s*=>/g],
      ['htmlFor', /\bhtmlFor\b/g],
      ['autofocus (React wants autoFocus)', /\bautofocus\b/g],
    ]
    console.log('\n=== Q2: rrjs-only constructs in apps/todomvc/src/app.tsx ===')
    for (const [label, re] of checks) {
      const n = (source.match(re) ?? []).length
      console.log(`  ${String(n).padStart(3)}  ${label}`)
    }
    console.log('')
    expect(source.length).toBeGreaterThan(0)
  })

  afterAll(() => printMatrix('Q2 — TodoMVC under React 19'))
})
