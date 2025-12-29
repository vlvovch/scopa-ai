// Step 7.5: TableCards Component

import type { Card as CardType } from '../../game/types';
import { Card } from '../Card/Card';
import styles from './TableCards.module.css';

interface TableCardsProps {
  /** Cards currently on the table */
  cards: CardType[];
  /** Card IDs that are highlighted as valid capture targets */
  highlightedCardIds?: string[];
  /** Called when a table card is clicked */
  onCardClick?: (card: CardType) => void;
  /** Whether table cards are selectable */
  selectable?: boolean;
}

export function TableCards({
  cards,
  highlightedCardIds = [],
  onCardClick,
  selectable = false,
}: TableCardsProps) {
  const highlightedSet = new Set(highlightedCardIds);

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
              onClick={selectable && onCardClick ? () => onCardClick(card) : undefined}
              disabled={!selectable}
            />
          </div>
        ))
      )}
    </div>
  );
}
