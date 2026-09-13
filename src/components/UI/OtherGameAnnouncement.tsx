// One-time notice on the default game's start screen for EXISTING players:
// "you can now play <the other game> here too". Gated by
// shouldAnnounceOtherGame() (prior play of this game, no trace of the
// other, never chose/switched, not told yet) and remembered as seen the
// moment it is dismissed or accepted, so it shows exactly once. New
// visitors never see it — they get the first-launch chooser instead.

import { useState } from 'react';
import {
  DEFAULT_GAME,
  GAME_NAMES,
  markOtherGameAnnounced,
  otherGame,
  shouldAnnounceOtherGame,
  type GameId,
} from '../../games/gameSelection';
import { preloadGame } from '../../games/gameLoaders';
import { CardImage } from '../Card/CardImage';
import { SIGNATURE_CARD } from './signatureCards';
import { useT } from '../../i18n/LanguageContext';
import styles from './OtherGameAnnouncement.module.css';

interface OtherGameAnnouncementProps {
  /** The game whose start screen renders this. Only the deployment's
   *  default game announces (its non-default sibling). */
  game: GameId;
  onSwitchGame: (game: GameId) => void;
}

export function OtherGameAnnouncement({ game, onSwitchGame }: OtherGameAnnouncementProps) {
  const t = useT();
  const [open, setOpen] = useState(() => game === DEFAULT_GAME && shouldAnnounceOtherGame());
  if (!open) return null;
  const target = otherGame(DEFAULT_GAME);
  const name = GAME_NAMES[target];
  const dismiss = () => {
    markOtherGameAnnounced();
    setOpen(false);
  };
  const tryIt = () => {
    markOtherGameAnnounced();
    setOpen(false);
    onSwitchGame(target);
  };
  return (
    <div className={styles.overlay} onClick={dismiss} data-testid="other-game-announcement">
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="other-game-announcement-title"
        onClick={(e) => e.stopPropagation()}
        onPointerEnter={() => preloadGame(target)}
      >
        <span className={styles.art} aria-hidden="true">
          <CardImage card={SIGNATURE_CARD[target]} style={{ width: '100%', height: '100%' }} />
        </span>
        <div className={styles.body}>
          <h3 id="other-game-announcement-title" className={styles.title}>
            {t.common.announceTitle(name)}
          </h3>
          <p className={styles.text}>{t.common.announceBody(name)}</p>
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={dismiss}>
              {t.common.announceLater}
            </button>
            <button type="button" className={styles.primary} onClick={tryIt} autoFocus>
              {t.common.announceTry(name)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
