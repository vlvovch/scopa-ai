// Sette Bello (7 of Coins) Celebration Animation

import { motion, AnimatePresence } from 'framer-motion';
import { useT } from '../../i18n/LanguageContext';
import styles from './SetteBelloCelebration.module.css';

interface SetteBelloCelebrationProps {
  show: boolean;
  player: 'human' | 'cpu';
  /** Optional custom player name (for spectator mode) */
  playerName?: string;
  /** Called when the celebration animation completes (including exit) */
  onComplete?: () => void;
}

export function SetteBelloCelebration({ show, player, playerName, onComplete }: SetteBelloCelebrationProps) {
  const t = useT();
  // null = the local player ("you"), rendered as a second-person message
  const nameForMessage = playerName ?? (player === 'human' ? null : 'CPU');
  return (
    <AnimatePresence onExitComplete={onComplete}>
      {show && (
        <motion.div
          className={styles.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            className={styles.celebration}
            initial={{ scale: 0, y: 20 }}
            animate={{
              scale: [0, 1.15, 1],
              y: [20, -10, 0],
            }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{
              duration: 0.5,
              times: [0, 0.6, 1],
              ease: 'easeOut',
            }}
          >
            {/* Coin icon */}
            <motion.div
              className={styles.coinIcon}
              animate={{
                rotateY: [0, 360],
                scale: [1, 1.1, 1],
              }}
              transition={{
                rotateY: { duration: 1, ease: 'easeInOut' },
                scale: { duration: 0.5, repeat: 2, repeatType: 'reverse' },
              }}
            >
              7
            </motion.div>
            <motion.span
              className={styles.text}
              animate={{
                textShadow: [
                  '0 0 20px rgba(218, 165, 32, 0.5)',
                  '0 0 40px rgba(218, 165, 32, 0.9)',
                  '0 0 20px rgba(218, 165, 32, 0.5)',
                ],
              }}
              transition={{
                duration: 0.6,
                repeat: 2,
                repeatType: 'reverse',
              }}
            >
              SETTE BELLO!
            </motion.span>
            <span className={styles.player}>
              {t.celebrate.capturedSetteBello(nameForMessage)}
            </span>
          </motion.div>

          {/* Gold coin particles */}
          {[...Array(8)].map((_, i) => (
            <motion.div
              key={i}
              className={styles.coin}
              initial={{
                x: 0,
                y: 0,
                scale: 0,
                opacity: 1,
              }}
              animate={{
                x: Math.cos((i / 8) * Math.PI * 2) * 120,
                y: Math.sin((i / 8) * Math.PI * 2) * 120,
                scale: [0, 1, 0.5],
                opacity: [1, 1, 0],
                rotate: [0, 180],
              }}
              transition={{
                duration: 0.9,
                delay: 0.15,
                ease: 'easeOut',
              }}
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
