// Neapolitan Card SVG Generator
// Creates stylized SVG representations of Italian playing cards

import type { Card } from '../../game/types';

interface CardImageProps {
  card: Card;
}

// Neapolitan suit colors
const SUIT_COLORS = {
  coins: '#DAA520',    // Gold
  cups: '#C41E3A',     // Crimson red
  swords: '#4169E1',   // Royal blue
  clubs: '#228B22',    // Forest green
};

// Suit symbols (simplified Neapolitan style)
const SUIT_PATHS = {
  // Coin - circle with inner detail
  coins: (
    <g>
      <circle cx="0" cy="0" r="10" fill="#DAA520" stroke="#B8860B" strokeWidth="1"/>
      <circle cx="0" cy="0" r="6" fill="none" stroke="#B8860B" strokeWidth="0.5"/>
      <circle cx="0" cy="0" r="2" fill="#B8860B"/>
    </g>
  ),
  // Cup - chalice shape
  cups: (
    <g>
      <path d="M-6 8 L-4 -2 Q0 -6 4 -2 L6 8 Z" fill="#C41E3A" stroke="#8B0000" strokeWidth="0.5"/>
      <ellipse cx="0" cy="8" rx="6" ry="2" fill="#C41E3A" stroke="#8B0000" strokeWidth="0.5"/>
      <rect x="-1.5" y="8" width="3" height="4" fill="#C41E3A"/>
      <ellipse cx="0" cy="12" rx="4" ry="1.5" fill="#C41E3A" stroke="#8B0000" strokeWidth="0.5"/>
    </g>
  ),
  // Sword - curved blade
  swords: (
    <g>
      <path d="M0 -12 L2 -8 L1 8 L0 10 L-1 8 L-2 -8 Z" fill="#4169E1" stroke="#1E3A8A" strokeWidth="0.5"/>
      <rect x="-4" y="-2" width="8" height="3" rx="1" fill="#8B4513" stroke="#5D3A1A" strokeWidth="0.5"/>
      <circle cx="0" cy="-0.5" r="1" fill="#DAA520"/>
    </g>
  ),
  // Club/Baton - wooden stick
  clubs: (
    <g>
      <rect x="-2" y="-12" width="4" height="24" rx="2" fill="#8B4513" stroke="#5D3A1A" strokeWidth="0.5"/>
      <ellipse cx="0" cy="-10" rx="3" ry="2" fill="#228B22" stroke="#145214" strokeWidth="0.5"/>
      <ellipse cx="0" cy="10" rx="3" ry="2" fill="#228B22" stroke="#145214" strokeWidth="0.5"/>
    </g>
  ),
};

// Face card decorations
const FACE_CARDS: Record<number, string> = {
  8: 'Fante',   // Jack
  9: 'Cavallo', // Knight
  10: 'Re',     // King
};

function getSuitSymbol(suit: Card['suit'], scale: number = 1) {
  return (
    <g transform={`scale(${scale})`}>
      {SUIT_PATHS[suit]}
    </g>
  );
}

// Generate pip positions for number cards
function getPipPositions(value: number): Array<{ x: number; y: number; scale: number }> {
  const positions: Array<{ x: number; y: number; scale: number }> = [];
  const s = 0.7; // scale

  switch (value) {
    case 1:
      positions.push({ x: 35, y: 52.5, scale: 1.5 });
      break;
    case 2:
      positions.push({ x: 35, y: 30, scale: s });
      positions.push({ x: 35, y: 75, scale: s });
      break;
    case 3:
      positions.push({ x: 35, y: 25, scale: s });
      positions.push({ x: 35, y: 52.5, scale: s });
      positions.push({ x: 35, y: 80, scale: s });
      break;
    case 4:
      positions.push({ x: 20, y: 30, scale: s });
      positions.push({ x: 50, y: 30, scale: s });
      positions.push({ x: 20, y: 75, scale: s });
      positions.push({ x: 50, y: 75, scale: s });
      break;
    case 5:
      positions.push({ x: 20, y: 30, scale: s });
      positions.push({ x: 50, y: 30, scale: s });
      positions.push({ x: 35, y: 52.5, scale: s });
      positions.push({ x: 20, y: 75, scale: s });
      positions.push({ x: 50, y: 75, scale: s });
      break;
    case 6:
      positions.push({ x: 20, y: 28, scale: s });
      positions.push({ x: 50, y: 28, scale: s });
      positions.push({ x: 20, y: 52.5, scale: s });
      positions.push({ x: 50, y: 52.5, scale: s });
      positions.push({ x: 20, y: 77, scale: s });
      positions.push({ x: 50, y: 77, scale: s });
      break;
    case 7:
      positions.push({ x: 20, y: 25, scale: 0.6 });
      positions.push({ x: 50, y: 25, scale: 0.6 });
      positions.push({ x: 35, y: 38, scale: 0.6 });
      positions.push({ x: 20, y: 52.5, scale: 0.6 });
      positions.push({ x: 50, y: 52.5, scale: 0.6 });
      positions.push({ x: 20, y: 80, scale: 0.6 });
      positions.push({ x: 50, y: 80, scale: 0.6 });
      break;
    default:
      positions.push({ x: 35, y: 52.5, scale: 1.2 });
  }

  return positions;
}

export function CardImage({ card }: CardImageProps) {
  const { suit, value } = card;
  const color = SUIT_COLORS[suit];
  const isFaceCard = value >= 8;

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
        fill="#FFFEF0"
        stroke="#CCC"
        strokeWidth="1"
      />

      {/* Inner border */}
      <rect
        x="3"
        y="3"
        width="64"
        height="99"
        rx="4"
        fill="none"
        stroke={color}
        strokeWidth="0.5"
        opacity="0.3"
      />

      {/* Top-left value */}
      <text
        x="6"
        y="16"
        fontSize="12"
        fontWeight="bold"
        fontFamily="serif"
        fill={color}
      >
        {value === 1 ? 'A' : value}
      </text>

      {/* Bottom-right value (rotated) */}
      <text
        x="64"
        y="99"
        fontSize="12"
        fontWeight="bold"
        fontFamily="serif"
        fill={color}
        transform="rotate(180, 64, 93)"
      >
        {value === 1 ? 'A' : value}
      </text>

      {isFaceCard ? (
        // Face card design
        <g>
          {/* Center figure placeholder */}
          <rect
            x="12"
            y="25"
            width="46"
            height="55"
            rx="3"
            fill={color}
            opacity="0.1"
          />

          {/* Face card title */}
          <text
            x="35"
            y="48"
            fontSize="9"
            fontWeight="bold"
            fontFamily="serif"
            fill={color}
            textAnchor="middle"
          >
            {FACE_CARDS[value]}
          </text>

          {/* Large suit symbol */}
          <g transform="translate(35, 65)">
            {getSuitSymbol(suit, 1.2)}
          </g>
        </g>
      ) : (
        // Number card - show pips
        <g>
          {getPipPositions(value).map((pos, i) => (
            <g key={i} transform={`translate(${pos.x}, ${pos.y})`}>
              {getSuitSymbol(suit, pos.scale)}
            </g>
          ))}
        </g>
      )}
    </svg>
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
