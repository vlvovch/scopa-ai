// One-time welcome chooser for brand-new visitors: pick Scopa or Briscola
// before anything else. Shown by App.tsx only when no invitation, explicit
// game URL or remembered choice decides the game AND there is no trace of
// prior play on this origin (see isFirstVisit). The pick becomes the
// remembered game, so it is never asked again; the in-app switcher covers
// changes of mind.
//
// Each option carries its signature card (see signatureCards.ts), rendered
// by the shared CardImage in the default (Napoletane) deck.

import { GAME_IDS, GAME_NAMES, type GameId } from '../../games/gameSelection';
import { preloadGame } from '../../games/gameLoaders';
import { CardImage } from '../Card/CardImage';
import { LanguageToggle } from './LanguageToggle';
import { SIGNATURE_CARD } from './signatureCards';
import { useT } from '../../i18n/LanguageContext';
import styles from './GameChooser.module.css';

interface GameChooserProps {
  /** This deployment's game — listed first. */
  defaultGame: GameId;
  onChoose: (game: GameId) => void;
}

export function GameChooser({ defaultGame, onChoose }: GameChooserProps) {
  const t = useT();
  const order: GameId[] = [defaultGame, ...GAME_IDS.filter((g) => g !== defaultGame)];
  return (
    <div className={styles.screen} data-testid="game-chooser">
      <LanguageToggle />
      <div className={styles.card}>
        <h1 className={styles.title}>{t.common.chooseGame}</h1>
        <div className={styles.options}>
          {order.map((id) => (
            <button
              key={id}
              type="button"
              className={styles.option}
              data-game={id}
              onClick={() => onChoose(id)}
              onPointerEnter={() => preloadGame(id)}
              onFocus={() => preloadGame(id)}
            >
              <span className={styles.art} aria-hidden="true">
                <CardImage card={SIGNATURE_CARD[id]} style={{ width: '100%', height: '100%' }} />
              </span>
              <span className={styles.body}>
                <span className={styles.name}>{GAME_NAMES[id]}</span>
                <span className={styles.tagline}>
                  {id === 'scopa' ? t.common.chooserScopaTagline : t.start.briscolaSubtitle}
                </span>
                <span className={styles.cta}>{t.common.playGame(GAME_NAMES[id])}</span>
              </span>
            </button>
          ))}
        </div>
        <p className={styles.hint}>{t.common.chooserHint}</p>
      </div>
    </div>
  );
}
