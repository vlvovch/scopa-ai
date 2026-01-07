// Spectator Card Animation Component
// Shows a player's card being played with reveal and movement animations
// Animation sequence: flip card in place first, then move to table, then to capture pile
// Works for both CPU and human players in spectator mode

import { motion, AnimatePresence } from 'framer-motion';
import type { Card as CardType, PlayerId } from '../../game/types';
import { CardImage, CardBack } from '../Card/CardImage';
import styles from './CpuCardAnimation.module.css';

interface CpuCardAnimationProps {
  card: CardType | null;
  phase: 'reveal' | 'moving' | 'capturing' | 'done' | null;
  capturedCardIds: string[];
  /** Which player is playing - determines animation direction */
  player?: PlayerId;
}

export function CpuCardAnimation({ card, phase, capturedCardIds, player = 'cpu' }: CpuCardAnimationProps) {
  if (!card || !phase || phase === 'done') {
    return null;
  }

  // Check for landscape orientation
  const isLandscape = typeof window !== 'undefined' && window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches;

  // Position offsets based on player and orientation
  const isHumanPlayer = player === 'human';

  // Landscape adjustments (smaller vertical distance)
  const startY = isHumanPlayer
    ? (isLandscape ? 80 : 120)
    : (isLandscape ? -80 : -120);

  const tableY = 0;  // Center of table

  const captureY = isHumanPlayer
    ? (isLandscape ? 50 : 80)
    : (isLandscape ? -50 : -80);

  // X-axis movement for capture piles in landscape
  // Human pile: Bottom-Left (move left)
  // CPU pile: Top-Right (move right)
  const captureX = phase === 'capturing' && isLandscape
    ? (isHumanPlayer ? -150 : 150)
    : 0;


  return (
    <AnimatePresence>
      <div className={styles.overlay}>
        <motion.div
          className={styles.cardContainer}
          initial={{ y: startY, x: 0 }}
          animate={
            phase === 'reveal'
              ? { y: startY, x: 0 }  // Stay in place during flip
              : phase === 'moving'
                ? { y: tableY, x: 0 }  // Move to table center
                : { y: captureY, x: captureX, opacity: 0, scale: 0.8 }  // Move toward capture pile
          }
          transition={{
            type: 'spring',
            stiffness: 180,
            damping: 20,
          }}
        >
          {/* 3D flip container */}
          <motion.div
            className={styles.flipContainer}
            initial={{ rotateY: 0 }}
            animate={{ rotateY: phase === 'reveal' ? 0 : 180 }}
            transition={{
              duration: 0.5,
              ease: [0.4, 0, 0.2, 1],
            }}
          >
            {/* Card back (visible initially) */}
            <div className={styles.cardFace}>
              <CardBack />
            </div>
            {/* Card front (revealed after flip) */}
            <div className={`${styles.cardFace} ${styles.cardFront}`}>
              <CardImage card={card} />
            </div>
          </motion.div>
        </motion.div>

        {/* Show captured card indicators - positioned on capturing player's side */}
        {phase === 'capturing' && capturedCardIds.length > 0 && (
          <motion.div
            className={`${styles.captureIndicator} ${isHumanPlayer ? styles.captureBottom : styles.captureTop}`}
            initial={{ opacity: 0, scale: 0.5, y: isHumanPlayer ? 20 : -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            +{capturedCardIds.length} captured
          </motion.div>
        )}
      </div>
    </AnimatePresence>
  );
}
