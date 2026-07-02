import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { applyContrastTheme } from './lib/colorContrast'

// Derive --on-accent / --on-btn-primary from the theme colors so text on
// colored surfaces stays readable if the brand palette changes.
applyContrastTheme()

// Register the service worker for offline caching on every visit (push
// enablement re-registers the same worker later). Skipped in dev so the
// cache never fights Vite's HMR.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
