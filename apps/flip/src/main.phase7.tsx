import { mount } from '@rrjs/renderer'
import { observeRuntime } from '@rrjs/signals'
import { SvgPhase7 } from './SvgPhase7'

const stop = observeRuntime(event => (globalThis as any).__RRJS_ACCEPTANCE_OBSERVER__?.(event))
const unmount = mount(SvgPhase7, document.getElementById('root')!)
;(globalThis as any).__RRJS_ACCEPTANCE_UNMOUNT__ = unmount
;(globalThis as any).__RRJS_ACCEPTANCE_STOP__ = stop
