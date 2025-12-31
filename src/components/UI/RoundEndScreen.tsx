// Step 8.4: RoundEndScreen Component with card display and hover highlighting

import { useState, useMemo } from 'react';
import type { Card, RoundScore } from '../../game/types';
import { PRIME_VALUES, SUITS } from '../../game/constants';
import { CardImage } from '../Card/CardImage';
import styles from './RoundEndScreen.module.css';

type HoverCategory = 'carte' | 'denari' | 'settebello' | 'primiera' | 'scopa' | null;

// Custom SVG icons for score categories
function CardsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" className={styles.categoryIconSvg}>
      {/* Stack of cards - 3 cards fanned */}
      <rect x="1" y="5" width="12" height="16" rx="1.5" fill="#f5f5dc" stroke="#666" strokeWidth="0.8" transform="rotate(-10 7 13)"/>
      <rect x="6" y="4" width="12" height="16" rx="1.5" fill="#f5f5dc" stroke="#666" strokeWidth="0.8"/>
      <rect x="11" y="5" width="12" height="16" rx="1.5" fill="#f5f5dc" stroke="#666" strokeWidth="0.8" transform="rotate(10 17 13)"/>
    </svg>
  );
}

function CoinIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" className={styles.categoryIconSvg}>
      <circle cx="12" cy="12" r="10" fill="url(#coinGradient)" stroke="#8B6914" strokeWidth="1.5"/>
      <circle cx="12" cy="12" r="7" fill="none" stroke="#8B6914" strokeWidth="1" opacity="0.6"/>
      <circle cx="12" cy="12" r="4" fill="none" stroke="#8B6914" strokeWidth="0.8" opacity="0.4"/>
      <circle cx="12" cy="12" r="1.5" fill="#8B6914" opacity="0.5"/>
      <defs>
        <radialGradient id="coinGradient" cx="35%" cy="35%">
          <stop offset="0%" stopColor="#FFD700"/>
          <stop offset="50%" stopColor="#DAA520"/>
          <stop offset="100%" stopColor="#B8860B"/>
        </radialGradient>
      </defs>
    </svg>
  );
}

function SetteBelloIcon() {
  // 7 of Coins card with coins arranged in 2-1-2-2 pattern (top to bottom)
  const coinRadius = 2;
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" className={styles.categoryIconSvg}>
      {/* Card background */}
      <rect x="3" y="1" width="18" height="22" rx="2" fill="#f5f5dc" stroke="#333" strokeWidth="1"/>
      <defs>
        <radialGradient id="setteCoinGrad" cx="35%" cy="35%">
          <stop offset="0%" stopColor="#FFD700"/>
          <stop offset="50%" stopColor="#DAA520"/>
          <stop offset="100%" stopColor="#B8860B"/>
        </radialGradient>
      </defs>
      {/* Row 1 - 2 coins */}
      <circle cx="9" cy="4.5" r={coinRadius} fill="url(#setteCoinGrad)" stroke="#8B6914" strokeWidth="0.5"/>
      <circle cx="15" cy="4.5" r={coinRadius} fill="url(#setteCoinGrad)" stroke="#8B6914" strokeWidth="0.5"/>
      {/* Row 2 - 1 coin */}
      <circle cx="12" cy="9" r={coinRadius} fill="url(#setteCoinGrad)" stroke="#8B6914" strokeWidth="0.5"/>
      {/* Row 3 - 2 coins */}
      <circle cx="9" cy="14" r={coinRadius} fill="url(#setteCoinGrad)" stroke="#8B6914" strokeWidth="0.5"/>
      <circle cx="15" cy="14" r={coinRadius} fill="url(#setteCoinGrad)" stroke="#8B6914" strokeWidth="0.5"/>
      {/* Row 4 - 2 coins */}
      <circle cx="9" cy="19" r={coinRadius} fill="url(#setteCoinGrad)" stroke="#8B6914" strokeWidth="0.5"/>
      <circle cx="15" cy="19" r={coinRadius} fill="url(#setteCoinGrad)" stroke="#8B6914" strokeWidth="0.5"/>
    </svg>
  );
}

function PrimieraIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" className={styles.categoryIconSvg}>
      <polygon
        points="12,2 15,9 22,9 16.5,14 18.5,21 12,17 5.5,21 7.5,14 2,9 9,9"
        fill="url(#starGradient)"
        stroke="#8B6914"
        strokeWidth="1"
      />
      <defs>
        <linearGradient id="starGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFD700"/>
          <stop offset="100%" stopColor="#DAA520"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

