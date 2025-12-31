// DealingAnimation Component
// Shows cards flying from deck to player hands and table during dealing

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CardBack } from '../Card/CardImage';
import styles from './DealingAnimation.module.css';

interface DealingAnimationProps {
  /** Whether dealing animation is active */
  isDealing: boolean;
  /** Which player's hand to deal to first ('human' = bottom, 'cpu' = top) */
  startPlayer: 'human' | 'cpu';
  /** Position of the deck ('left' or 'right') */
  deckPosition: 'left' | 'right';
  /** Whether to include table cards (true for round start, false for mid-round deals) */
  includeTableCards?: boolean;
  /** Called when all cards have finished animating */
  onComplete?: () => void;
}

// Animation timing constants - optimized for snappy feel with crossfade
const CARD_DURATION = 0.35; // Duration for each card to fly (seconds)
const CARD_STAGGER = 0.08;   // Delay between each card (seconds)
// Trigger completion at 50% through last card - real cards appear with crossfade
// With table (10 cards): last card starts at 9*80ms = 720ms, callback at 720 + 350*0.5 = 895ms
// Without table (6 cards): last card starts at 5*80ms = 400ms, callback at 400 + 350*0.5 = 575ms
export const DEALING_ANIMATION_DURATION = Math.round((9 * CARD_STAGGER * 1000) + (CARD_DURATION * 1000 * 0.5)); // ~895ms
export const DEALING_HANDS_ONLY_DURATION = Math.round((5 * CARD_STAGGER * 1000) + (CARD_DURATION * 1000 * 0.5)); // ~575ms

export function DealingAnimation({ isDealing, startPlayer, deckPosition, includeTableCards = false, onComplete }: DealingAnimationProps) {
  // Simple timeout-based completion - most reliable approach
  useEffect(() => {
    if (!isDealing || !onComplete) return;

    const duration = includeTableCards ? DEALING_ANIMATION_DURATION : DEALING_HANDS_ONLY_DURATION;
    const timeoutId = setTimeout(onComplete, duration);

    return () => clearTimeout(timeoutId);
  }, [isDealing, includeTableCards, onComplete]);

  // Early return after hooks
  if (!isDealing) {
    return null;
  }

  // Calculate start position based on deck position
  const startX = deckPosition === 'left' ? -280 : 280;

  // Create table cards (4 cards) - only for round start
  const tableCards = includeTableCards
    ? Array.from({ length: 4 }, (_, i) => ({
      id: `table-${i}`,
      target: 'table' as const,
      cardIndex: i,
      delay: i * CARD_STAGGER,
    }))
    : [];

  // Create hand cards (3 per player = 6 cards), alternating between players
  const handCards = Array.from({ length: 6 }, (_, i) => {
    const isFirstPlayer = i % 2 === 0;
    const player = isFirstPlayer
      ? startPlayer
      : (startPlayer === 'human' ? 'cpu' : 'human');
    const cardIndex = Math.floor(i / 2); // 0, 0, 1, 1, 2, 2
    // Delay hand cards after table cards
    const baseDelay = includeTableCards ? tableCards.length * CARD_STAGGER : 0;
    return {
      id: `hand-${i}`,
      target: player as 'human' | 'cpu',
      cardIndex,
      delay: baseDelay + i * CARD_STAGGER,
    };
  });

  const allCards = [...tableCards, ...handCards];

  return (
    <AnimatePresence>
      <div className={styles.overlay}>
        {allCards.map((card) => {
          // Calculate target position based on destination
          let targetY: number;
          let targetX: number;

          if (card.target === 'table') {
            // Table cards: spread horizontally in center
            targetY = 0;
            targetX = (card.cardIndex - 1.5) * 80;
          } else {
            // Hand cards: human at bottom, cpu at top
            targetY = card.target === 'human' ? 280 : -280;
            targetX = (card.cardIndex - 1) * 70;
          }

          return (
            <motion.div
              key={card.id}
              className={styles.flyingCard}
              initial={{
                x: startX,
                y: 0,
                scale: 0.85,
                opacity: 1,
                rotate: deckPosition === 'left' ? -5 : 5,
              }}
              animate={{
                x: targetX,
                y: targetY,
                scale: 1,
                opacity: [1, 1, 1, 0],
                rotate: 0,
              }}
              transition={{
                duration: CARD_DURATION,
                delay: card.delay,
                ease: [0.25, 0.1, 0.25, 1],
                opacity: {
                  times: [0, 0.3, 0.5, 1], // Start fading at 50% for crossfade with real cards
                  duration: CARD_DURATION,
                }
              }}
            >
              <CardBack />
            </motion.div>
          );
        })}
      </div>
    </AnimatePresence>
  );
}
