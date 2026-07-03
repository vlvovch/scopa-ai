// Captured Cards Modal - Displays all cards in a player's captured pile

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Card } from '../../games/scopa/types';
import { CardImage } from '../Card/CardImage';
import { useDeck } from '../../contexts/DeckContext';
import { useT } from '../../i18n/LanguageContext';
import styles from './CapturedCardsModal.module.css';

interface CapturedCardsModalProps {
  isOpen: boolean;
  onClose: () => void;
  cards: Card[];
  /** Pile owner's name; omit for the local player ("Your Captured Cards"). */
  playerName?: string;
}

// Denari (Coins) icon using authentic SVG from deck
function DenariIcon({ size = 16 }: { size?: number }) {
  const deckType = useDeck();
  const coinPath = `/cards/${deckType}/suits/coins.svg`;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ verticalAlign: 'middle' }}>
      <image href={coinPath} x="2" y="2" width="20" height="20" />
    </svg>
  );
}

export function CapturedCardsModal({ isOpen, onClose, cards, playerName }: CapturedCardsModalProps) {
  const t = useT();
  // Calculate stats
  const stats = useMemo(() => {
    const denariCount = cards.filter(c => c.suit === 'coins').length;
    const hasSetteBello = cards.some(c => c.suit === 'coins' && c.value === 7);
    return { denariCount, hasSetteBello };
  }, [cards]);

  // Cards are displayed in collection order (no sorting)

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={styles.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className={styles.modal}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className={styles.title}>
              {playerName ? t.captured.title(playerName) : t.captured.yourCards}
            </h2>

            <div className={styles.stats}>
              <span className={styles.stat}>
                <strong>{cards.length}</strong> {t.captured.cardsWord}
              </span>
              <span className={styles.stat}>
                <DenariIcon /> <strong>{stats.denariCount}</strong>
              </span>
              {stats.hasSetteBello && (
                <span className={styles.setteBello}>
                  <span>7</span>
                  <DenariIcon size={14} />
                </span>
              )}
            </div>

            <div className={styles.cardsContainer}>
              {cards.length === 0 ? (
                <p className={styles.empty}>{t.captured.empty}</p>
              ) : (
                <div className={styles.cardsGrid}>
                  {cards.map((card) => (
                    <div
                      key={card.id}
                      className={`${styles.cardWrapper} ${
                        card.suit === 'coins' && card.value === 7 ? styles.setteBelloCard : ''
                      }`}
                    >
                      <CardImage card={card} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button className={styles.closeButton} onClick={onClose}>
              {t.common.close}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
