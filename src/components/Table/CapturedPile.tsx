// Step 7.6: CapturedPile Component

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
}

export function CapturedPile({ cards, scopaCount, player }: CapturedPileProps) {
  // Show top 3 cards of the pile for visual stacking effect
  const visibleCards = cards.slice(-3);

  return (
    <div className={styles.pile}>
      <span className={styles.playerLabel}>
        {player === 'human' ? 'You' : 'CPU'}
      </span>

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

        {scopaCount > 0 && (
          <div className={styles.scopaMarkers}>
            {Array(scopaCount)
              .fill(null)
              .map((_, i) => (
                <div key={i} className={styles.scopaMarker} title="Scopa!" />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
