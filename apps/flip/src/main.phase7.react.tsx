import React from 'react'
import { createRoot } from 'react-dom/client'
import { SvgPhase7 } from './SvgPhase7'

const root = createRoot(document.getElementById('root')!)
root.render(<SvgPhase7 />)
;(globalThis as any).__RRJS_ACCEPTANCE_UNMOUNT__ = () => root.unmount()
