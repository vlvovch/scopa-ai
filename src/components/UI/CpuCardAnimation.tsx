// CPU Card Animation Component
// Shows the CPU's card being played with reveal and movement animations
// Animation sequence: flip card in place first, then move to table

import { motion, AnimatePresence } from 'framer-motion';
import type { Card as CardType } from '../../game/types';
import { CardImage, CardBack } from '../Card/CardImage';
import styles from './CpuCardAnimation.module.css';

interface CpuCardAnimationProps {
  card: CardType | null;
  phase: 'reveal' | 'moving' | 'capturing' | 'done' | null;
  capturedCardIds: string[];
}

export function CpuCardAnimation({ card, phase, capturedCardIds }: CpuCardAnimationProps) {
  if (!card || !phase || phase === 'done') {
    return null;
  }

  return (
    <AnimatePresence>
      <div className={styles.overlay}>
        <motion.div
          className={styles.cardContainer}
          initial={{ y: -80 }}
          animate={
            phase === 'reveal'
              ? { y: -80 }  // Stay in place during flip
              : phase === 'moving'
              ? { y: 60 }   // Move down to table
              : { y: 60, opacity: 0, scale: 0.8 }
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

        {/* Show captured card indicators */}
        {phase === 'capturing' && capturedCardIds.length > 0 && (
          <motion.div
            className={styles.captureIndicator}
            initial={{ opacity: 0, scale: 0.5, y: 20 }}
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
