// Step 8.4: RoundEndScreen Component with card display and hover highlighting

import { useState, useMemo } from 'react';
import type { Card, RoundScore } from '../../game/types';
import { PRIME_VALUES, SUITS } from '../../game/constants';
import { CardImage } from '../Card/CardImage';
import styles from './RoundEndScreen.module.css';

type HoverCategory = 'carte' | 'denari' | 'settebello' | 'primiera' | 'scopa' | null;

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
    icon: string;
    iconColor?: string;
    iconClass?: string;
    humanCount: string | number;
    cpuCount: string | number;
    humanWon: boolean;
    cpuWon: boolean;
  }> = [
    {
      id: 'carte',
      name: 'Carte Lungo',
      icon: '🂠',
      humanCount: humanScore.counts.cards,
      cpuCount: cpuScore.counts.cards,
      humanWon: humanScore.cards > 0,
      cpuWon: cpuScore.cards > 0,
    },
    {
      id: 'denari',
      name: 'Denari',
      icon: '●',
      iconColor: '#DAA520',
      humanCount: humanScore.counts.coins,
      cpuCount: cpuScore.counts.coins,
      humanWon: humanScore.coins > 0,
      cpuWon: cpuScore.coins > 0,
    },
    {
      id: 'settebello',
      name: 'Sette Bello',
      icon: '7',
      iconColor: '#DAA520',
      iconClass: 'setteBelloIcon',
      humanCount: humanScore.setteBello > 0 ? '✓' : '-',
      cpuCount: cpuScore.setteBello > 0 ? '✓' : '-',
      humanWon: humanScore.setteBello > 0,
      cpuWon: cpuScore.setteBello > 0,
    },
    {
      id: 'primiera',
      name: 'Primiera',
      icon: '★',
      iconColor: '#DAA520',
      humanCount: formatPrime(humanScore.counts.prime),
      cpuCount: formatPrime(cpuScore.counts.prime),
      humanWon: humanScore.prime > 0,
      cpuWon: cpuScore.prime > 0,
    },
    {
      id: 'scopa',
      name: 'Scopa',
      icon: '🧹',
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
                <td>
                  <span
                    className={`${styles.categoryIcon} ${cat.iconClass ? styles[cat.iconClass] : ''}`}
                    style={cat.iconColor ? { color: cat.iconColor } : undefined}
                  >
                    {cat.icon}
                  </span>
                  {cat.name}
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
