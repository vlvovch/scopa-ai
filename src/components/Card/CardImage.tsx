// Card Image Component
// Uses authentic Italian card graphics converted to WebP for fast loading

import type { Card } from '../../game/types';
import { useDeck } from '../../contexts/DeckContext';
import type { DeckType } from '../../hooks/useSettings';

interface CardImageProps {
  card: Card;
}

// Get the path to the individual card WebP file
function getCardImagePath(deck: DeckType, suit: Card['suit'], value: number): string {
  return `./cards/${deck}/${suit}-${value}.webp`;
}

export function CardImage({ card }: CardImageProps) {
  const deck = useDeck();
  const { suit, value } = card;
  const imagePath = getCardImagePath(deck, suit, value);

  return (
    <img
      src={imagePath}
      alt={`${value} of ${suit}`}
      style={{ display: 'block', pointerEvents: 'none' }}
      draggable={false}
    />
  );
}

// Card back - uses selected deck style
export function CardBack() {
  const deck = useDeck();

  return (
    <img
      src={`./cards/${deck}/back.webp`}
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
