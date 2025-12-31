// Step 7.4: PlayerHand Component with animations

import { AnimatePresence, motion, PanInfo } from 'framer-motion';
import type { Card as CardType } from '../../game/types';
import { Card } from '../Card/Card';
import styles from './PlayerHand.module.css';

interface PlayerHandProps {
  /** Cards in the player's hand */
  cards: CardType[];
  /** Whether this is the human player's hand */
  isHuman: boolean;
  /** Called when a card is clicked (human only) */
  onCardClick?: (card: CardType) => void;
  /** Called when a card is double-clicked (human only, for placing) */
  onCardDoubleClick?: (card: CardType) => void;
  /** Called when a card drag starts (human only) */
  onCardDragStart?: (card: CardType) => void;
  /** Called when a card drag ends (human only) */
  onCardDragEnd?: (card: CardType, info: PanInfo) => void;
  /** Currently selected card ID */
  selectedCardId?: string | null;
  /** Whether interactions are disabled */
  disabled?: boolean;
  /** Force cards to show face up (for spectator mode) */
  showFaceUp?: boolean;
  /** ID of card that was just played (to skip snap-back animation) */
  playedCardId?: string | null;
}

export function PlayerHand({
  cards,
  isHuman,
  onCardClick,
  onCardDoubleClick,
  onCardDragStart,
  onCardDragEnd,
  selectedCardId,
  disabled = false,
  showFaceUp = false,
}: PlayerHandProps) {
  const handClasses = [
    styles.hand,
    isHuman ? styles.human : styles.cpu,
  ].join(' ');

  return (
    <div className={handClasses}>
      <AnimatePresence mode="popLayout">
        {cards.map((card, index) => (
          <motion.div
            key={card.id}
            className={styles.handCard}
            layout
            initial={{ opacity: 0, scale: 0.85, y: isHuman ? 40 : -40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{
              opacity: 0,
              scale: 0.85,
              y: isHuman ? -20 : 20,
              transition: { duration: 0.25, ease: 'easeOut' }
            }}
            transition={{
              type: 'spring',
              stiffness: 400,
              damping: 30,
              mass: 0.5,
              delay: index * 0.05,
            }}
          >
            <Card
              card={card}
              faceDown={!isHuman && !showFaceUp}
              onClick={isHuman && onCardClick ? () => onCardClick(card) : undefined}
              onDoubleClick={isHuman && onCardDoubleClick ? () => onCardDoubleClick(card) : undefined}
              selected={isHuman && selectedCardId === card.id}
              disabled={disabled || !isHuman}
              layoutId={`hand-${card.id}`}
              draggable={isHuman && !disabled}
              onDragStart={isHuman && onCardDragStart ? () => onCardDragStart(card) : undefined}
              onDragEnd={isHuman && onCardDragEnd ? (_e, info: PanInfo) => onCardDragEnd(card, info) : undefined}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
