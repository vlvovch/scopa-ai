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
  const startX = deckPosition === 'left' ? -250 : 250;

  return (
    <AnimatePresence>
      <div className={styles.overlay}>
        {cards.map((card) => {
          // Target position: human hand at bottom, cpu hand at top
          const targetY = card.player === 'human' ? 250 : -250;
          // Spread cards horizontally based on card index
          const targetX = (card.cardIndex - 1) * 60;

          return (
            <motion.div
              key={card.id}
              className={styles.flyingCard}
              initial={{
                x: startX,
                y: 0,
                scale: 0.9,
                opacity: 1,
              }}
              animate={{
                x: targetX,
                y: targetY,
                scale: 1,
                opacity: [1, 1, 1, 0],
              }}
              transition={{
                duration: 0.5,
                delay: card.id * 0.12, // Stagger each card
                ease: [0.2, 0.8, 0.4, 1], // Custom ease for arc-like motion
                opacity: {
                  times: [0, 0.6, 0.9, 1],
                  duration: 0.5,
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
