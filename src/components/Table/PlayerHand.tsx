// Step 7.4: PlayerHand Component

import type { Card as CardType } from '../../game/types';
import { Card } from '../Card/Card';
import styles from './PlayerHand.module.css';

interface PlayerHandProps {
  /** Cards in the player's hand */
  cards: CardType[];
  /** Whether this is the human player's hand */
  isHuman: boolean;
  /** Called when a card is clicked (human only) */
  onCardClick?: (card: CardType) => void;
  /** Currently selected card ID */
  selectedCardId?: string | null;
  /** Whether interactions are disabled */
  disabled?: boolean;
}

export function PlayerHand({
  cards,
  isHuman,
  onCardClick,
  selectedCardId,
  disabled = false,
}: PlayerHandProps) {
  const handClasses = [
    styles.hand,
    isHuman ? styles.human : styles.cpu,
  ].join(' ');

  return (
    <div className={handClasses}>
      {cards.map((card) => (
        <div key={card.id} className={styles.handCard}>
          <Card
            card={card}
            faceDown={!isHuman}
            onClick={isHuman && onCardClick ? () => onCardClick(card) : undefined}
            selected={isHuman && selectedCardId === card.id}
            disabled={disabled || !isHuman}
          />
        </div>
      ))}
    </div>
  );
}
