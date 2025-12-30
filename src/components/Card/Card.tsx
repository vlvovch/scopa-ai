// Card Component with Neapolitan-style SVG graphics and animations

import { motion } from 'framer-motion';
import type { Card as CardType } from '../../game/types';
import { CardImage, CardBack } from './CardImage';
import styles from './Card.module.css';

interface CardProps {
  /** The card to display, or null for face-down */
  card: CardType | null;
  /** Whether to show the back of the card */
  faceDown?: boolean;
  /** Called when the card is clicked */
  onClick?: () => void;
  /** Called when the card is double-clicked */
  onDoubleClick?: () => void;
  /** Whether this card is selected */
  selected?: boolean;
  /** Whether this card is highlighted (valid target) */
  highlighted?: boolean;
  /** Whether interactions are disabled */
  disabled?: boolean;
  /** Animation delay for staggered dealing */
  animationDelay?: number;
  /** Layout ID for shared element transitions */
  layoutId?: string;
}

export function Card({
  card,
  faceDown = false,
  onClick,
  onDoubleClick,
  selected = false,
  highlighted = false,
  disabled = false,
  animationDelay = 0,
  layoutId,
}: CardProps) {
  const showBack = faceDown || card === null;

  const cardClasses = [
    styles.card,
    selected && styles.selected,
    highlighted && styles.highlighted,
    disabled && styles.disabled,
  ]
    .filter(Boolean)
    .join(' ');

  const handleClick = () => {
    if (!disabled && onClick) {
      onClick();
    }
  };

  const handleDoubleClick = () => {
    if (!disabled && onDoubleClick) {
      onDoubleClick();
    }
  };

  // Animation variants
  const cardVariants = {
    initial: {
      opacity: 0,
      scale: 0.8,
      y: -50,
    },
    animate: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: {
        type: 'spring',
        stiffness: 300,
        damping: 25,
        delay: animationDelay,
      },
    },
    exit: {
      opacity: 0,
      scale: 0.8,
      y: 20,
      transition: {
        duration: 0.2,
      },
    },
  };

  // Card Back (Neapolitan style)
  if (showBack) {
    return (
      <motion.div
        className={cardClasses}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        variants={cardVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        layoutId={layoutId}
        whileHover={!disabled ? { scale: 1.02 } : undefined}
        whileTap={!disabled ? { scale: 0.98 } : undefined}
      >
        <CardBack />
      </motion.div>
    );
  }

  // Card Face (Neapolitan style SVG)
  return (
    <motion.div
      className={cardClasses}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      variants={cardVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      layoutId={layoutId}
      whileHover={!disabled ? { scale: 1.02 } : undefined}
      whileTap={!disabled ? { scale: 0.98 } : undefined}
    >
      <CardImage card={card} />
    </motion.div>
  );
}
