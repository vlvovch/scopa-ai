// Step 7.4: PlayerHand Component with animations

import { AnimatePresence, motion } from 'framer-motion';
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
  /** Currently selected card ID */
  selectedCardId?: string | null;
  /** Whether interactions are disabled */
  disabled?: boolean;
}

export function PlayerHand({
  cards,
  isHuman,
  onCardClick,
  onCardDoubleClick,
  selectedCardId,
  disabled = false,
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
            initial={{ opacity: 0, scale: 0.8, y: isHuman ? 50 : -50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: isHuman ? -30 : 30 }}
            transition={{
              type: 'spring',
              stiffness: 400,
              damping: 30,
              delay: index * 0.1,
            }}
          >
            <Card
              card={card}
              faceDown={!isHuman}
              onClick={isHuman && onCardClick ? () => onCardClick(card) : undefined}
              onDoubleClick={isHuman && onCardDoubleClick ? () => onCardDoubleClick(card) : undefined}
              selected={isHuman && selectedCardId === card.id}
              disabled={disabled || !isHuman}
              layoutId={`hand-${card.id}`}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
