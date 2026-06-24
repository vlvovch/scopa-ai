// CaptureChoiceModal - Shows capture options when multiple captures are possible

import { motion, AnimatePresence } from 'framer-motion';
import type { Card, Move } from '../../games/scopa/types';
import { moveKey } from '../../games/scopa/ai/winOdds';
import type { MoveOdds } from '../../games/scopa/ai/winOdds';
import { CardImage } from '../Card/CardImage';
import styles from './CaptureChoiceModal.module.css';

interface CaptureChoiceModalProps {
  isOpen: boolean;
  playedCard: Card | null;
  captureOptions: Move[];
  onSelectCapture: (move: Move) => void;
  onCancel: () => void;
  /** Optional per-move odds (keyed by Expert moveKey). Shows each
   *  option's expected score margin when the analysis setting is on. */
  perMoveOdds?: Record<string, MoveOdds>;
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

  // Best option (highest expected score margin) among the ones we have
  // odds for — used to accent the strongest capture.
  let bestDiff = -Infinity;
  if (perMoveOdds) {
    for (const move of captureOptions) {
      const o = perMoveOdds[moveKey(move)];
      if (o && o.expectedDiff > bestDiff) bestDiff = o.expectedDiff;
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
                  odds != null &&
                  bestDiff > -Infinity &&
                  odds.expectedDiff === bestDiff;
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
                          fontSize: 'calc(13px * var(--font-scale, 1))',
                          lineHeight: 1.2,
                          fontVariantNumeric: 'tabular-nums',
                          color: isBest
                            ? 'var(--color-accent)'
                            : odds.expectedDiff >= 0
                              ? 'var(--color-text-primary)'
                              : '#e57373',
                          fontWeight: isBest ? 700 : 500,
                          opacity: isBest ? 1 : 0.8,
                        }}
                      >
                        {odds.expectedDiff >= 0 ? '+' : ''}
                        {odds.expectedDiff.toFixed(1)}
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
