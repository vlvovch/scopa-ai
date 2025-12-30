// DealingAnimation Component
// Shows cards flying from deck to player hands during dealing

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
}

// Animation timing constants
const CARD_DURATION = 0.65; // Duration for each card to fly (seconds)
const CARD_STAGGER = 0.2;   // Delay between each card (seconds)
// Total duration in ms: last card starts at 5*200ms, flies for 650ms, plus 200ms buffer
export const DEALING_ANIMATION_DURATION = (CARD_DURATION * 1000) + (5 * CARD_STAGGER * 1000) + 200; // ~1850ms

export function DealingAnimation({ isDealing, startPlayer, deckPosition }: DealingAnimationProps) {
  if (!isDealing) return null;

  // Create 6 cards (3 per player), alternating between players
  const cards = Array.from({ length: 6 }, (_, i) => {
    const isFirstPlayer = i % 2 === 0;
    const player = isFirstPlayer
      ? startPlayer
      : (startPlayer === 'human' ? 'cpu' : 'human');
    const cardIndex = Math.floor(i / 2); // 0, 0, 1, 1, 2, 2
    return { id: i, player, cardIndex };
  });

  // Calculate start position based on deck position
  const startX = deckPosition === 'left' ? -280 : 280;

  return (
    <AnimatePresence>
      <div className={styles.overlay}>
        {cards.map((card) => {
          // Target position: human hand at bottom, cpu hand at top
          const targetY = card.player === 'human' ? 280 : -280;
          // Spread cards horizontally based on card index
          const targetX = (card.cardIndex - 1) * 70;

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
                delay: card.id * CARD_STAGGER,
                ease: [0.25, 0.1, 0.25, 1], // Smooth ease-out curve
                opacity: {
                  times: [0, 0.5, 0.85, 1],
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
