// Card Component with Neapolitan-style SVG graphics and animations

import { motion, PanInfo } from 'framer-motion';
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
  /** Whether the card is draggable */
  draggable?: boolean;
  /** Called when drag starts */
  onDragStart?: () => void;
  /** Called when drag ends with position info */
  onDragEnd?: (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
  /** Skip snap-to-origin when card was successfully played */
  skipSnapToOrigin?: boolean;
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
  draggable = false,
  onDragStart,
  onDragEnd,
}: CardProps) {
  const showBack = faceDown || card === null;

  const cardClasses = [
    styles.card,
    selected && styles.selected,
    highlighted && styles.highlighted,
    disabled && styles.disabled,
    draggable && styles.draggable,
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

  // Animation variants - don't animate y for draggable cards (conflicts with drag)
  const cardVariants = {
    initial: {
      opacity: 0,
      scale: 0.85,
      y: draggable ? 0 : -30,
    },
    animate: {
      opacity: 1,
      scale: selected ? 1.08 : 1,
      y: selected && !draggable ? -10 : 0,
      transition: {
        type: 'spring',
        stiffness: 200,
        damping: 22,
        mass: 0.8,
        delay: animationDelay,
      },
    },
    exit: {
      opacity: 0,
      scale: 0.85,
      y: draggable ? 0 : 15,
      transition: {
        duration: 0.25,
        ease: 'easeOut',
      },
    },
  };

  const dragProps = draggable ? {
    drag: true,
    dragSnapToOrigin: true,
    dragElastic: 1, // Full elasticity - card follows cursor exactly
    dragMomentum: false,
    onDragStart,
    onDragEnd,
    whileDrag: { scale: 1.08, zIndex: 100 },
  } : {};

  // Hover/tap animation config - don't use y for draggable cards
  const hoverAnimation = !disabled && !draggable ? {
    y: selected ? -10 : -4,
    scale: 1.02,
    transition: { type: 'spring', stiffness: 400, damping: 25 }
  } : (!disabled && draggable ? {
    scale: 1.03,
    transition: { type: 'spring', stiffness: 400, damping: 25 }
  } : undefined);

  const tapAnimation = !disabled ? {
    scale: 0.97,
    transition: { type: 'spring', stiffness: 500, damping: 30 }
  } : undefined;

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
        whileHover={hoverAnimation}
        whileTap={tapAnimation}
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
      whileHover={hoverAnimation}
      whileTap={tapAnimation}
      {...dragProps}
    >
      <CardImage card={card} />
    </motion.div>
  );
}