function ScopaIcon() {
  return <span className={styles.emojiIcon}>🧹</span>;
}

interface RoundEndScreenProps {
  roundNumber: number;
  humanScore: RoundScore;
  cpuScore: RoundScore;
  cumulativeHuman: number;
  cumulativeCpu: number;
  humanCaptured: Card[];
  cpuCaptured: Card[];
  humanScopaCaptures: Card[][];
  cpuScopaCaptures: Card[][];
  isGameOver?: boolean;
  onNextRound: () => void;
  onShowGameEnd?: () => void;
  /** Player 1 name (defaults to "You") */
  player1Name?: string;
  /** Player 2 name (defaults to "CPU") */
  player2Name?: string;
}

// Get the best prime card for each suit
function getPrimeCards(captured: Card[]): Card[] {
  const primeCards: Card[] = [];
  for (const suit of SUITS) {
    const suitCards = captured.filter(c => c.suit === suit);
    if (suitCards.length > 0) {
      // Find card with highest prime value
      const bestCard = suitCards.reduce((best, card) =>
        PRIME_VALUES[card.value] > PRIME_VALUES[best.value] ? card : best
      );
      primeCards.push(bestCard);
    }
  }
  return primeCards;
}

// Check if a card should be highlighted based on current hover
function shouldHighlight(card: Card, category: HoverCategory, scopaCardIds: Set<string>): boolean {
  if (!category) return false;

  switch (category) {
    case 'carte':
      return true; // All cards count for carte lungo
    case 'denari':
      return card.suit === 'coins';
    case 'settebello':
      return card.suit === 'coins' && card.value === 7;
    case 'primiera':
      return false; // Handled separately with getPrimeCards
    case 'scopa':
      return scopaCardIds.has(card.id); // Highlight cards that formed scopas
    default:
      return false;
  }
}

