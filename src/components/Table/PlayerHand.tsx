// Step 7.4: PlayerHand Component with animations

import { AnimatePresence, motion, PanInfo } from 'framer-motion';
import type { Card as CardType } from '../../games/scopa/types';
import { Card } from '../Card/Card';
import { useDesktopMode } from '../../hooks/useDesktopMode';
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
  /** Called when the hand area is clicked (for spectator mode toggle) */
  onHandClick?: () => void;
  /** Optional caption rendered directly under each card, keyed by card
   *  id (Briscola win-odds per-card analysis). Omitted everywhere else
   *  so Scopa / the CPU hand are unaffected. */
  cardAnnotations?: Record<string, React.ReactNode>;
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
  onHandClick,
  cardAnnotations,
}: PlayerHandProps) {
  // In desktop-site-mode the app is CSS-zoomed, which breaks drag — so
  // disable it there and rely on tap-to-play (select card → tap target).
  const dmode = useDesktopMode();
  const canDrag = isHuman && !disabled && !dmode;

  const handClasses = [
    styles.hand,
    isHuman ? styles.human : styles.cpu,
    onHandClick ? styles.clickable : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={handClasses} onClick={onHandClick}>
      <AnimatePresence mode="popLayout">
        {cards.map((card) => (
          <motion.div
            key={card.id}
            className={styles.handCard}
            layout="position"
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
              stiffness: 500,
              damping: 35,
              mass: 0.4,
            }}
            style={{
              touchAction: isHuman ? 'none' as const : 'auto' as const,
              // Anchor for the absolutely-positioned per-card caption so
              // it never reflows the hand (no wiggle when odds arrive).
              position: 'relative',
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
              draggable={canDrag}
              onDragStart={canDrag && onCardDragStart ? () => onCardDragStart(card) : undefined}
              onDragEnd={canDrag && onCardDragEnd ? (_e, info: PanInfo) => onCardDragEnd(card, info) : undefined}
            />
            {cardAnnotations?.[card.id] != null && (
              <div
                style={{
                  // Out of flow → appearing/updating never resizes the
                  // hand. Sits just below the card, centered on it.
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: '4px',
                  textAlign: 'center',
                  fontSize: '12px',
                  lineHeight: 1.1,
                  fontVariantNumeric: 'tabular-nums',
                  pointerEvents: 'none',
                }}
              >
                {cardAnnotations[card.id]}
              </div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
