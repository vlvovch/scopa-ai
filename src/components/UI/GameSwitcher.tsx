// Compact Scopa / Briscola selector — a two-segment pill in the start
// screen's card (above the title) and in the "Game" row of Settings, so
// it is reachable both from the main menu and mid-game. The active game
// is the filled (accent) segment, matching the selected-option look of
// the mode / score buttons. Switching mid-game goes through each app's
// leave-game confirmation; this control only reports the choice.

import { GAME_IDS, GAME_NAMES, type GameId } from '../../games/gameSelection';
import { preloadGame } from '../../games/gameLoaders';
import { useT } from '../../i18n/LanguageContext';
import styles from './GameSwitcher.module.css';

interface GameSwitcherProps {
  /** The game currently on screen. */
  value: GameId;
  /** Called with the OTHER game when the user picks it (never with `value`). */
  onChange: (game: GameId) => void;
  /** Layout-only class for the wrapper (margins). */
  className?: string;
}

export function GameSwitcher({ value, onChange, className }: GameSwitcherProps) {
  const t = useT();
  return (
    <div
      role="group"
      aria-label={t.common.chooseGame}
      className={`${styles.switcher} ${className ?? ''}`}
      data-testid="game-switcher"
    >
      {GAME_IDS.map((id) => {
        const active = id === value;
        return (
          <button
            key={id}
            type="button"
            className={`${styles.option} ${active ? styles.selected : ''}`}
            aria-pressed={active}
            data-game={id}
            onClick={() => {
              if (!active) onChange(id);
            }}
            // Warm the other game's chunk while the finger / pointer is
            // still on its way, so the switch itself feels instant.
            onPointerEnter={() => {
              if (!active) preloadGame(id);
            }}
            onFocus={() => {
              if (!active) preloadGame(id);
            }}
          >
            {GAME_NAMES[id]}
          </button>
        );
      })}
    </div>
  );
}
