// Loading / failure UI for the lazily loaded (non-default) game, plus the
// error boundary that turns a failed chunk import into a recoverable
// screen instead of a blank page.
//
// The other game's chunk is normally served from the service worker's
// app cache (precached at install), so this rarely shows. It matters in
// two cases: an offline launch on a device whose service worker never
// cached this build's chunk, and an old page trying to fetch a chunk
// name that a newer deploy has since replaced.

import { Component, type ReactNode } from 'react';
import { GAME_NAMES, type GameId } from '../../games/gameSelection';
import { useT } from '../../i18n/LanguageContext';
import styles from './GameLoader.module.css';

export function GameLoadingScreen({ game }: { game: GameId }) {
  const t = useT();
  return (
    <div className={styles.screen} role="status" aria-live="polite">
      <div className={styles.card}>
        <div className={styles.spinner} aria-hidden="true" />
        <p className={styles.text}>{t.common.loadingGame(GAME_NAMES[game])}</p>
      </div>
    </div>
  );
}

interface GameLoadErrorScreenProps {
  game: GameId;
  /** The build's default game — always available (main chunk). */
  fallbackGame: GameId;
  onRetry: () => void;
  onOpenFallback: () => void;
}

export function GameLoadErrorScreen({
  game,
  fallbackGame,
  onRetry,
  onOpenFallback,
}: GameLoadErrorScreenProps) {
  const t = useT();
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const name = GAME_NAMES[game];
  return (
    <div className={styles.screen} role="alert" data-testid="game-load-error">
      <div className={styles.card}>
        <h2 className={styles.title}>{t.common.gameLoadFailed(name)}</h2>
        <p className={styles.text}>
          {offline ? t.common.gameLoadFailedOffline(name) : t.common.gameLoadFailedHint}
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={onRetry}>
            {t.common.retry}
          </button>
          {fallbackGame !== game && (
            <button type="button" className={styles.secondary} onClick={onOpenFallback}>
              {t.common.openGame(GAME_NAMES[fallbackGame])}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface GameLoadBoundaryProps {
  /** Changing this clears a caught error (used for Retry and for switches). */
  resetKey: string;
  fallback: (error: Error) => ReactNode;
  children: ReactNode;
}

interface GameLoadBoundaryState {
  error: Error | null;
}

export class GameLoadBoundary extends Component<GameLoadBoundaryProps, GameLoadBoundaryState> {
  state: GameLoadBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): GameLoadBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error): void {
    console.warn('Game failed to load:', error);
  }

  componentDidUpdate(prevProps: GameLoadBoundaryProps): void {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render(): ReactNode {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children;
  }
}
