import { mount } from '@rrjs/renderer'
import { RunOnce } from './RunOnce'
import './styles.css'
import { observeRuntime } from '@rrjs/signals'

const observer = (globalThis as any).__RRJS_ACCEPTANCE_OBSERVER__
const stop = typeof observer === 'function' ? observeRuntime(observer) : undefined
const unmount = mount(RunOnce, document.getElementById('root')!)
if (stop) (globalThis as any).__RRJS_ACCEPTANCE_UNMOUNT__ = () => { unmount(); stop() }
