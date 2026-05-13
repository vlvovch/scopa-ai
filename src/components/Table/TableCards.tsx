// Step 7.5: TableCards Component with animations

import { forwardRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Card as CardType } from '../../games/scopa/types';
import { Card } from '../Card/Card';
import { DealerDeck } from './DealerDeck';
import styles from './TableCards.module.css';

interface TableCardsProps {
  /** Cards currently on the table */
  cards: CardType[];
  /** Card IDs that are highlighted as valid capture targets */
  highlightedCardIds?: string[];
  /** Card IDs that are currently selected for capture */
  selectedCardIds?: string[];
  /** Card IDs that are being captured (levitate animation) */
  capturingCardIds?: string[];
  /** Direction for capture exit animation ('cpu' = fly up, 'human' = fly down) */
  captureDirection?: 'cpu' | 'human';
  /** Called when a table card is clicked */
  onCardClick?: (card: CardType) => void;
  /** Whether table cards are selectable */
  selectable?: boolean;
  /** Whether a card is being dragged over */
  isDragOver?: boolean;
  /** Number of cards remaining in the deck */
  deckCount?: number;
  /** Current dealer ('human' = deck on right, 'cpu' = deck on left) */
  dealer?: 'human' | 'cpu';
}

export const TableCards = forwardRef<HTMLDivElement, TableCardsProps>(function TableCards({
  cards,
  highlightedCardIds = [],
  selectedCardIds = [],
  capturingCardIds = [],
  captureDirection,
  onCardClick,
  selectable = false,
  isDragOver = false,
  deckCount,
  dealer = 'cpu',
}, ref) {
  const highlightedSet = new Set(highlightedCardIds);
  const selectedSet = new Set(selectedCardIds);
  const capturingSet = new Set(capturingCardIds);

  const tableClasses = [
    styles.tableArea,
    isDragOver && styles.dropTarget,
  ].filter(Boolean).join(' ');

  // Position deck based on dealer: cpu dealer = left side, human dealer = right side
  const deckOnRight = dealer === 'human';

  return (
    <div className={styles.tableContainer}>
      {/* Dealer deck on left (cpu is dealer) */}
      {deckCount !== undefined && !deckOnRight && (
        <div className={styles.deckArea}>
          <DealerDeck cardsRemaining={deckCount} />
        </div>
      )}

      {/* Table cards area */}
      <div ref={ref} className={tableClasses}>
        <AnimatePresence mode="popLayout">
          {cards.length === 0 ? (
            <motion.span
              key="empty"
              className={styles.emptyMessage}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              Table is empty
            </motion.span>
          ) : (
            cards.map((card) => {
              const isCapturing = capturingSet.has(card.id);
              // Determine exit animation based on capture direction - fly toward the pile
              // CPU pile is top-RIGHT, human pile is bottom-LEFT
              const exitY = captureDirection === 'cpu' ? -400 : captureDirection === 'human' ? 400 : 20;
              const exitX = captureDirection === 'cpu' ? 200 : captureDirection === 'human' ? -200 : 0;
              const isBeingCaptured = isCapturing && captureDirection;
              return (
                <motion.div
                  key={card.id}
                  className={`${styles.tableCard} ${isCapturing ? styles.capturing : ''}`}
                  layout
                  initial={{ opacity: 0, scale: 0.8, y: -20 }}
                  animate={isCapturing ? {
                    opacity: 1,
                    scale: 1.15,
                    y: -20,
                    boxShadow: '0 12px 32px rgba(212, 175, 55, 0.7)',
                  } : { opacity: 1, scale: 1, y: 0 }}
                  exit={{
                    opacity: isBeingCaptured ? [1, 1, 0] : 0,
                    scale: isBeingCaptured ? [1.15, 0.8, 0.3] : 0.8,
                    y: exitY,
                    x: exitX,
                    rotate: isBeingCaptured ? (captureDirection === 'cpu' ? 30 : -30) : 0,
                    transition: {
                      duration: isBeingCaptured ? 0.85 : 0.25,
                      ease: [0.25, 0.1, 0.25, 1],
                      opacity: isBeingCaptured ? { times: [0, 0.75, 1] } : undefined,
                      scale: isBeingCaptured ? { times: [0, 0.4, 1] } : undefined,
                    }
                  }}
                  transition={{
                    type: 'spring',
                    stiffness: isCapturing ? 350 : 500,
                    damping: isCapturing ? 18 : 35,
                    mass: isCapturing ? 0.8 : 0.4,
                    // No stagger delay - cards appear instantly after dealing animation
                  }}
                >
                  <Card
                    card={card}
                    highlighted={highlightedSet.has(card.id) || isCapturing}
                    selected={selectedSet.has(card.id)}
                    onClick={selectable && onCardClick ? () => onCardClick(card) : undefined}
                    disabled={!selectable || isCapturing}
                    layoutId={`table-${card.id}`}
                  />
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>

      {/* Dealer deck on right (human is dealer) */}
      {deckCount !== undefined && deckOnRight && (
        <div className={styles.deckArea}>
          <DealerDeck cardsRemaining={deckCount} />
        </div>
      )}
    </div>
  );
});
