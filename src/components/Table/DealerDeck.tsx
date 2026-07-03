// DealerDeck Component - Shows the remaining deck of cards

import { CardBack } from '../Card/CardImage';
import { useT } from '../../i18n/LanguageContext';
import styles from './DealerDeck.module.css';

interface DealerDeckProps {
  /** Number of cards remaining in the deck */
  cardsRemaining: number;
}

export function DealerDeck({ cardsRemaining }: DealerDeckProps) {
  const t = useT();
  if (cardsRemaining === 0) {
    return (
      <div className={styles.deckContainer}>
        <div className={styles.emptyDeck}>
          <span className={styles.emptyLabel}>{t.table.deckEmpty}</span>
        </div>
      </div>
    );
  }

  // Calculate visual stack depth (max 5 layers for visual effect)
  const stackLayers = Math.min(5, Math.ceil(cardsRemaining / 8));

  return (
    <div className={styles.deckContainer}>
      <span className={styles.dealerBadge} title={t.table.dealer}>D</span>
      <div className={styles.deckStack}>
        {/* Render stack layers for 3D effect */}
        {Array.from({ length: stackLayers }).map((_, i) => (
          <div
            key={i}
            className={styles.stackLayer}
            style={{
              transform: `translate(${i * -1}px, ${i * -1}px)`,
              zIndex: stackLayers - i,
            }}
          >
            <CardBack />
          </div>
        ))}
      </div>
      <span className={styles.cardCount}>{cardsRemaining}</span>
    </div>
  );
}
