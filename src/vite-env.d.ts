/// <reference types="vite/client" />

/** Display version injected by vite.config.ts: "1.<commit count> (date)". */
declare const __APP_VERSION__: string;
/** Detailed build info (build time UTC + git commit) for the tooltip. */
declare const __APP_BUILD_INFO__: string;

/**
 * Build-time alias (vite.config.ts `resolve.alias`) for the app module of
 * the game this build is for — ScopaApp in `--mode scopa`, BriscolaApp in
 * `--mode briscola`. Imported statically by src/App.tsx so the default
 * game ships in the main chunk; the other game is loaded lazily.
 */
declare module '@default-game' {
  import type { ComponentType } from 'react';
  import type { GameAppProps } from './games/gameLoaders';
  const DefaultGameApp: ComponentType<GameAppProps>;
  export default DefaultGameApp;
}
