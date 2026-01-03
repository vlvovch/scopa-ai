// DealingAnimation Component
// Shows cards flying from deck to player hands and table during dealing

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CardBack } from '../Card/CardImage';
import styles from './DealingAnimation.module.css';

/** What to deal in this animation */
export type DealMode = 'table' | 'pause' | 'hands';

/** Duration of pause between table and hands phases */
export const DEALING_PAUSE_DURATION = 300;

interface DealingAnimationProps {
  /** Whether dealing animation is active */
  isDealing: boolean;
  /** Which player's hand to deal to first ('human' = bottom, 'cpu' = top) */
  startPlayer: 'human' | 'cpu';
  /** Position of the deck ('left' or 'right') */
  deckPosition: 'left' | 'right';
  /** What to deal: 'table' for 4 table cards, 'pause' for stagger, 'hands' for 6 hand cards */
  dealMode: DealMode;
  /** Called when all cards have finished animating */
  onComplete?: () => void;
  /** Skip animation and complete immediately (for instant mode) */
  instant?: boolean;
}

// Animation timing constants - optimized for snappy feel with crossfade
const CARD_DURATION = 0.35; // Duration for each card to fly (seconds)
const CARD_STAGGER = 0.08;   // Delay between each card (seconds)
// Trigger completion at 50% through last card - real cards appear with crossfade
// Table only (4 cards): last card starts at 3*80ms = 240ms, callback at 240 + 350*0.5 = 415ms
// Hands only (6 cards): last card starts at 5*80ms = 400ms, callback at 400 + 350*0.5 = 575ms
export const DEALING_TABLE_DURATION = Math.round((3 * CARD_STAGGER * 1000) + (CARD_DURATION * 1000 * 0.5)); // ~415ms
export const DEALING_HANDS_DURATION = Math.round((5 * CARD_STAGGER * 1000) + (CARD_DURATION * 1000 * 0.5)); // ~575ms

export function DealingAnimation({ isDealing, startPlayer, deckPosition, dealMode, onComplete, instant = false }: DealingAnimationProps) {
  // Simple timeout-based completion - most reliable approach
  useEffect(() => {
    if (!isDealing || !onComplete) return;

    // Instant mode: complete immediately
    if (instant) {
      const timeoutId = setTimeout(onComplete, 10);
      return () => clearTimeout(timeoutId);
    }

    // Get duration based on mode
    let duration: number;
    if (dealMode === 'table') {
      duration = DEALING_TABLE_DURATION;
    } else if (dealMode === 'pause') {
      duration = DEALING_PAUSE_DURATION;
    } else {
      duration = DEALING_HANDS_DURATION;
    }
    const timeoutId = setTimeout(onComplete, duration);

    return () => clearTimeout(timeoutId);
  }, [isDealing, dealMode, onComplete, instant]);

  // Early return after hooks - no animation during pause phase or instant mode
  if (!isDealing || dealMode === 'pause' || instant) {
    return null;
  }

  // Calculate start position based on deck position
  const startX = deckPosition === 'left' ? -280 : 280;

  // Create table cards (4 cards) - only for table mode
  const tableCards = dealMode === 'table'
    ? Array.from({ length: 4 }, (_, i) => ({
      id: `table-${i}`,
      target: 'table' as const,
      cardIndex: i,
      delay: i * CARD_STAGGER,
    }))
    : [];

  // Create hand cards (3 per player = 6 cards), alternating between players - only for hands mode
  const handCards = dealMode === 'hands'
    ? Array.from({ length: 6 }, (_, i) => {
      const isFirstPlayer = i % 2 === 0;
      const player = isFirstPlayer
        ? startPlayer
        : (startPlayer === 'human' ? 'cpu' : 'human');
      const cardIndex = Math.floor(i / 2); // 0, 0, 1, 1, 2, 2
      return {
        id: `hand-${i}`,
        target: player as 'human' | 'cpu',
        cardIndex,
        delay: i * CARD_STAGGER,
      };
    })
    : [];

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
