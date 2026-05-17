// CaptureChoiceModal - Shows capture options when multiple captures are possible

import { motion, AnimatePresence } from 'framer-motion';
import type { Card, Move } from '../../games/scopa/types';
import { moveKey } from '../../games/scopa/ai/winOdds';
import type { OutcomeOdds } from '../../games/scopa/ai/winOdds';
import { CardImage } from '../Card/CardImage';
import styles from './CaptureChoiceModal.module.css';

interface CaptureChoiceModalProps {
  isOpen: boolean;
  playedCard: Card | null;
  captureOptions: Move[];
  onSelectCapture: (move: Move) => void;
  onCancel: () => void;
  /** Optional win-odds per move (keyed by Expert moveKey), shown under
   *  each option when the Win-odds analysis setting is on. */
  perMoveOdds?: Record<string, OutcomeOdds>;
}

export function CaptureChoiceModal({
  isOpen,
  playedCard,
  captureOptions,
  onSelectCapture,
  onCancel,
  perMoveOdds,
}: CaptureChoiceModalProps) {
  if (!isOpen || !playedCard) return null;

  // Best option (highest win%) among the ones we have odds for — used to
  // accent the strongest capture.
  let bestWin = -1;
  if (perMoveOdds) {
    for (const move of captureOptions) {
      const o = perMoveOdds[moveKey(move)];
      if (o && o.winPct > bestWin) bestWin = o.winPct;
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={styles.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
        >
          <motion.div
            className={styles.modal}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className={styles.title}>CHOOSE A CAPTURE</h2>

            <div className={styles.optionsContainer}>
              {captureOptions.map((move, index) => {
                const odds = perMoveOdds?.[moveKey(move)];
                const isBest =
                  odds != null && bestWin >= 0 && odds.winPct === bestWin;
                return (
                  <motion.button
                    key={index}
                    className={styles.captureOption}
                    onClick={() => onSelectCapture(move)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className={styles.cardGroup}>
                      {move.capturedCards.map((card) => (
                        <div key={card.id} className={styles.miniCard}>
                          <CardImage card={card} />
                        </div>
                      ))}
                    </div>
                    {odds && (
                      <div
                        style={{
                          marginTop: '6px',
                          textAlign: 'center',
                          fontSize: '13px',
                          lineHeight: 1.2,
                          fontVariantNumeric: 'tabular-nums',
                          color: isBest
                            ? 'var(--color-accent)'
                            : 'var(--color-text-primary)',
                          fontWeight: isBest ? 700 : 500,
                          opacity: isBest ? 1 : 0.8,
                        }}
                      >
                        {Math.round(odds.winPct)}% win
                        <span style={{ opacity: 0.6, fontSize: '11px' }}>
                          {' '}
                          · {Math.round(odds.tiePct)}% tie ·{' '}
                          {Math.round(odds.lossPct)}% loss
                        </span>
                      </div>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
