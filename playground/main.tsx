import { createRoot } from 'react-dom/client'
import { normalizeOtlpTrace } from '../src/adapters/otlp'
import { TraceDetailView } from '../src/index'
import rawOtlp from '../examples/react-vite/src/trace.json'

const container = document.getElementById('root')
if (!container) throw new Error('#root not found')

createRoot(container).render(<TraceDetailView trace={normalizeOtlpTrace(rawOtlp)} />)
