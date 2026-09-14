// Decides whether this running copy of the app may talk to the analytics
// backends at all. The rule the whole app relies on: website development,
// native Debug builds and the iOS Simulator send ZERO requests to the
// production analytics projects, whatever the server side allows (Swetrix
// can be told to accept localhost traffic; the client never depends on
// that filter).
//
// Several independent signals have to agree, and a signal that is missing
// counts against sending:
//   - Vite's production flag (import.meta.env.PROD) must be true. The dev
//     server never qualifies, but the flag alone is never enough.
//   - Website: an http(s) page on a non-development host. localhost,
//     loopback, *.test / *.local / *.localhost, bare IP addresses and the
//     like are where `vite preview`, LAN testing and Playwright runs live.
//   - Native app: the shell must have reported its build information, the
//     build must be the Release configuration compiled without DEBUG, and
//     it must not be running in the Simulator. No report means no
//     analytics.
// Provider configuration (ids and URLs) is checked separately by the
// loader; the native .env.ios leaves it empty on purpose.

export interface NativeBuildInfo {
  /** Xcode configuration name from Info.plist (`AppBuildConfiguration`): "Debug", "Release", … */
  configuration: string;
  /** Compiled with the DEBUG condition (the Debug configuration). */
  debug: boolean;
  /** Built for, or running in, the iOS Simulator. */
  simulator: boolean;
}

export interface AnalyticsEnvironment {
  /** import.meta.env.PROD; undefined when unknown. */
  prod: boolean | undefined;
  /** window.location.protocol ("https:"), empty when there is no window. */
  protocol: string;
  /** window.location.hostname, empty when there is no window. */
  hostname: string;
  /** The Capacitor build (VITE_NATIVE=true). */
  native: boolean;
  /** What the native shell reported; null or undefined = nothing reported. */
  nativeBuild?: NativeBuildInfo | null;
}

export type AnalyticsDecision =
  | { enabled: true; reason: 'production' }
  | { enabled: false; reason: string };

const DEV_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);
const DEV_SUFFIXES = ['.localhost', '.test', '.local', '.localdomain', '.example', '.invalid', '.internal', '.home.arpa'];

/** Hosts that are never a production site: local, loopback, LAN and test names. */
export function isDevelopmentHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!host) return true;
  if (DEV_HOSTNAMES.has(host)) return true;
  if (DEV_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true; // bare IPv4 (LAN testing)
  if (host.includes(':')) return true; // bare IPv6
  return false;
}

function off(reason: string): AnalyticsDecision {
  return { enabled: false, reason };
}

export function decideAnalytics(env: AnalyticsEnvironment): AnalyticsDecision {
  if (env.prod !== true) return off('not a production build');
  if (env.native) {
    const build = env.nativeBuild;
    if (!build) return off('native build information unavailable');
    if (build.simulator) return off('iOS Simulator');
    if (build.debug) return off('native Debug build');
    if (build.configuration !== 'Release') {
      return off(`native ${build.configuration || 'unknown'} configuration`);
    }
    return { enabled: true, reason: 'production' };
  }
  if (env.protocol !== 'https:' && env.protocol !== 'http:') {
    return off(`not served over http(s) (${env.protocol || 'no location'})`);
  }
  if (isDevelopmentHost(env.hostname)) return off(`development host (${env.hostname || 'none'})`);
  return { enabled: true, reason: 'production' };
}
