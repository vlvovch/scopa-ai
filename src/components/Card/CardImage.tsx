// Neapolitan Card Image Component
// Uses authentic Neapolitan card graphics from sprite sheet

import type { Card } from '../../game/types';

interface CardImageProps {
  card: Card;
}

// Get the path to the individual card SVG file
function getCardImagePath(suit: Card['suit'], value: number): string {
  return `./cards/individual/${suit}-${value}.svg`;
}

export function CardImage({ card }: CardImageProps) {
  const { suit, value } = card;
  const imagePath = getCardImagePath(suit, value);

  return (
    <img
      src={imagePath}
      alt={`${value} of ${suit}`}
      width="70"
      height="105"
      style={{ display: 'block', borderRadius: '6px', pointerEvents: 'none' }}
      draggable={false}
    />
  );
}

// Card back design
export function CardBack() {
  return (
    <svg
      viewBox="0 0 70 105"
      width="70"
      height="105"
      style={{ display: 'block' }}
    >
      {/* Card background */}
      <rect
        x="0"
        y="0"
        width="70"
        height="105"
        rx="6"
        fill="#1a237e"
        stroke="#0d1442"
        strokeWidth="1"
      />

      {/* Outer border */}
      <rect
        x="4"
        y="4"
        width="62"
        height="97"
        rx="4"
        fill="none"
        stroke="#DAA520"
        strokeWidth="1"
      />

      {/* Inner border */}
      <rect
        x="8"
        y="8"
        width="54"
        height="89"
        rx="3"
        fill="none"
        stroke="#DAA520"
        strokeWidth="0.5"
      />

      {/* Diamond pattern */}
      <pattern id="cardBackPattern" x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse">
        <path
          d="M7 0 L14 7 L7 14 L0 7 Z"
          fill="none"
          stroke="#DAA520"
          strokeWidth="0.3"
          opacity="0.4"
        />
      </pattern>
      <rect
        x="10"
        y="10"
        width="50"
        height="85"
        fill="url(#cardBackPattern)"
      />

      {/* Center ornament */}
      <ellipse
        cx="35"
        cy="52.5"
        rx="12"
        ry="16"
        fill="#1a237e"
        stroke="#DAA520"
        strokeWidth="1"
      />
      <ellipse
        cx="35"
        cy="52.5"
        rx="8"
        ry="11"
        fill="none"
        stroke="#DAA520"
        strokeWidth="0.5"
      />
    </svg>
  );
}
