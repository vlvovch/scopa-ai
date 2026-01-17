// ReasoningBubble Component
// Shows AI reasoning in a comic-style speech bubble

import { motion, AnimatePresence } from 'framer-motion';
import styles from './ReasoningBubble.module.css';
import type { PlayerId } from '../../game/types';

interface ReasoningBubbleProps {
  /** The reasoning text to display */
  reasoning: string | null;
  /** Which player's reasoning this is */
  player: PlayerId;
  /** Whether to show the bubble */
  show: boolean;
}

export function ReasoningBubble({ reasoning, player, show }: ReasoningBubbleProps) {
  const isTop = player === 'cpu';

  return (
    <div className={styles.wrapper}>
      <AnimatePresence>
        {show && reasoning && (
          <motion.div
            className={`${styles.bubble} ${isTop ? styles.top : styles.bottom}`}
            initial={{ opacity: 0, scale: 0.8, y: isTop ? 10 : -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: isTop ? 10 : -10 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <div className={styles.content}>
              {reasoning}
            </div>
            <div className={`${styles.tail} ${isTop ? styles.tailTop : styles.tailBottom}`} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
