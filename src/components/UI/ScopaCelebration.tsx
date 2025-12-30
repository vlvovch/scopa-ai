// Step 9.4: Scopa Celebration Animation

import { motion, AnimatePresence } from 'framer-motion';
import styles from './ScopaCelebration.module.css';

interface ScopaCelebrationProps {
  show: boolean;
  player: 'human' | 'cpu';
  onComplete?: () => void;
  /** Optional custom player name (for spectator mode) */
  playerName?: string;
}

export function ScopaCelebration({ show, player, onComplete, playerName }: ScopaCelebrationProps) {
  const displayName = playerName ?? (player === 'human' ? 'You' : 'CPU');
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className={styles.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          onAnimationComplete={(definition) => {
            // Call onComplete after exit animation
            if (definition === 'exit' && onComplete) {
              onComplete();
            }
          }}
        >
          <motion.div
            className={styles.celebration}
            initial={{ scale: 0, rotate: -10 }}
            animate={{
              scale: [0, 1.2, 1],
              rotate: [-10, 5, 0],
            }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{
              duration: 0.5,
              times: [0, 0.6, 1],
              ease: 'easeOut',
            }}
          >
            <motion.span
              className={styles.text}
              animate={{
                textShadow: [
                  '0 0 20px rgba(212, 175, 55, 0.5)',
                  '0 0 40px rgba(212, 175, 55, 0.8)',
                  '0 0 20px rgba(212, 175, 55, 0.5)',
                ],
              }}
              transition={{
                duration: 0.8,
                repeat: 2,
                repeatType: 'reverse',
              }}
            >
              SCOPA!
            </motion.span>
            <span className={styles.player}>
              {displayName} swept the table!
            </span>
          </motion.div>

          {/* Sparkle particles */}
          {[...Array(12)].map((_, i) => (
            <motion.div
              key={i}
              className={styles.sparkle}
              initial={{
                x: 0,
                y: 0,
                scale: 0,
                opacity: 1,
              }}
              animate={{
                x: Math.cos((i / 12) * Math.PI * 2) * 150,
                y: Math.sin((i / 12) * Math.PI * 2) * 150,
                scale: [0, 1, 0],
                opacity: [1, 1, 0],
              }}
              transition={{
                duration: 1,
                delay: 0.2,
                ease: 'easeOut',
              }}
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
