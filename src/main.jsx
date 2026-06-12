import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { applyContrastTheme } from './lib/colorContrast'

// Derive --on-accent / --on-btn-primary from the theme colors so text on
// colored surfaces stays readable if the brand palette changes.
applyContrastTheme()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
