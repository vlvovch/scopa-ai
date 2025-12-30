// Step 7.5: TableCards Component

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
      {cards.length === 0 ? (
        <span className={styles.emptyMessage}>Table is empty</span>
      ) : (
        cards.map((card) => (
          <div key={card.id} className={styles.tableCard}>
            <Card
              card={card}
              highlighted={highlightedSet.has(card.id)}
              selected={selectedSet.has(card.id)}
              onClick={selectable && onCardClick ? () => onCardClick(card) : undefined}
              disabled={!selectable}
            />
          </div>
        ))
      )}
    </div>
  );
}
