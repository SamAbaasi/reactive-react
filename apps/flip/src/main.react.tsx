// React entry point. This file, and the build config, are the ONLY differences
// between the two targets. Every component file is shared verbatim.
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(<App />)
