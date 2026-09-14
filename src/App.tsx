import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import DefaultGameApp from '@default-game';
import { GAME_LOADERS } from './games/gameLoaders';
import {
  DEFAULT_GAME,
  GAME_NAMES,
  GAME_SWITCH_ENABLED,
  gameHomePath,
  isFirstVisit,
  otherGame,
  readInitialGameRoute,
  saveGamePreference,
  type GameId,
  type GameRoute,
} from './games/gameSelection';
import {
  GameLoadBoundary,
  GameLoadErrorScreen,
  GameLoadingScreen,
} from './components/UI/GameLoader';
import { GameChooser } from './components/UI/GameChooser';
import { trackGameChosen, trackGameSwitched } from './analytics/events';
import { LanguageProvider } from './i18n/LanguageContext';

/**
 * Code-splitting seam. The build's default game (VITE_GAME) is imported
 * statically — through the `@default-game` alias that vite.config.ts points
 * at ScopaApp or BriscolaApp — so it stays in the main chunk exactly as
 * before: no extra round trip, unchanged initial download. The other game
 * is only ever imported dynamically (src/games/gameLoaders.ts) and is a
 * React.lazy chunk fetched on first use, precached by the service worker
 * (public/sw.js) so it works offline after one online visit.
 */
const OTHER_GAME = otherGame(DEFAULT_GAME);

// Created once per page load; see retryLoad for why a failed load is not
// retried in place.
const LazyOtherGame = lazy(GAME_LOADERS[OTHER_GAME]);

/**
 * In desktop-site mode the whole app is CSS-zoomed by --dmode-scale.
 * framer-motion can't see that scale (it's on <body>, not a motion
 * ancestor), so card drag applies a screen-pixel delta to the card's
 * zoomed local space and the card moves ~scale× too fast. framer-
 * motion's transformPagePoint hook lets us pre-divide the pointer
 * coordinates by the live scale so drag (and the drop point) track 1:1
 * again. Identity / no-op for every normal user (no dmode class).
 */
function transformPagePoint(point: { x: number; y: number }) {
  const html = document.documentElement;
  if (!html.classList.contains('dmode')) return point;
  const scale =
    parseFloat(getComputedStyle(html).getPropertyValue('--dmode-scale')) || 1;
  return scale > 0 ? { x: point.x / scale, y: point.y / scale } : point;
}

function App() {
  // Which game is on screen. Resolved once per page load from the URL
  // (invitation > explicit game path > remembered choice > build default)
  // and changed afterwards only by an explicit switch.
  const [route, setRoute] = useState<GameRoute>(readInitialGameRoute);
  const game = route.game;
  const gameRef = useRef(game);
  gameRef.current = game;

  // Brand-new visitor with nothing deciding the game for them: ask once.
  // Never for invitations / explicit URLs / remembered choices, never on an
  // origin with any prior play (existing installs, saved matches, pending
  // multiplayer reconnects), never in itch builds.
  const [showChooser, setShowChooser] = useState(
    () => GAME_SWITCH_ENABLED && route.source === 'default' && isFirstVisit()
  );
  const chooseGame = useCallback((target: GameId) => {
    saveGamePreference(target);
    const homePath = gameHomePath(target);
    if (window.location.pathname !== homePath || window.location.search) {
      window.history.replaceState({}, '', homePath);
    }
    trackGameChosen({ game: target });
    setShowChooser(false);
    setRoute({ game: target, source: 'welcome' });
  }, []);

  // "Retry" on the load-failure screen reloads the page: browsers record a
  // failed module fetch in the document's module map, so re-importing the
  // same chunk URL rejects again without touching the network (and
  // React.lazy caches the rejection too). A reload re-resolves the route
  // (URL / preference are unchanged) and fetches the chunk afresh — from
  // the network, or from the service worker's cache when still offline.
  const retryLoad = useCallback(() => {
    window.location.reload();
  }, []);

  /**
   * Swap the mounted game. The calling app has already left (or confirmed
   * leaving) anything in progress — multiplayer room, worker, persisted
   * solo game — so this only records the choice, points the URL at the
   * new game's home path and remounts. `remember: false` is for the
   * load-failure fallback: opening the default game because the other
   * one could not be fetched must not overwrite the user's preference.
   */
  const switchGame = useCallback(
    (target: GameId, options: { remember?: boolean; joinCode?: string } = {}) => {
      const from = gameRef.current;
      if (from === target) return;
      if (options.remember !== false) saveGamePreference(target);
      // With a join code the other game mounts into its join lobby: its
      // getInitialJoinCode reads the URL exactly as for an invite link.
      const nextPath = options.joinCode ? `/join/${options.joinCode}` : gameHomePath(target);
      if (window.location.pathname !== nextPath || window.location.search) {
        window.history.replaceState({}, '', nextPath);
      }
      trackGameSwitched({ from, to: target });
      setRoute({ game: target, source: 'switch' });
    },
    []
  );

  // Invitations that arrive while the app is running (native universal
  // links / custom scheme; src/platform/bootstrap.ts dispatches them).
  const [pendingInvite, setPendingInvite] = useState<string | null>(null);
  useEffect(() => {
    const onInvite = (event: Event) => {
      const code = (event as CustomEvent<{ joinCode: string }>).detail?.joinCode;
      if (code) setPendingInvite(code);
    };
    window.addEventListener('app-invite', onInvite);
    return () => window.removeEventListener('app-invite', onInvite);
  }, []);
  const onInviteHandled = useCallback(() => setPendingInvite(null), []);

  // The tab / window title names the game on screen; the deployment's own
  // title (index.html, e.g. "Scopa AI") is restored for its default game.
  const baseTitle = useMemo(() => document.title, []);
  useEffect(() => {
    document.title = game === DEFAULT_GAME ? baseTitle : `${GAME_NAMES[game]} AI`;
  }, [game, baseTitle]);

  const onSwitchGame = GAME_SWITCH_ENABLED ? switchGame : undefined;
  const CurrentGame = game === DEFAULT_GAME ? DefaultGameApp : LazyOtherGame;

  if (showChooser) {
    return (
      <LanguageProvider>
        <GameChooser defaultGame={DEFAULT_GAME} onChoose={chooseGame} />
      </LanguageProvider>
    );
  }

  return (
    <LanguageProvider>
      <MotionConfig transformPagePoint={transformPagePoint}>
        <GameLoadBoundary
          resetKey={game}
          fallback={() => (
            <GameLoadErrorScreen
              game={game}
              fallbackGame={DEFAULT_GAME}
              onRetry={retryLoad}
              onOpenFallback={() => switchGame(DEFAULT_GAME, { remember: false })}
            />
          )}
        >
          <Suspense fallback={<GameLoadingScreen game={game} />}>
            <CurrentGame
              key={game}
              onSwitchGame={onSwitchGame}
              pendingInvite={pendingInvite}
              onInviteHandled={onInviteHandled}
            />
          </Suspense>
        </GameLoadBoundary>
      </MotionConfig>
    </LanguageProvider>
  );
}

export default App;
