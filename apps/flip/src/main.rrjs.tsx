// Signal-engine entry point. Component sources are shared with the React target.
import { mount } from '@rrjs/renderer'
import { App } from './App'
import './styles.css'

mount(App as never, document.getElementById('root')!)
