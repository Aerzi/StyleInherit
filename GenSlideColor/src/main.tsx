import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const rootEl = document.getElementById('root')
if (!rootEl) {
  document.body.innerHTML = '<pre style="padding:1rem;color:red;">#root not found. Check index.html.</pre>'
} else {
  try {
    createRoot(rootEl).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  } catch (err) {
    rootEl.innerHTML = `<pre style="padding:1rem;color:red;white-space:pre-wrap;">渲染失败: ${err instanceof Error ? err.message : String(err)}</pre>`
    console.error(err)
  }
}
