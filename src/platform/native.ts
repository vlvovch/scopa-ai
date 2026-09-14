// Where is this bundle running?
//
// IS_NATIVE_BUILD is a build-time constant (`vite build --mode ios`, see
// .env.ios). It gates everything Capacitor-specific so the website bundles
// keep zero Capacitor code: branches on it are dead-code-eliminated, and
// the native modules are only ever reached through dynamic imports inside
// those branches (src/platform/bootstrap.ts, src/platform/nativeStores.ts).
export const IS_NATIVE_BUILD = import.meta.env.VITE_NATIVE === 'true';
