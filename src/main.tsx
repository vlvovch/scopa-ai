import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { requestPersistentStorage } from './utils/persistentStorage'

// Ask the OS to keep settings/stats/session durable (TWA / installed
// PWA). Game-agnostic — runs for both the Scopa and Briscola builds.
requestPersistentStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
