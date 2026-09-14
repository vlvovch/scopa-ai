// Loads the Swetrix tag (pageviews, plus the gameplay events of
// ./events.ts) only when the environment gate allows it (./gate.ts).
// index.html carries no analytics tag: nothing can load before that
// decision, so development servers, `vite preview`, LAN testing,
// Playwright, native Debug builds and the iOS Simulator never contact the
// production project, whatever the server side would accept.
//
// Settings are baked in at build time (VITE_SWETRIX_* in the .env files;
// .env.ios points the app at the Scopa website's project, events carry
// the game). Missing settings simply mean nothing is loaded.
import { decideAnalytics, type AnalyticsDecision, type AnalyticsEnvironment, type NativeBuildInfo } from './gate';
import { sanitizePageview, type PageviewPayload } from './sanitize';
import { IS_NATIVE_BUILD } from '../platform/native';

export interface SwetrixConfig {
  scriptUrl: string;
  apiUrl: string;
  projectId: string;
}

export interface AnalyticsConfig {
  swetrix: SwetrixConfig | null;
}

export interface SwetrixInitOptions {
  apiURL: string;
  respectDNT: boolean;
  /**
   * The client refuses to track on `localhost` / `127.0.0.1` unless this
   * is set. The app's web view lives at capacitor://localhost, so the
   * native build sets it, and only after our own gate established a
   * Release build on a real device. Never set on the website: there the
   * client's check is one more layer under the gate.
   */
  devMode: boolean;
}

export interface PageViewsOptions {
  /**
   * Called with the pageview payload before it is sent; the returned
   * fields replace the client's. The client also reuses the returned `pg`
   * for the custom events that follow, which is what keeps room codes
   * out of gameplay events (./sanitize.ts).
   */
  callback?: (payload: PageviewPayload) => PageviewPayload | false | void;
}

export interface SwetrixGlobal {
  init?(projectId: string, options: SwetrixInitOptions): void;
  trackViews?(options?: PageViewsOptions): void;
  track?(event: { ev: string; meta?: Record<string, string> }): void;
}

export interface AnalyticsWindow {
  swetrix?: SwetrixGlobal;
  __swetrixReady?: boolean;
}

type EnvValues = Record<string, string | boolean | undefined>;

const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** Provider settings from the build-time environment. */
export function readAnalyticsConfig(env: EnvValues = import.meta.env as unknown as EnvValues): AnalyticsConfig {
  const scriptUrl = clean(env.VITE_SWETRIX_SCRIPT_URL);
  const apiUrl = clean(env.VITE_SWETRIX_API_URL);
  const projectId = clean(env.VITE_SWETRIX_PROJECT_ID);
  return { swetrix: scriptUrl && apiUrl && projectId ? { scriptUrl, apiUrl, projectId } : null };
}

/** The environment of this page as the gate sees it. */
export function currentAnalyticsEnvironment(nativeBuild?: NativeBuildInfo | null): AnalyticsEnvironment {
  const prod = import.meta.env.PROD;
  const location = typeof window !== 'undefined' ? window.location : undefined;
  return {
    prod: typeof prod === 'boolean' ? prod : undefined,
    protocol: location?.protocol ?? '',
    hostname: location?.hostname ?? '',
    native: IS_NATIVE_BUILD,
    nativeBuild,
  };
}

function loadSwetrix(cfg: SwetrixConfig, native: boolean, doc: Document, win: AnalyticsWindow): void {
  const script = doc.createElement('script');
  script.src = cfg.scriptUrl;
  script.async = true;
  script.onload = () => {
    const swetrix = win.swetrix;
    if (!swetrix || typeof swetrix.init !== 'function') return;
    try {
      swetrix.init(cfg.projectId, { apiURL: cfg.apiUrl, respectDNT: true, devMode: native });
      // Invitation URLs name a room a stranger could enter: the path is
      // normalised to /join and invite parameters are dropped before any
      // pageview or event leaves the device.
      swetrix.trackViews?.({ callback: sanitizePageview });
      // Gate for the gameplay events (./events.ts).
      win.__swetrixReady = true;
    } catch {
      // analytics must never break the app
    }
  };
  doc.head.appendChild(script);
}

export interface StartAnalyticsOptions {
  /** What the native shell reported (native builds only). */
  nativeBuild?: NativeBuildInfo | null;
  /** Overrides for tests. */
  environment?: AnalyticsEnvironment;
  config?: AnalyticsConfig;
  doc?: Document;
  win?: AnalyticsWindow;
}

/**
 * Decide, then load. Returns the decision so callers (and the console)
 * can see why nothing was loaded. Safe to call once per page load.
 */
export function startAnalytics(options: StartAnalyticsOptions = {}): AnalyticsDecision {
  const environment = options.environment ?? currentAnalyticsEnvironment(options.nativeBuild);
  const decision = decideAnalytics(environment);
  if (!decision.enabled) {
    console.info(`[analytics] off: ${decision.reason}`);
    return decision;
  }
  const config = options.config ?? readAnalyticsConfig();
  if (!config.swetrix) {
    console.info('[analytics] off: no provider configured');
    return decision;
  }
  const doc = options.doc ?? (typeof document !== 'undefined' ? document : undefined);
  const win = options.win ?? (typeof window !== 'undefined' ? (window as unknown as AnalyticsWindow) : undefined);
  if (!doc || !win) return decision;
  try {
    loadSwetrix(config.swetrix, environment.native, doc, win);
  } catch {
    // never let a tag break start-up
  }
  return decision;
}
