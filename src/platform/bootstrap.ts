// Native (Capacitor) start-up. Reached only from src/main.tsx when
// IS_NATIVE_BUILD is true, via a dynamic import, so none of this — nor
// the Capacitor plugins — is part of the website bundles.
//
// Order matters: storage must be hydrated and the launch URL folded into
// the page path BEFORE React renders, because the router and both games
// read the URL and storage synchronously during their first render.
import { App as CapApp } from '@capacitor/app';
import { Keyboard } from '@capacitor/keyboard';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { initNativeStorage, storage } from './storage';
import { parseIncomingLink, pathForIncomingLink } from './links';
import { readNativeBuildInfo } from './buildInfo';
import { probeAppleIntelligence } from './appleIntelligence';
import { setOnDeviceModel } from '../ai/onDeviceModel';
import type { NativeBuildInfo } from '../analytics/gate';

/** Window event carrying an invitation received while the app is running. */
export const APP_INVITE_EVENT = 'app-invite';

export interface AppInviteDetail {
  joinCode: string;
}

function applyFontScale(): void {
  // index.html seeds --font-scale from web storage, which the app does not
  // use; take it from the hydrated settings before the first paint.
  try {
    const raw = storage.get('scopa-settings');
    const scale = raw ? (JSON.parse(raw) as { fontScale?: unknown }).fontScale : undefined;
    document.documentElement.style.setProperty('--font-scale', String(typeof scale === 'number' ? scale : 1.2));
  } catch {
    // keep the default seeded by index.html
  }
}

/** Blur a focused input when the user taps anywhere that is not a control. */
function installKeyboardDismissal(): void {
  document.addEventListener(
    'touchstart',
    (event) => {
      const active = document.activeElement as HTMLElement | null;
      if (!active || !(active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
      const target = event.target as Element | null;
      if (target?.closest('input, textarea, select, button, a, [contenteditable]')) return;
      active.blur();
      Keyboard.hide().catch(() => {});
    },
    { passive: true }
  );
}

export interface NativeBootstrap {
  /** How the binary was built (analytics gate); null when unknown. */
  nativeBuild: NativeBuildInfo | null;
}

/**
 * Prepare the native shell. Resolves when the app may render: storage is
 * hydrated and a cold-launch invitation (if any) is in the URL.
 */
export async function bootstrapNative(): Promise<NativeBootstrap> {
  document.documentElement.classList.add('native');
  installViewportVars();
  const [, nativeBuild, onDevice] = await Promise.all([
    initNativeStorage(),
    readNativeBuildInfo(),
    probeAppleIntelligence(),
  ]);
  // One line of evidence for the analytics gate in the device console.
  console.info(`[native] build info: ${nativeBuild ? JSON.stringify(nativeBuild) : 'unavailable'}`);
  // The on-device opponent (Apple Intelligence) exists only where the
  // shell says the system model is usable; the start screens read this.
  setOnDeviceModel(onDevice.model, onDevice.reason);
  console.info(`[native] on-device model: ${onDevice.model ? 'available' : `unavailable (${onDevice.reason})`}`);
  applyFontScaleSafe();

  // Cold launch through a universal link / custom scheme: put the target
  // path in place so the router (invite > game path > remembered game)
  // and the lobbies read it exactly as they would on the website.
  try {
    const launch = await CapApp.getLaunchUrl();
    const path = pathForIncomingLink(parseIncomingLink(launch?.url));
    if (path) window.history.replaceState({}, '', path);
  } catch {
    // no launch url
  }

  // Links opened while running: hand the invitation to the React tree,
  // which routes it through the games' leave-game confirmation.
  CapApp.addListener('appUrlOpen', ({ url }) => {
    const link = parseIncomingLink(url);
    if (link.joinCode) {
      window.dispatchEvent(
        new CustomEvent<AppInviteDetail>(APP_INVITE_EVENT, { detail: { joinCode: link.joinCode } })
      );
    }
  }).catch(() => {});

  // Returning to the foreground: the web view fires visibilitychange /
  // focus, which the sound hook (AudioContext resume) and the multiplayer
  // hooks (socket probe) already listen for; make sure focus fires too.
  CapApp.addListener('appStateChange', ({ isActive }) => {
    if (isActive) window.dispatchEvent(new Event('focus'));
  }).catch(() => {});

  installKeyboardDismissal();
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  return { nativeBuild };
}

function applyFontScaleSafe(): void {
  try {
    applyFontScale();
  } catch {
    // never block start-up on a cosmetic step
  }
}

/** Called once the first React frame is on screen. */
export function nativeDidRender(): void {
  requestAnimationFrame(() => {
    SplashScreen.hide().catch(() => {});
  });
}

/**
 * Feed the layout viewport size to the stylesheet (--viewport-width and
 * --viewport-height, see index.css). In the app the web view is resized
 * by iPadOS multitasking (Split View, Slide Over, windowed mode), and
 * viewport units inside custom properties were seen to stay at the old
 * size once the app was full screen again. The values are refreshed on
 * every event that can follow a resize, when the app resumes, and by a
 * one-second check that costs two property reads.
 */
function installViewportVars(): void {
  const root = document.documentElement;
  const apply = () => {
    const w = `${root.clientWidth || window.innerWidth}px`;
    const h = `${root.clientHeight || window.innerHeight}px`;
    if (root.style.getPropertyValue('--viewport-width') !== w) root.style.setProperty('--viewport-width', w);
    if (root.style.getPropertyValue('--viewport-height') !== h) root.style.setProperty('--viewport-height', h);
  };
  apply();
  for (const type of ['resize', 'orientationchange', 'pageshow', 'focus']) window.addEventListener(type, apply);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      apply();
      requestAnimationFrame(apply);
    }
  });
  void import('@capacitor/app').then(({ App }) => App.addListener('resume', apply)).catch(() => undefined);
  window.setInterval(apply, 1000);
}
