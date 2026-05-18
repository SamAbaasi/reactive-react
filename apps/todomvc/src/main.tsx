import { h, mount, list } from '@rrjs/renderer'
import { App } from './app'

;(globalThis as any).h = h
;(globalThis as any).list = list

mount(App as any, document.getElementById('app')!)