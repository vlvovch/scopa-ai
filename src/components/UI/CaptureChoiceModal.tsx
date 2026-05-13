// CaptureChoiceModal - Shows capture options when multiple captures are possible

import { motion, AnimatePresence } from 'framer-motion';
import type { Card, Move } from '../../games/scopa/types';
import { CardImage } from '../Card/CardImage';
import styles from './CaptureChoiceModal.module.css';

interface CaptureChoiceModalProps {
  isOpen: boolean;
  playedCard: Card | null;
  captureOptions: Move[];
  onSelectCapture: (move: Move) => void;
  onCancel: () => void;
}

export function CaptureChoiceModal({
  isOpen,
  playedCard,
  captureOptions,
  onSelectCapture,
  onCancel,
}: CaptureChoiceModalProps) {
  if (!isOpen || !playedCard) return null;

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
              {captureOptions.map((move, index) => (
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
                </motion.button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
