import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { requestPersistentStorage } from './utils/persistentStorage'
import { IS_NATIVE_BUILD } from './platform/native'
import { startAnalytics } from './analytics/loader'
import { invitePathFromQuery, sanitizeQueryString } from './analytics/sanitize'
import type { NativeBuildInfo } from './analytics/gate'
import { setOnDeviceModel, type OnDeviceModel } from './ai/onDeviceModel'

/**
 * An invitation in the query (`/?join=SCOPA-AB12`, the older link form)
 * becomes the path form the app treats as canonical, before anything
 * reads the URL. The router and both lobbies understand either form; the
 * point is that no query string carrying a room code survives into what
 * the analytics client copies from the address bar (src/analytics/sanitize.ts).
 * Campaign parameters are kept. The itch.io build lives under a subpath
 * and has no invitations, so it is left alone.
 */
function canonicaliseInviteUrl() {
  if (import.meta.env.VITE_ITCH_MODE === 'true') return
  const path = invitePathFromQuery(window.location.search)
  if (!path) return
  const rest = sanitizeQueryString(window.location.search.slice(1))
  window.history.replaceState({}, '', rest ? `${path}?${rest}` : path)
}

async function start() {
  let nativeDidRender: (() => void) | null = null
  let nativeBuild: NativeBuildInfo | null = null
  if (IS_NATIVE_BUILD) {
    // Capacitor app: hydrate native storage and fold a cold-launch link
    // into the URL BEFORE anything renders (both are read synchronously
    // during the first render). Dynamic import keeps every Capacitor
    // module out of the website bundles.
    const native = await import('./platform/bootstrap')
    ;({ nativeBuild } = await native.bootstrapNative())
    nativeDidRender = native.nativeDidRender
  } else {
    canonicaliseInviteUrl()
    // Ask the OS to keep settings/stats/session durable (TWA / installed
    // PWA). Game-agnostic — runs for both the Scopa and Briscola builds.
    requestPersistentStorage()
  }

  // Dev server only: an end-to-end test can stand in for the on-device model
  // (window.__scopaTestModel, set before the page scripts run) so the
  // website can exercise the on-device opponent's UI paths. Never in a build.
  if (import.meta.env.DEV) {
    const fake = (window as unknown as { __scopaTestModel?: OnDeviceModel }).__scopaTestModel
    if (fake) setOnDeviceModel(fake)
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  nativeDidRender?.()
  // Analytics tags load only where src/analytics/gate.ts allows it: never
  // from the dev server, dev hosts, native Debug builds or the Simulator.
  startAnalytics({ nativeBuild })
}

void start()
