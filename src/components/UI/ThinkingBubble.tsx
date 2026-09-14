// ThinkingBubble Component
// Small thought bubble icon that opens a modal with AI reasoning

import { motion, AnimatePresence } from 'framer-motion';
import { useT } from '../../i18n/LanguageContext';
import styles from './ThinkingBubble.module.css';

interface ThinkingBubbleProps {
  /** Whether to show the bubble */
  show: boolean;
  /** Whether reasoning is available */
  hasReasoning: boolean;
  /** Click handler to lock modal open and pause */
  onClick: () => void;
  /** Hover start handler to preview modal */
  onHoverStart?: () => void;
  /** Hover end handler to close preview */
  onHoverEnd?: () => void;
  /** Position relative to token stats - 'top' for CPU, 'bottom' for human */
  position?: 'top' | 'bottom';
  /** Horizontal anchoring: centred on the token badge, or flush to the
   *  start / end of a zero-width anchor when there is no badge. */
  align?: 'center' | 'start' | 'end';
  /** The model did not deliver this move and a simple bot played instead:
   *  the bubble turns amber with a badge, and its label says why. */
  fallback?: boolean;
}

export function ThinkingBubble({ show, hasReasoning, onClick, onHoverStart, onHoverEnd, position = 'top', align = 'center', fallback = false }: ThinkingBubbleProps) {
  const t = useT();
  if (!show || !hasReasoning) return null;

  const isBottom = position === 'bottom';

  return (
    <AnimatePresence>
      <motion.button
        className={`${styles.bubble} ${isBottom ? styles.bubbleBottom : ''} ${align === 'start' ? styles.alignStart : align === 'end' ? styles.alignEnd : ''} ${fallback ? styles.fallback : ''}`}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.5 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        onClick={onClick}
        onMouseEnter={onHoverStart}
        onMouseLeave={onHoverEnd}
        aria-label={fallback ? t.table.fallbackMove : t.table.showReasoning}
        title={fallback ? t.table.fallbackMove : undefined}
        data-fallback={fallback ? 'true' : undefined}
      >
        <svg
          className={styles.icon}
          viewBox="0 0 100 100"
          fill="currentColor"
        >
          {/* Thought bubble - cloud shape with trailing circles */}
          <ellipse cx="50" cy="40" rx="35" ry="28" />
          <ellipse cx="25" cy="45" rx="15" ry="12" />
          <ellipse cx="75" cy="45" rx="15" ry="12" />
          <ellipse cx="35" cy="25" rx="12" ry="10" />
          <ellipse cx="65" cy="25" rx="12" ry="10" />
          <ellipse cx="50" cy="20" rx="10" ry="8" />
          {/* Trailing circles */}
          <circle cx="25" cy="75" r="8" />
          <circle cx="18" cy="88" r="5" />
        </svg>
        {fallback && <span className={styles.mark} aria-hidden="true">!</span>}
      </motion.button>
    </AnimatePresence>
  );
}
