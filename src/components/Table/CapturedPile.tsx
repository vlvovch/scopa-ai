// Step 7.6: CapturedPile Component with enhanced stats

import { useMemo } from 'react';
import type { ReactNode } from 'react';
import type { Card as CardType, PlayerId } from '../../game/types';
import type { ExtendedAIType } from '../../ai';
import { CardBack } from '../Card/CardImage';
import { AIPlayerLabel } from '../UI/AIPlayerLabel';
import { useDeck } from '../../contexts/DeckContext';
import styles from './CapturedPile.module.css';

// Denari (Coins) icon using authentic SVG from deck
function DenariIcon({ size = 14 }: { size?: number }) {
  const deckType = useDeck();
  const coinPath = `./cards/${deckType}/suits/coins.svg`;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ verticalAlign: 'middle' }}>
      <image href={coinPath} x="2" y="2" width="20" height="20" />
    </svg>
  );
}

// Sette Bello indicator with "7" and coin icon
function SetteBelloIndicator() {
  const deckType = useDeck();
  const coinPath = `./cards/${deckType}/suits/coins.svg`;
  return (
    <span className={styles.setteBelloContent}>
      <span>7</span>
      <svg viewBox="0 0 24 24" width={12} height={12} style={{ verticalAlign: 'middle', marginLeft: '1px' }}>
        <image href={coinPath} x="2" y="2" width="20" height="20" />
      </svg>
    </span>
  );
}

interface CapturedPileProps {
  /** Cards in the captured pile */
  cards: CardType[];
  /** Number of scopas scored this round */
  scopaCount: number;
  /** Which player's pile this is */
  player: PlayerId;
  /** Optional custom label (for spectator mode, fallback if aiType not provided) */
  playerLabel?: string;
  /** AI type for this player (for rendering proper icon) */
  aiType?: ExtendedAIType;
  /** Model ID for LLM AIs */
  aiModel?: string;
  /** Optional click handler (for viewing captured cards) */
  onClick?: () => void;
  /** Override card count for multiplayer (when actual cards aren't available) */
  capturedCount?: number;
  /** Override coins count for multiplayer */
  coinsCount?: number;
  /** Override hasSetteBello for multiplayer */
  hasSetteBello?: boolean;
  /** Whether to show stats (coins, sette bello, scopas) - defaults to true */
  showStats?: boolean;
}

export function CapturedPile({
  cards,
  scopaCount,
  player,
  playerLabel,
  aiType,
  aiModel,
  onClick,
  capturedCount,
  coinsCount: coinsCountOverride,
  hasSetteBello: hasSetteBelloOverride,
  showStats = true,
}: CapturedPileProps) {
  // Use capturedCount if provided (multiplayer mode), otherwise use cards.length
  const cardCount = capturedCount ?? cards.length;

  // Calculate visual stack depth based on card count (max 6 layers)
  // More cards = thicker stack appearance
  const stackLayers = Math.min(6, Math.max(1, Math.ceil(cardCount / 4)));
  const isClickable = !!onClick && cardCount > 0;

  // Calculate stats (use overrides for multiplayer mode, otherwise calculate from cards)
  const stats = useMemo(() => {
    const denariCount = coinsCountOverride ?? cards.filter(c => c.suit === 'coins').length;
    const hasSetteBello = hasSetteBelloOverride ?? cards.some(c => c.suit === 'coins' && c.value === 7);
    return { denariCount, hasSetteBello };
  }, [cards, coinsCountOverride, hasSetteBelloOverride]);

  // Render player label with proper AI icon if available
  const renderLabel = (): ReactNode => {
    if (aiType) {
      return <AIPlayerLabel aiType={aiType} model={aiModel} />;
    }
    return playerLabel ?? (player === 'human' ? 'You' : 'CPU');
  };

  return (
    <div
      className={`${styles.pile} ${isClickable ? styles.clickable : ''}`}
      onClick={isClickable ? onClick : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.(); } : undefined}
    >
      <span className={styles.playerLabel}>{renderLabel()}</span>

      <div className={styles.pileStack}>
        {cardCount === 0 ? (
          <div className={styles.emptyPile}>
            <span>Empty</span>
          </div>
        ) : (
          /* Render stack layers for 3D depth effect based on card count */
          Array.from({ length: stackLayers }).map((_, i) => (
            <div
              key={i}
              className={styles.stackedCard}
              style={{
                transform: `translate(${i * 1}px, ${i * 1}px)`,
                zIndex: stackLayers - i,
              }}
            >
              <CardBack />
            </div>
          ))
        )}
      </div>

      <div className={styles.pileInfo}>
        <span className={styles.cardCount}>{cardCount} cards</span>

        {showStats && (
          <div className={styles.statsRow}>
            {/* Denari (coins) count */}
            <div className={styles.stat} title="Denari (Coins)">
              <DenariIcon />
              <span>{stats.denariCount}</span>
            </div>

            {/* Scopa count */}
            {scopaCount > 0 && (
              <div className={styles.stat} title={`${scopaCount} Scopa${scopaCount > 1 ? 's' : ''}`}>
                <span className={styles.scopaIcon}>🧹</span>
                <span>{scopaCount}</span>
              </div>
            )}

            {/* Sette Bello indicator */}
            {stats.hasSetteBello && (
              <div className={styles.setteBello} title="Sette Bello (7 of Coins)">
                <SetteBelloIndicator />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
