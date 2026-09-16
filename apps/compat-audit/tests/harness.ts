// Compiles a source string through @rrjs/babel-plugin and mounts it with
// @rrjs/renderer, so we can ask "what does this exact React source actually do
// here?" rather than reasoning about it.
//
// Sources are written without imports; hooks and the runtime are injected as
// parameters, which is equivalent to how a bundled app resolves them and keeps
// the compiled output evaluable with `new Function`.
import * as babel from '@babel/core'
import reactiveReact from '@rrjs/babel-plugin'
import { h, list, mount } from '@rrjs/renderer'
import * as compat from '@rrjs/react-compat'

export interface RunResult {
  container: HTMLElement
  /** null when the component mounted; otherwise the error that stopped it. */
  error: Error | null
  /** Compiled output, for inspecting what the plugin emitted. */
  code: string
}

export function compile(source: string): string {
  const out = babel.transformSync(source, {
    filename: 'case.tsx',
        // Classic runtime: this harness evals compiled output with
        // `new Function('h', 'list', ...)`, so an injected `import` would be
        // a SyntaxError. Real apps use the default (automatic) injection.
        plugins: [[reactiveReact, { injectImports: false }]],
    presets: ['@babel/preset-typescript'],
    parserOpts: { plugins: ['jsx', 'typescript'] },
    configFile: false,
    babelrc: false,
    sourceType: 'script',
  })
  if (!out?.code) throw new Error('babel produced no output')
  return out.code
}

const INJECTED = [
  'h', 'list',
  'useState', 'useEffect', 'useLayoutEffect', 'useMemo', 'useRef',
  'useReducer', 'useCallback', 'useContext', 'createContext', 'forwardRef',
  'memo', 'useId', 'useSyncExternalStore', 'useTransition', 'useDeferredValue',
] as const

function runtimeValues(): unknown[] {
  const anyCompat = compat as Record<string, unknown>
  return [
    h, list,
    anyCompat.useState, anyCompat.useEffect, anyCompat.useLayoutEffect,
    anyCompat.useMemo, anyCompat.useRef, anyCompat.useReducer,
    anyCompat.useCallback, anyCompat.useContext, anyCompat.createContext,
    anyCompat.forwardRef, anyCompat.memo, anyCompat.useId,
    anyCompat.useSyncExternalStore, anyCompat.useTransition,
    anyCompat.useDeferredValue,
  ]
}

/** Compile `source`, pull out `componentName`, mount it, and report what happened. */
export function run(source: string, componentName: string): RunResult {
  const container = document.createElement('div')
  document.body.appendChild(container)

  let code = ''
  try {
    code = compile(source)
    const factory = new Function(...INJECTED, `${code}\nreturn ${componentName};`)
    const Component = factory(...runtimeValues())
    mount(Component as never, container)
    return { container, error: null, code }
  } catch (err) {
    return { container, error: err as Error, code }
  }
}

/** Text content with whitespace collapsed, for readable assertions. */
export function text(el: HTMLElement): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim()
}

export function click(el: HTMLElement, selector: string): void {
  const target = el.querySelector(selector)
  if (!target) throw new Error(`no element matches ${selector}`)
  ;(target as HTMLElement).click()
}

/** Records one row of an audit matrix so the report is generated, not written by hand. */
export interface MatrixRow {
  case: string
  behaviour: string
  detail: string
}

export const matrix: MatrixRow[] = []

export function record(caseName: string, behaviour: string, detail: string): void {
  matrix.push({ case: caseName, behaviour, detail })
}

export function printMatrix(title: string): void {
  if (!matrix.length) return
  const w1 = Math.max(...matrix.map(r => r.case.length), 4)
  const w2 = Math.max(...matrix.map(r => r.behaviour.length), 9)
  console.log(`\n=== ${title} ===`)
  for (const r of matrix) {
    console.log(`  ${r.case.padEnd(w1)}  ${r.behaviour.padEnd(w2)}  ${r.detail}`)
  }
  console.log('')
}
