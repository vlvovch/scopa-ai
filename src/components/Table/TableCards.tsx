// Step 7.5: TableCards Component with animations

import { AnimatePresence, motion } from 'framer-motion';
import type { Card as CardType } from '../../game/types';
import { Card } from '../Card/Card';
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
}

export function TableCards({
  cards,
  highlightedCardIds = [],
  selectedCardIds = [],
  onCardClick,
  selectable = false,
}: TableCardsProps) {
  const highlightedSet = new Set(highlightedCardIds);
  const selectedSet = new Set(selectedCardIds);

  return (
    <div className={styles.tableArea}>
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
              initial={{ opacity: 0, scale: 0.5, y: -30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{
                opacity: 0,
                scale: 0.5,
                y: 30,
                transition: { duration: 0.2 }
              }}
              transition={{
                type: 'spring',
                stiffness: 400,
                damping: 25,
                delay: index * 0.05,
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
  );
}
