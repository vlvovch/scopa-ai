// Which distribution this copy of the app is, for the `platform` field of
// every gameplay event:
//   - 'ios':     the Capacitor app (a build-time fact, VITE_NATIVE=true);
//   - 'android': the Android app, which is the website inside a Trusted
//                Web Activity. It opens the site with an `android-app://`
//                referrer; as a fallback, the site installed to an Android
//                home screen (standalone display mode) counts too;
//   - 'web':     everything else, including the site installed on iOS.
import { IS_NATIVE_BUILD } from '../platform/native';

export type Platform = 'ios' | 'android' | 'web';

export interface PlatformSignals {
  native: boolean;
  userAgent: string;
  referrer: string;
  standalone: boolean;
}

export function platformFromSignals(signals: PlatformSignals): Platform {
  if (signals.native) return 'ios';
  const android = /android/i.test(signals.userAgent);
  if (android && (signals.referrer.startsWith('android-app://') || signals.standalone)) return 'android';
  return 'web';
}

export function currentPlatformSignals(): PlatformSignals {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const doc = typeof document !== 'undefined' ? document : undefined;
  let standalone = false;
  try {
    standalone = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(display-mode: standalone)').matches
      : false;
  } catch {
    // no media queries (tests, odd embedders)
  }
  return {
    native: IS_NATIVE_BUILD,
    userAgent: nav?.userAgent ?? '',
    referrer: doc?.referrer ?? '',
    standalone,
  };
}

let detected: Platform | null = null;

/** Decided once per page load; the signals do not change afterwards. */
export function detectPlatform(): Platform {
  if (!detected) detected = platformFromSignals(currentPlatformSignals());
  return detected;
}
