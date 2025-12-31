// Neapolitan Card Image Component
// Uses authentic Neapolitan card graphics converted to WebP for fast loading

import type { Card } from '../../game/types';

interface CardImageProps {
  card: Card;
}

// Get the path to the individual card WebP file
function getCardImagePath(suit: Card['suit'], value: number): string {
  return `./cards/webp/${suit}-${value}.webp`;
}

export function CardImage({ card }: CardImageProps) {
  const { suit, value } = card;
  const imagePath = getCardImagePath(suit, value);

  return (
    <img
      src={imagePath}
      alt={`${value} of ${suit}`}
      style={{ display: 'block', pointerEvents: 'none' }}
      draggable={false}
    />
  );
}

// Card back - Neapolitan design
export function CardBack() {
  return (
    <img
      src="./cards/webp/back.webp"
      alt="Card back"
      style={{
        display: 'block',
        width: 'var(--card-back-scale)',
        height: 'var(--card-back-scale)',
        margin: 'var(--card-back-offset)',
        pointerEvents: 'none',
      }}
      draggable={false}
    />
  );
}