export function RoundEndScreen({
  roundNumber,
  humanScore,
  cpuScore,
  cumulativeHuman,
  cumulativeCpu,
  humanCaptured,
  cpuCaptured,
  humanScopaCaptures,
  cpuScopaCaptures,
  isGameOver,
  onNextRound,
  onShowGameEnd,
  player1Name = 'You',
  player2Name = 'CPU',
}: RoundEndScreenProps) {
  const [hoveredCategory, setHoveredCategory] = useState<HoverCategory>(null);

  // Helper to format primiera score
  const formatPrime = (prime: number | null) => prime !== null ? prime.toString() : '-';

  // Get prime cards for each player
  const humanPrimeCards = useMemo(() => getPrimeCards(humanCaptured), [humanCaptured]);
  const cpuPrimeCards = useMemo(() => getPrimeCards(cpuCaptured), [cpuCaptured]);
  const humanPrimeIds = useMemo(() => new Set(humanPrimeCards.map(c => c.id)), [humanPrimeCards]);
  const cpuPrimeIds = useMemo(() => new Set(cpuPrimeCards.map(c => c.id)), [cpuPrimeCards]);

  // Get scopa card IDs for each player
  const humanScopaIds = useMemo(
    () => new Set(humanScopaCaptures.flat().map(c => c.id)),
    [humanScopaCaptures]
  );
  const cpuScopaIds = useMemo(
    () => new Set(cpuScopaCaptures.flat().map(c => c.id)),
    [cpuScopaCaptures]
  );

  // Check if card is highlighted
  const isHighlighted = (card: Card, isHuman: boolean) => {
    if (!hoveredCategory) return false;
    if (hoveredCategory === 'primiera') {
      return isHuman ? humanPrimeIds.has(card.id) : cpuPrimeIds.has(card.id);
    }
    const scopaIds = isHuman ? humanScopaIds : cpuScopaIds;
    return shouldHighlight(card, hoveredCategory, scopaIds);
  };

  // Categories with counts and winner highlighting
  const categories: Array<{
    id: HoverCategory;
    name: string;
    icon: React.ReactNode;
    humanCount: string | number;
    cpuCount: string | number;
    humanWon: boolean;
    cpuWon: boolean;
  }> = [
    {
      id: 'carte',
      name: 'Carte Lungo',
      icon: <CardsIcon />,
      humanCount: humanScore.counts.cards,
      cpuCount: cpuScore.counts.cards,
      humanWon: humanScore.cards > 0,
      cpuWon: cpuScore.cards > 0,
    },
    {
      id: 'denari',
      name: 'Denari',
      icon: <CoinIcon />,
      humanCount: humanScore.counts.coins,
      cpuCount: cpuScore.counts.coins,
      humanWon: humanScore.coins > 0,
      cpuWon: cpuScore.coins > 0,
    },
    {
      id: 'settebello',
      name: 'Sette Bello',
      icon: <SetteBelloIcon />,
      humanCount: humanScore.setteBello > 0 ? '✓' : '-',
      cpuCount: cpuScore.setteBello > 0 ? '✓' : '-',
      humanWon: humanScore.setteBello > 0,
      cpuWon: cpuScore.setteBello > 0,
    },
    {
      id: 'primiera',
      name: 'Primiera',
      icon: <PrimieraIcon />,
      humanCount: formatPrime(humanScore.counts.prime),
      cpuCount: formatPrime(cpuScore.counts.prime),
      humanWon: humanScore.prime > 0,
      cpuWon: cpuScore.prime > 0,
    },
    {
      id: 'scopa',
      name: 'Scopa',
      icon: <ScopaIcon />,
      humanCount: humanScore.scopas || '-',
      cpuCount: cpuScore.scopas || '-',
      humanWon: humanScore.scopas > cpuScore.scopas,
      cpuWon: cpuScore.scopas > humanScore.scopas,
    },
  ];

  return (
    <div className={styles.overlay}>
      {/* Human cards on the left */}
      <div className={styles.cardColumn}>
        <div className={styles.cardColumnLabel}>{player1Name}'s Cards</div>
        <div className={styles.cardGrid}>
          {humanCaptured.map(card => (
            <div
              key={card.id}
              className={`${styles.miniCard} ${isHighlighted(card, true) ? styles.highlighted : ''} ${hoveredCategory && !isHighlighted(card, true) ? styles.dimmed : ''}`}
            >
              <CardImage card={card} />
            </div>
          ))}
        </div>
      </div>

      {/* Score modal in center */}
      <div className={styles.modal}>
        <h2 className={styles.title}>Round {roundNumber} Complete</h2>

        <table className={styles.scoreTable}>
          <thead>
            <tr>
              <th>Category</th>
              <th>{player1Name}</th>
              <th>{player2Name}</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => (
              <tr
                key={cat.name}
                className={`${styles.categoryRow} ${hoveredCategory === cat.id ? styles.hoveredRow : ''}`}
                onMouseEnter={() => setHoveredCategory(cat.id)}
                onMouseLeave={() => setHoveredCategory(null)}
              >
                <td className={styles.categoryCell}>
                  <span className={styles.categoryIcon}>
                    {cat.icon}
                  </span>
                  <span className={styles.categoryName}>{cat.name}</span>
                </td>
                <td className={cat.humanWon ? styles.winner : ''}>
                  {cat.humanCount}
                </td>
                <td className={cat.cpuWon ? styles.winner : ''}>
                  {cat.cpuCount}
                </td>
              </tr>
            ))}
            <tr className={styles.totalRow}>
              <td>Round Total</td>
              <td className={humanScore.total > cpuScore.total ? styles.winner : ''}>
                +{humanScore.total}
              </td>
              <td className={cpuScore.total > humanScore.total ? styles.winner : ''}>
                +{cpuScore.total}
              </td>
            </tr>
          </tbody>
        </table>

        <div className={styles.cumulativeScores}>
          <div className={styles.scoreBox}>
            <span className={styles.scoreLabel}>{player1Name}</span>
            <span className={styles.scoreValue}>{cumulativeHuman}</span>
          </div>
          <span className={styles.scoreDivider}>-</span>
          <div className={styles.scoreBox}>
            <span className={styles.scoreLabel}>{player2Name}</span>
            <span className={styles.scoreValue}>{cumulativeCpu}</span>
          </div>
        </div>

        <button
          className={styles.nextButton}
          onClick={isGameOver ? onShowGameEnd : onNextRound}
        >
          {isGameOver ? 'See Results' : 'Next Round'}
        </button>
      </div>

      {/* CPU cards on the right */}
      <div className={styles.cardColumn}>
        <div className={styles.cardColumnLabel}>{player2Name}'s Cards</div>
        <div className={styles.cardGrid}>
          {cpuCaptured.map(card => (
            <div
              key={card.id}
              className={`${styles.miniCard} ${isHighlighted(card, false) ? styles.highlighted : ''} ${hoveredCategory && !isHighlighted(card, false) ? styles.dimmed : ''}`}
            >
              <CardImage card={card} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
