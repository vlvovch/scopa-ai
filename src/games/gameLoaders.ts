// Dynamic loaders for the two game apps — the code-splitting seam.
//
// App.tsx imports the build's default game statically (it stays in the
// main chunk, so that game's initial download is unchanged) and wraps the
// OTHER game's loader in React.lazy, which makes it a separate chunk
// fetched on first use. The service worker precaches every /assets/* file
// at install, so once a device has been online with a build, the second
// game works offline too. A dynamic import of the game that is already in
// the main chunk resolves in place (no extra request).
import type { ComponentType } from 'react';
import type { GameId } from './gameSelection';

export interface GameAppProps {
  /**
   * Switch to the other game. Undefined when switching is unavailable
   * (itch.io single-game embeds) — the apps then hide the switcher.
   * The app must leave / confirm-leave whatever is in progress itself
   * before calling this; App.tsx only swaps the mounted game.
   */
  onSwitchGame?: (target: GameId) => void;
}

type GameAppModule = { default: ComponentType<GameAppProps> };

export const GAME_LOADERS: Record<GameId, () => Promise<GameAppModule>> = {
  scopa: () => import('./scopa/ScopaApp'),
  briscola: () => import('./briscola/BriscolaApp'),
};

/** Warm the other game's chunk (hover / focus on the switcher). Best effort. */
export function preloadGame(game: GameId): void {
  void GAME_LOADERS[game]().catch(() => {
    // Ignore — the real switch surfaces load failures with a retry.
  });
}
