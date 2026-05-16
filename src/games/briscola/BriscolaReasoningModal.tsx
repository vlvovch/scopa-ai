// Briscola reasoning modal — shows the LLM bot's last move + its
// reasoning text. Triggered by clicking on a bot's recently-played card
// (the lead/follow card in the trick area, or the card-back in the
// cpu-animating phase). Sync CPU bots have no reasoning, so we just
// don't surface the trigger for them.

import { motion, AnimatePresence } from 'framer-motion';
import { CardImage } from '../../components/Card/CardImage';
import type { Card } from './types';

export interface BriscolaReasoningData {
  card: Card;
  /** Display label for the bot (e.g. "Gemini 2.5 Flash", "Claude Sonnet 4.5") */
  botLabel: string;
  reasoning: string;
}

interface Props {
  isOpen: boolean;
  data: BriscolaReasoningData | null;
  onClose: () => void;
}

export function BriscolaReasoningModal({ isOpen, data, onClose }: Props) {
  if (!data) return null;
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.65)',
              zIndex: 220,
            }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 12 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 221,
              background:
                'linear-gradient(180deg, #1e3a2f 0%, #0d1f17 100%)',
              border: '2px solid var(--color-accent)',
              borderRadius: 12,
              padding: '1.25rem',
              maxWidth: 'min(420px, 92vw)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              color: 'var(--color-text-primary)',
            }}
          >
            <div
              style={{
                display: 'flex',
                gap: '1rem',
                alignItems: 'center',
                marginBottom: '0.75rem',
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 84,
                  borderRadius: 6,
                  background: '#fff',
                  overflow: 'hidden',
                  boxShadow:
                    '0 0 0 2px var(--color-accent), 0 2px 6px rgba(0,0,0,0.4)',
                  flex: '0 0 auto',
                }}
              >
                <CardImage
                  card={data.card}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                  }}
                />
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: '0.85rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--color-accent)',
                    marginBottom: '0.2rem',
                  }}
                >
                  {data.botLabel}
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                  Played this card
                </div>
              </div>
            </div>
            <div
              style={{
                fontSize: '0.9rem',
                lineHeight: 1.5,
                color: 'var(--color-text-secondary)',
                whiteSpace: 'pre-wrap',
                maxHeight: '40vh',
                overflowY: 'auto',
              }}
            >
              {data.reasoning.trim() || (
                <em style={{ opacity: 0.7 }}>No reasoning provided.</em>
              )}
            </div>
            <button
              onClick={onClose}
              style={{
                marginTop: '1rem',
                padding: '0.5rem 1.25rem',
                background: 'var(--color-accent)',
                color: '#000',
                border: 'none',
                borderRadius: 6,
                fontWeight: 600,
                cursor: 'pointer',
                width: '100%',
              }}
            >
              Close
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
