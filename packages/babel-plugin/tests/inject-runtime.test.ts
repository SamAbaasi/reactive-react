import { describe, it, expect } from 'vitest'
import { transformSync } from '@babel/core'
import plugin from '../src/index'

function transform(code: string, opts?: Record<string, unknown>): string {
  const result = transformSync(code, {
    plugins: opts ? [[plugin, opts]] : [plugin],
    parserOpts: { plugins: ['jsx'] },
    generatorOpts: { compact: true, retainLines: false },
    filename: 'file.jsx',
    sourceType: 'module',
  })
  return result?.code ?? ''
}

describe('D16 — plugin injects its own runtime import', () => {
  it('injects `h` from @rrjs/renderer when the file emits h()', () => {
    const out = transform(`const x = <div>hello</div>`)
    expect(out).toMatch(/import\s*\{[^}]*\bh\b[^}]*\}\s*from\s*["']@rrjs\/renderer["']/)
    expect(out).toContain(`h("div",null,"hello")`)
  })

  it('injects `list` when a keyed .map() is rewritten', () => {
    const out = transform(`
      const x = <ul>{todos.map(todo => <li key={todo.id}>{todo.text}</li>)}</ul>
    `)
    expect(out).toMatch(/import\s*\{[^}]*\blist\b[^}]*\}\s*from\s*["']@rrjs\/renderer["']/)
    expect(out).toMatch(/import\s*\{[^}]*\bh\b[^}]*\}\s*from\s*["']@rrjs\/renderer["']/)
    expect(out).toContain('list(')
  })

  it('does not inject `list` when the file never emits list()', () => {
    const out = transform(`const x = <div>hello</div>`)
    expect(out).not.toMatch(/\blist\b/)
  })

  it('does not inject anything when the file has no JSX', () => {
    const out = transform(`const x = 1`)
    expect(out).not.toMatch(/@rrjs\/renderer/)
    expect(out).not.toMatch(/\bimport\b/)
  })

  it('honours importSource', () => {
    const out = transform(`const x = <div />`, { importSource: 'custom-runtime' })
    expect(out).toMatch(/from\s*["']custom-runtime["']/)
    expect(out).not.toMatch(/@rrjs\/renderer/)
  })

  it('reuses an existing import of h rather than duplicating it', () => {
    const out = transform(`
      import { h } from '@rrjs/renderer'
      const x = <div>hello</div>
    `)
    const imports = out.match(/from\s*["']@rrjs\/renderer["']/g) ?? []
    expect(imports.length).toBe(1)
    expect(out).toContain(`h("div",null,"hello")`)
  })

  it('injectImports: false leaves h in scope without an import (classic runtime)', () => {
    const out = transform(`const x = <div>hello</div>`, { injectImports: false })
    expect(out).not.toMatch(/@rrjs\/renderer/)
    expect(out).toContain(`h("div",null,"hello")`)
  })
})
