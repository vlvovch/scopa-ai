// Step 7.6: CapturedPile Component with enhanced stats

import { useMemo } from 'react';
import type { Card as CardType, PlayerId } from '../../game/types';
import { Card } from '../Card/Card';
import styles from './CapturedPile.module.css';

interface CapturedPileProps {
  /** Cards in the captured pile */
  cards: CardType[];
  /** Number of scopas scored this round */
  scopaCount: number;
  /** Which player's pile this is */
  player: PlayerId;
  /** Optional custom label (for spectator mode) */
  playerLabel?: string;
}

export function CapturedPile({ cards, scopaCount, player, playerLabel }: CapturedPileProps) {
  // Show top 3 cards of the pile for visual stacking effect
  const visibleCards = cards.slice(-3);

  // Calculate stats
  const stats = useMemo(() => {
    const denariCount = cards.filter(c => c.suit === 'coins').length;
    const hasSetteBello = cards.some(c => c.suit === 'coins' && c.value === 7);
    return { denariCount, hasSetteBello };
  }, [cards]);

  // Default labels, use custom label if provided
  const displayLabel = playerLabel ?? (player === 'human' ? 'You' : 'CPU');

  return (
    <div className={styles.pile}>
      <span className={styles.playerLabel}>{displayLabel}</span>

      <div className={styles.pileStack}>
        {cards.length === 0 ? (
          <div className={styles.emptyPile}>
            <span>Empty</span>
          </div>
        ) : (
          visibleCards.map((card, index) => (
            <div
              key={card.id}
              className={styles.stackedCard}
              style={{ zIndex: index }}
            >
              <Card card={card} disabled />
            </div>
          ))
        )}
      </div>

      <div className={styles.pileInfo}>
        <span className={styles.cardCount}>{cards.length} cards</span>

        <div className={styles.statsRow}>
          {/* Denari (coins) count */}
          <div className={styles.stat} title="Denari (Coins)">
            <span className={styles.coinIcon}>●</span>
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
              7●
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
