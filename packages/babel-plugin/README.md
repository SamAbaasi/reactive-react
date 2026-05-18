# babel-plugin-reactive-react

Babel plugin that compiles JSX to `h()` calls compatible with `@reactive-react/renderer`. Dynamic expressions inside JSX are wrapped in thunks so the renderer can establish reactive bindings.

## Install

```bash
npm install -D babel-plugin-reactive-react @babel/core
```

## Setup

### Vite

```js
// vite.config.ts
import { defineConfig } from 'vite'
import babel from '@babel/core'
import reactiveReact from 'babel-plugin-reactive-react'

export default defineConfig({
  esbuild: { jsx: 'preserve' },
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
})
```

In your entry file:

```js
import { h } from '@reactive-react/renderer'
;(globalThis as any).h = h
```

The plugin assumes `h` is in scope where JSX is used.

## What it transforms

| Input | Output |
|---|---|
| `<div>hello</div>` | `h('div', null, 'hello')` |
| `<div>{count}</div>` | `h('div', null, () => count)` |
| `<div className={cls}>` | `h('div', { className: () => cls })` |
| `<button onClick={fn}>` | `h('button', { onClick: fn })` |
| `<input disabled={true}>` | `h('input', { disabled: true })` |
| `<Counter />` | `h(Counter, null)` |

Static literals are not wrapped. Event handlers (anything matching `on[A-Z]`) are passed through directly.

## Why thunks

Inside the renderer, thunks run inside an `effect`. That effect subscribes to any signals read by the thunk. When those signals change, the thunk re-runs and the bound DOM node updates — without re-running the component function. This is what makes the "component runs once" property possible.

## License
MIT License

Copyright (c) 2026 Saman Abaasi

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.