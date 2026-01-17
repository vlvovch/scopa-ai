// ReasoningBubble Component
// Shows AI reasoning in a comic-style speech bubble positioned to the side

import { useState, useEffect, useCallback } from 'react';
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
  /** Callback when expanded state changes (for pausing game on mobile) */
  onExpandedChange?: (expanded: boolean) => void;
}

export function ReasoningBubble({ reasoning, player, show, onExpandedChange }: ReasoningBubbleProps) {
  const [expanded, setExpanded] = useState(false);
  const isBottom = player === 'human';

  // Check if we're on a small screen where expand/collapse is needed
  const isSmallScreen = useCallback(() => {
    return typeof window !== 'undefined' && window.innerWidth <= 768;
  }, []);

  // Reset expanded state when reasoning changes or bubble hides
  useEffect(() => {
    if (!show || !reasoning) {
      setExpanded(false);
      // Also notify parent when bubble hides (to unpause if needed)
      if (expanded) {
        onExpandedChange?.(false);
      }
    }
  }, [show, reasoning, expanded, onExpandedChange]);

  // Toggle expanded state on click (only on mobile/tablet)
  const handleClick = useCallback(() => {
    if (!isSmallScreen()) return; // Don't do anything on desktop

    const newExpanded = !expanded;
    setExpanded(newExpanded);
    onExpandedChange?.(newExpanded);
  }, [expanded, isSmallScreen, onExpandedChange]);

  return (
    <AnimatePresence>
      {show && reasoning && (
        <motion.div
          className={`${styles.bubble} ${isBottom ? styles.bottom : ''} ${expanded ? styles.expanded : ''}`}
          initial={{ opacity: 0, scale: 0.8, y: isBottom ? 10 : -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: isBottom ? 10 : -10 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          onClick={handleClick}
        >
          <div className={styles.content}>
            {reasoning}
          </div>
          {/* Collapsed indicator for small screens */}
          <div className={styles.collapsedIndicator}>💭</div>
          <div className={isBottom ? styles.tailBottom : styles.tail} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
