import { mount } from '@rrjs/renderer'
import { App } from './App'
import './styles.css'
import { observeRuntime } from '@rrjs/signals'

const observer = (globalThis as any).__RRJS_ACCEPTANCE_OBSERVER__
const stop = typeof observer === 'function' ? observeRuntime(observer) : undefined
const unmount = mount(App as never, document.getElementById('root')!)
;(globalThis as any).__RRJS_ACCEPTANCE_UNMOUNT__ = unmount
;(globalThis as any).__RRJS_ACCEPTANCE_STOP__ = stop
