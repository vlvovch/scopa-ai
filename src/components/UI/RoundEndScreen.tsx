// Step 8.4: RoundEndScreen Component with card display and hover highlighting

import { useState, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { Card, RoundScore } from '../../game/types';
import type { GeminiTokenStats, ExtendedAIType } from '../../ai';
import { PRIME_VALUES, SUITS } from '../../game/constants';
import { CardImage } from '../Card/CardImage';
import { TokenStatsDisplay } from './TokenStatsDisplay';
import { AIPlayerLabel } from './AIPlayerLabel';
import { useDeck } from '../../contexts/DeckContext';
import type { DeckType } from '../../hooks/useSettings';
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

function CoinIcon({ deckType }: { deckType: DeckType }) {
  // Uses authentic denari SVG from Wikimedia Commons based on deck type
  const coinPath = `./cards/${deckType}/suits/coins.svg`;
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" className={styles.categoryIconSvg}>
      <image href={coinPath} x="2" y="2" width="20" height="20" />
    </svg>
  );
}

function SetteBelloIcon({ deckType }: { deckType: DeckType }) {
  // 7 of Coins card with authentic coins in 2-1-2-2 pattern based on deck type
  const coinSize = 4.5;
  const coinPath = `./cards/${deckType}/suits/coins.svg`;
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" className={styles.categoryIconSvg}>
      {/* Card background */}
      <rect x="3" y="1" width="18" height="22" rx="2" fill="#f5f5dc" stroke="#333" strokeWidth="1"/>
      {/* Row 1 - 2 coins */}
      <image href={coinPath} x={9 - coinSize/2} y={4.5 - coinSize/2} width={coinSize} height={coinSize} />
      <image href={coinPath} x={15 - coinSize/2} y={4.5 - coinSize/2} width={coinSize} height={coinSize} />
      {/* Row 2 - 1 coin */}
      <image href={coinPath} x={12 - coinSize/2} y={9 - coinSize/2} width={coinSize} height={coinSize} />
      {/* Row 3 - 2 coins */}
      <image href={coinPath} x={9 - coinSize/2} y={14 - coinSize/2} width={coinSize} height={coinSize} />
      <image href={coinPath} x={15 - coinSize/2} y={14 - coinSize/2} width={coinSize} height={coinSize} />
      {/* Row 4 - 2 coins */}
      <image href={coinPath} x={9 - coinSize/2} y={19 - coinSize/2} width={coinSize} height={coinSize} />
      <image href={coinPath} x={15 - coinSize/2} y={19 - coinSize/2} width={coinSize} height={coinSize} />
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
  /** Player 1 name (defaults to "You", fallback if AI type not provided) */
  player1Name?: string;
  /** Player 2 name (defaults to "CPU", fallback if AI type not provided) */
  player2Name?: string;
  /** Token stats for player 1 (if using LLM) */
  player1TokenStats?: GeminiTokenStats | null;
  /** Token stats for player 2 (if using LLM) */
  player2TokenStats?: GeminiTokenStats | null;
  /** Player 1 AI type (for rendering proper icon) */
  player1AIType?: ExtendedAIType;
  /** Player 1 model (for LLM AIs) */
  player1Model?: string;
  /** Player 2 AI type (for rendering proper icon) */
  player2AIType?: ExtendedAIType;
  /** Player 2 model (for LLM AIs) */
  player2Model?: string;
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
  player1TokenStats,
  player2TokenStats,
  player1AIType,
  player1Model,
  player2AIType,
  player2Model,
}: RoundEndScreenProps) {
  const [hoveredCategory, setHoveredCategory] = useState<HoverCategory>(null);
  const deckType = useDeck();

  // Render player names with proper AI icons
  const renderPlayer1Name = (): ReactNode => {
    if (player1AIType) {
      return <AIPlayerLabel aiType={player1AIType} model={player1Model} />;
    }
    return player1Name;
  };

  const renderPlayer2Name = (): ReactNode => {
    if (player2AIType) {
      return <AIPlayerLabel aiType={player2AIType} model={player2Model} />;
    }
    return player2Name;
  };

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
      icon: <CoinIcon deckType={deckType} />,
      humanCount: humanScore.counts.coins,
      cpuCount: cpuScore.counts.coins,
      humanWon: humanScore.coins > 0,
      cpuWon: cpuScore.coins > 0,
    },
    {
      id: 'settebello',
      name: 'Sette Bello',
      icon: <SetteBelloIcon deckType={deckType} />,
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
        <div className={styles.cardColumnLabel} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>{renderPlayer1Name()}'s Cards</span>
          {player1TokenStats && <TokenStatsDisplay stats={player1TokenStats} show={!!player1TokenStats} mode="round" position="bottom" modelName={player1Model} />}
        </div>
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
              <th>{renderPlayer1Name()}</th>
              <th>{renderPlayer2Name()}</th>
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
            <span className={styles.scoreLabel}>{renderPlayer1Name()}</span>
            <span className={styles.scoreValue}>{cumulativeHuman}</span>
          </div>
          <span className={styles.scoreDivider}>-</span>
          <div className={styles.scoreBox}>
            <span className={styles.scoreLabel}>{renderPlayer2Name()}</span>
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
        <div className={styles.cardColumnLabel} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>{renderPlayer2Name()}'s Cards</span>
          {player2TokenStats && <TokenStatsDisplay stats={player2TokenStats} show={!!player2TokenStats} mode="round" position="bottom" modelName={player2Model} />}
        </div>
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
