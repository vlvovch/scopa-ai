// Steps 7.1, 7.2, 7.3: Card Component with Back Design and Suit Symbols

import type { Card as CardType } from '../../game/types';
import styles from './Card.module.css';

/** Step 7.3: Suit symbols using Unicode/emoji */
const SUIT_SYMBOLS: Record<CardType['suit'], string> = {
  coins: '🪙',
  cups: '🏆',
  swords: '⚔️',
  clubs: '♣',
};

/** Display value (face cards use letters) */
function getDisplayValue(value: number): string {
  switch (value) {
    case 1:
      return 'A';
    case 8:
      return 'J'; // Fante (Jack)
    case 9:
      return 'C'; // Cavallo (Knight)
    case 10:
      return 'K'; // Re (King)
    default:
      return String(value);
  }
}

interface CardProps {
  /** The card to display, or null for face-down */
  card: CardType | null;
  /** Whether to show the back of the card */
  faceDown?: boolean;
  /** Called when the card is clicked */
  onClick?: () => void;
  /** Whether this card is selected */
  selected?: boolean;
  /** Whether this card is highlighted (valid target) */
  highlighted?: boolean;
  /** Whether interactions are disabled */
  disabled?: boolean;
}

export function Card({
  card,
  faceDown = false,
  onClick,
  selected = false,
  highlighted = false,
  disabled = false,
}: CardProps) {
  const showBack = faceDown || card === null;

  const cardClasses = [
    styles.card,
    selected && styles.selected,
    highlighted && styles.highlighted,
    disabled && styles.disabled,
  ]
    .filter(Boolean)
    .join(' ');

  const handleClick = () => {
    if (!disabled && onClick) {
      onClick();
    }
  };

  // Step 7.2: Card Back
  if (showBack) {
    return (
      <div className={cardClasses} onClick={handleClick}>
        <div className={styles.cardBack} />
      </div>
    );
  }

  // Step 7.1 & 7.3: Card Face with suit symbols
  const suitSymbol = SUIT_SYMBOLS[card.suit];
  const displayValue = getDisplayValue(card.value);
  const suitClass = styles[card.suit];

  return (
    <div className={cardClasses} onClick={handleClick}>
      <div className={styles.cardFace}>
        {/* Top-left corner */}
        <div className={`${styles.cornerValue} ${styles.topLeft} ${suitClass}`}>
          <span>{displayValue}</span>
          <span className={styles.cornerSuit}>{suitSymbol}</span>
        </div>

        {/* Center suit */}
        <div className={`${styles.centerSuit} ${suitClass}`}>{suitSymbol}</div>

        {/* Bottom-right corner (rotated) */}
        <div className={`${styles.cornerValue} ${styles.bottomRight} ${suitClass}`}>
          <span>{displayValue}</span>
          <span className={styles.cornerSuit}>{suitSymbol}</span>
        </div>
      </div>
    </div>
  );
}
