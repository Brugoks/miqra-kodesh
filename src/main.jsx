import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { applyContrastTheme } from './lib/colorContrast'

// Derive --on-accent / --on-btn-primary from the theme colors so text on
// colored surfaces stays readable if the brand palette changes.
applyContrastTheme()

// After a deploy, a page that was loaded from the previous build references
// lazy chunks that no longer exist on the server. Reload once to pick up the
// new build instead of surfacing a broken feature; the timestamp guard keeps
// a genuinely-unreachable chunk from causing a reload loop.
window.addEventListener('vite:preloadError', (event) => {
  const KEY = 'miqra-chunk-reload-at'
  const last = Number(sessionStorage.getItem(KEY) || 0)
  if (Date.now() - last > 60_000) {
    sessionStorage.setItem(KEY, String(Date.now()))
    event.preventDefault()
    window.location.reload()
  }
})

// Register the service worker for offline caching on every visit (push
// enablement re-registers the same worker later). Skipped in dev so the
// cache never fights Vite's HMR. Mobile PWAs resume from the background
// without a navigation, so also check for an updated worker on foreground.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const KEY = 'miqra-sw-controller-reload-at'
    const last = Number(sessionStorage.getItem(KEY) || 0)
    if (Date.now() - last > 60_000) {
      sessionStorage.setItem(KEY, String(Date.now()))
      window.location.reload()
    }
  })

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            registration.update().catch(() => {})
          }
        })
      })
      .catch(() => {})
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
