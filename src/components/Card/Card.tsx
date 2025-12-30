// Card Component with Neapolitan-style SVG graphics

import type { Card as CardType } from '../../game/types';
import { CardImage, CardBack } from './CardImage';
import styles from './Card.module.css';

interface CardProps {
  /** The card to display, or null for face-down */
  card: CardType | null;
  /** Whether to show the back of the card */
  faceDown?: boolean;
  /** Called when the card is clicked */
  onClick?: () => void;
  /** Called when the card is double-clicked */
  onDoubleClick?: () => void;
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
  onDoubleClick,
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

  const handleDoubleClick = () => {
    if (!disabled && onDoubleClick) {
      onDoubleClick();
    }
  };

  // Card Back (Neapolitan style)
  if (showBack) {
    return (
      <div className={cardClasses} onClick={handleClick} onDoubleClick={handleDoubleClick}>
        <CardBack />
      </div>
    );
  }

  // Card Face (Neapolitan style SVG)
  return (
    <div className={cardClasses} onClick={handleClick} onDoubleClick={handleDoubleClick}>
      <CardImage card={card} />
    </div>
  );
}
