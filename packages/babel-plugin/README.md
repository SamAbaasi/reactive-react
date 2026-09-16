# @rrjs/babel-plugin

Babel plugin that compiles JSX to `h()` calls compatible with `@rrjs/renderer`. Dynamic expressions inside JSX are wrapped in thunks so the renderer can establish reactive bindings.

## Install

```bash
npm install -D @rrjs/babel-plugin @babel/core
```

## Setup

### Vite

```js
// vite.config.ts
import { defineConfig } from 'vite'
import babel from '@babel/core'
import reactiveReact from '@rrjs/babel-plugin'

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

### Strict run-once module contracts

`runOnce: true` compiles the checked compatibility subset without re-running a
component body or using keyed reconciliation. Imported hooks and components need
an explicit build-tool contract. Define one manifest for the source root and
resolve every transformed module by its exact path:

```ts
import reactiveReact, {
  defineModuleContracts,
  resolveModuleMetadata,
} from '@rrjs/babel-plugin'

const contracts = defineModuleContracts({
  root: '/absolute/project/src',
  modules: {
    'App.tsx': {
      imports: {
        './theme': { hooks: ['useTheme'] },
        './Rows': {
          components: {
            Rows: {
              props: ['rows'],
              operationKeys: { rows: 'id' },
            },
          },
        },
      },
    },
    'Rows.tsx': {
      operationProps: ['rows'],
      operationKeyProps: { rows: 'id' },
    },
  },
})

const options = {
  runOnce: true,
  moduleMetadata: resolveModuleMetadata(contracts, filename),
}
```

Import contracts use the source string and exported name, so named aliases keep
the same identity. Manifest module keys must be normalized, root-relative paths;
unknown paths fail explicitly. These contracts are manually asserted facts. The
compiler does not inspect an imported implementation or infer arbitrary module
graphs. Operation props require a direct item-property JSX key, and accepted map
updates must preserve that key. Opaque list replacements remain unsupported.

In your application's entry file:

```js
import { mount } from '@rrjs/renderer'
import { App } from './App'

mount(App, document.getElementById('app'))
```

The plugin injects `import { h, list } from '@rrjs/renderer'` into every file that actually emits those calls. You do not assign `globalThis.h`. `@rrjs/renderer` must be installed in the app — it is a peer dependency of the plugin.

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

### SVG namespace boundary

Intrinsic SVG descendants in one compiled JSX tree are marked so the renderer
creates them in the SVG namespace; children of `foreignObject` return to HTML.
The tested aliases are `className`, `strokeWidth` and `xlinkHref`. An SVG-only
intrinsic without a visible `svg` ancestor and a component child directly under
SVG are rejected because cross-component namespace context is not implemented.
Namespaced JSX and the broader SVG attribute surface are outside this contract.

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
