// Step 7.5: TableCards Component with animations

import { forwardRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Card as CardType } from '../../game/types';
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
  /** Called when a table card is clicked */
  onCardClick?: (card: CardType) => void;
  /** Whether table cards are selectable */
  selectable?: boolean;
  /** Whether a card is being dragged over */
  isDragOver?: boolean;
  /** Number of cards remaining in the deck */
  deckCount?: number;
}

export const TableCards = forwardRef<HTMLDivElement, TableCardsProps>(function TableCards({
  cards,
  highlightedCardIds = [],
  selectedCardIds = [],
  onCardClick,
  selectable = false,
  isDragOver = false,
  deckCount,
}, ref) {
  const highlightedSet = new Set(highlightedCardIds);
  const selectedSet = new Set(selectedCardIds);

  const tableClasses = [
    styles.tableArea,
    isDragOver && styles.dropTarget,
  ].filter(Boolean).join(' ');

  return (
    <div className={styles.tableContainer}>
      {/* Dealer deck on the left */}
      {deckCount !== undefined && (
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
            cards.map((card, index) => (
              <motion.div
                key={card.id}
                className={styles.tableCard}
                layout
                initial={{ opacity: 0, scale: 0.8, y: -20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{
                  opacity: 0,
                  scale: 0.8,
                  y: 20,
                  transition: { duration: 0.25, ease: 'easeOut' }
                }}
                transition={{
                  type: 'spring',
                  stiffness: 250,
                  damping: 22,
                  mass: 0.8,
                  delay: index * 0.04,
                }}
              >
                <Card
                  card={card}
                  highlighted={highlightedSet.has(card.id)}
                  selected={selectedSet.has(card.id)}
                  onClick={selectable && onCardClick ? () => onCardClick(card) : undefined}
                  disabled={!selectable}
                  layoutId={`table-${card.id}`}
                />
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
});
