// Card Image Component
// Uses authentic Italian card graphics converted to WebP for fast loading

import { useState } from 'react';
import type { Card } from '../../game/types';
import { useDeck } from '../../contexts/DeckContext';
import type { DeckType } from '../../hooks/useSettings';

interface CardImageProps {
  card: Card;
}

// Get the path to the individual card WebP file
// Use absolute paths to work correctly with SPA routing (e.g., /join/CODE paths)
function getCardImagePath(deck: DeckType, suit: Card['suit'], value: number): string {
  return `/cards/${deck}/${suit}-${value}.webp`;
}

export function CardImage({ card }: CardImageProps) {
  const deck = useDeck();
  const { suit, value } = card;
  const [imageError, setImageError] = useState(false);
  const imagePath = getCardImagePath(deck, suit, value);

  // Fallback display if image fails to load
  if (imageError) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fff',
          color: '#333',
          fontSize: '0.8rem',
          fontWeight: 'bold',
          textAlign: 'center',
          padding: '4px',
        }}
      >
        {value}<br />{suit.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={imagePath}
      alt={`${value} of ${suit}`}
      style={{ display: 'block', pointerEvents: 'none' }}
      draggable={false}
      onError={() => setImageError(true)}
    />
  );
}

// Card back - uses selected deck style
export function CardBack() {
  const deck = useDeck();
  const [imageError, setImageError] = useState(false);

  // Fallback display if image fails to load
  if (imageError) {
    return (
      <div
        style={{
          width: 'var(--card-back-scale)',
          height: 'var(--card-back-scale)',
          margin: 'var(--card-back-offset)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #1a365d 0%, #2c5282 50%, #1a365d 100%)',
          color: '#e2e8f0',
          fontSize: '0.7rem',
          fontWeight: 'bold',
          textAlign: 'center',
          border: '2px solid #4a5568',
          borderRadius: '4px',
        }}
      >
        SCOPA
      </div>
    );
  }

  return (
    <img
      src={`/cards/${deck}/back.webp`}
      alt="Card back"
      style={{
        display: 'block',
        width: 'var(--card-back-scale)',
        height: 'var(--card-back-scale)',
        margin: 'var(--card-back-offset)',
        pointerEvents: 'none',
      }}
      draggable={false}
      onError={() => setImageError(true)}
    />
  );
}
