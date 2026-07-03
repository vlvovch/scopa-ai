// ReasoningModal Component
// Modal showing AI's last move with cards and reasoning

import { motion, AnimatePresence } from 'framer-motion';
import { CardImage, CardBack } from '../Card/CardImage';
import { useT } from '../../i18n/LanguageContext';
import styles from './ReasoningModal.module.css';
import type { Card, PlayerId } from '../../games/scopa/types';

interface LastMoveData {
  /** The card the AI played */
  cardPlayed: Card;
  /** Cards that were on the table before the move */
  tableCards: Card[];
  /** Cards that were captured (subset of tableCards) */
  capturedCards: Card[];
  /** AI's reasoning for the move */
  reasoning: string;
  /** Which player made this move */
  player: PlayerId;
  /** AI name for display */
  aiName?: string;
  /** Opponent's hand at time of move (shown face-down) */
  opponentHandCount?: number;
  /** This AI's other hand cards (not the one played) */
  otherHandCards?: Card[];
}

interface ReasoningModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** The last move data to display */
  lastMove: LastMoveData | null;
  /** Close handler */
  onClose: () => void;
  /** Whether the modal is locked (clicked) vs preview (hover) */
  locked?: boolean;
  /** Position of modal - 'top' for upper player, 'bottom' for lower player */
  position?: 'top' | 'bottom' | 'center';
}

export function ReasoningModal({ isOpen, lastMove, onClose, locked = true, position = 'center' }: ReasoningModalProps) {
  const t = useT();
  if (!lastMove) return null;

  const { cardPlayed, tableCards, capturedCards, reasoning, aiName, opponentHandCount, otherHandCards } = lastMove;
  const capturedIds = new Set(capturedCards.map(c => c.id));

  // Determine modal class based on position (apply position for both hover and locked states)
  const modalClass = `${styles.modal} ${position === 'top' ? styles.modalTop : ''} ${position === 'bottom' ? styles.modalBottom : ''}`;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop - only show when locked */}
          {locked && (
            <motion.div
              className={styles.backdrop}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />
          )}

          {/* Modal */}
          <motion.div
            className={modalClass}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {/* Header */}
            <div className={styles.header}>
              <h3 className={styles.title}>
                {t.reasoning.moveTitle(aiName ?? null)}
                {!locked && <span className={styles.previewHint}> {t.reasoning.clickToLock}</span>}
              </h3>
              {locked && (
                <button className={styles.closeButton} onClick={onClose} aria-label={t.common.close}>
                  &times;
                </button>
              )}
            </div>

            {/* Scrollable content */}
            <div className={styles.content}>
              {/* Main game state visualization: AI hand → Table ← Opponent hand */}
              <div className={styles.gameRow}>
                {/* AI's hand (left side) */}
                <div className={styles.sideSection}>
                  <div className={styles.sectionLabel}>{aiName || t.reasoning.ai}</div>
                  <div className={styles.handCards}>
                    {/* Other cards first */}
                    {otherHandCards?.map(card => (
                      <div key={card.id} className={styles.handCard}>
                        <CardImage card={card} />
                      </div>
                    ))}
                    {/* Played card last (rightmost), highlighted */}
                    <div className={`${styles.handCard} ${styles.played}`}>
                      <CardImage card={cardPlayed} />
                    </div>
                  </div>
                </div>

                {/* Arrow from AI to table */}
                <div className={styles.arrow}>→</div>

                {/* Table (center) */}
                <div className={styles.tableSection}>
                  <div className={styles.sectionLabel}>{t.reasoning.table}</div>
                  <div className={styles.tableCards}>
                    {tableCards.length === 0 ? (
                      <div className={styles.emptyTable}>{t.reasoning.empty}</div>
                    ) : (
                      <>
                        {/* Captured cards first (left side of table), highlighted */}
                        {tableCards.filter(c => capturedIds.has(c.id)).map(card => (
                          <div key={card.id} className={`${styles.tableCard} ${styles.captured}`}>
                            <CardImage card={card} />
                          </div>
                        ))}
                        {/* Non-captured cards after */}
                        {tableCards.filter(c => !capturedIds.has(c.id)).map(card => (
                          <div key={card.id} className={styles.tableCard}>
                            <CardImage card={card} />
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>

                {/* Arrow from opponent to table */}
                {opponentHandCount !== undefined && opponentHandCount > 0 && (
                  <div className={styles.arrow}>←</div>
                )}

                {/* Opponent's hand (right side, face-down) */}
                {opponentHandCount !== undefined && opponentHandCount > 0 && (
                  <div className={styles.sideSection}>
                    <div className={styles.sectionLabel}>{t.common.opponent}</div>
                    <div className={styles.opponentHand}>
                      {Array.from({ length: opponentHandCount }).map((_, i) => (
                        <div key={i} className={styles.opponentCard}>
                          <CardBack />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Reasoning */}
              <div className={styles.reasoningSection}>
                <div className={styles.reasoningLabel}>{t.reasoning.reasoning}</div>
                <div className={styles.reasoningText}>
                  {reasoning}
                </div>
              </div>
            </div>

            {/* Close button at bottom - only when locked */}
            {locked && (
              <button className={styles.closeButtonBottom} onClick={onClose}>
                {t.common.close}
              </button>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export type { LastMoveData };
