// Briscola settings modal — visual structure mirrors Scopa's SettingsModal
// (same CSS module). Briscola-specific subset: Default Best Of, Animation
// Speed, Card Deck (dropdown → sub-modal), Sound effects toggle.

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { BriscolaSettings, DeckType } from './hooks/useSettings';
import styles from '../../components/UI/SettingsModal.module.css';

const DECK_OPTIONS: { value: DeckType; label: string }[] = [
  { value: 'napoletane', label: 'Napoletane' },
  { value: 'siciliane', label: 'Siciliane' },
  { value: 'sarde', label: 'Sarde' },
  { value: 'piacentine', label: 'Piacentine' },
  { value: 'bergamasche', label: 'Bergamasche' },
  { value: 'romagnole', label: 'Romagnole' },
];

const PRESET_BEST_OF = [1, 2, 3] as const;
const ANIMATION_SPEEDS = ['instant', 'fast', 'normal', 'slow'] as const;

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: BriscolaSettings;
  onUpdate: <K extends keyof BriscolaSettings>(key: K, value: BriscolaSettings[K]) => void;
  onReset: () => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  settings,
  onUpdate,
  onReset,
}: SettingsModalProps) {
  const [showDeckSelector, setShowDeckSelector] = useState(false);
  const isPresetBestOf = (PRESET_BEST_OF as readonly number[]).includes(settings.defaultBestOf);

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
            <h2 className={styles.title}>Settings</h2>

            {/* Default Best Of — mirrors Scopa's Default Target Score */}
            <div className={styles.setting}>
              <label className={styles.label}>Default Best Of</label>
              <div className={styles.options}>
                {PRESET_BEST_OF.map((n) => (
                  <button
                    key={n}
                    className={`${styles.option} ${settings.defaultBestOf === n ? styles.selected : ''}`}
                    onClick={() => onUpdate('defaultBestOf', n)}
                  >
                    {n}
                  </button>
                ))}
                <input
                  type="number"
                  min="1"
                  max="99"
                  className={`${styles.customInput} ${!isPresetBestOf ? styles.selected : ''}`}
                  value={settings.defaultBestOf}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val >= 1) onUpdate('defaultBestOf', val);
                  }}
                  title="Custom best-of value"
                />
              </div>
            </div>

            {/* Animation Speed */}
            <div className={styles.setting}>
              <label className={styles.label}>Animation Speed</label>
              <div className={styles.options}>
                {ANIMATION_SPEEDS.map((speed) => (
                  <button
                    key={speed}
                    className={`${styles.option} ${settings.animationSpeed === speed ? styles.selected : ''}`}
                    onClick={() => onUpdate('animationSpeed', speed)}
                    title={speed === 'instant' ? 'Skip animations entirely' : undefined}
                  >
                    {speed === 'instant' ? '⚡' : speed.charAt(0).toUpperCase() + speed.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Card Deck — dropdown button opens a sub-modal grid */}
            <div className={styles.setting}>
              <label className={styles.label}>Card Deck</label>
              <button
                className={styles.deckSelectorButton}
                onClick={() => setShowDeckSelector(true)}
              >
                <img
                  src={`/cards/${settings.deck}/coins-1.webp`}
                  alt={settings.deck}
                  className={styles.deckPreviewThumb}
                />
                <span>
                  {DECK_OPTIONS.find((d) => d.value === settings.deck)?.label}
                </span>
              </button>
            </div>

            {/* Sound effects */}
            <div className={styles.setting}>
              <label className={styles.label}>Sound</label>
              <div className={styles.toggleRow}>
                <span className={styles.toggleLabel}>Sound effects</span>
                <button
                  className={`${styles.toggle} ${settings.soundEnabled ? styles.on : ''}`}
                  onClick={() => onUpdate('soundEnabled', !settings.soundEnabled)}
                  aria-pressed={settings.soundEnabled}
                  title={settings.soundEnabled ? 'Sound on' : 'Sound off'}
                >
                  <span className={styles.toggleKnob} />
                </button>
              </div>
              <p className={styles.settingHint}>
                Card play, capture, and dealing sounds.
              </p>
            </div>

            <div className={styles.actions}>
              <button type="button" className={styles.resetButton} onClick={onReset}>
                Reset to defaults
              </button>
              <button type="button" className={styles.resetButton} onClick={onClose}>
                Close
              </button>
            </div>
          </motion.div>

          {/* Deck selector sub-modal */}
          <DeckSelectorModal
            isOpen={showDeckSelector}
            currentDeck={settings.deck}
            onSelect={(deck) => {
              onUpdate('deck', deck);
              setShowDeckSelector(false);
            }}
            onClose={() => setShowDeckSelector(false)}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DeckSelectorModal({
  isOpen,
  currentDeck,
  onSelect,
  onClose,
}: {
  isOpen: boolean;
  currentDeck: DeckType;
  onSelect: (deck: DeckType) => void;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={styles.deckSelectorOverlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className={styles.deckSelectorModal}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={styles.deckSelectorTitle}>Select Card Deck</h3>
            <div className={styles.deckGrid}>
              {DECK_OPTIONS.map((deck) => (
                <button
                  key={deck.value}
                  className={`${styles.deckOption} ${currentDeck === deck.value ? styles.deckSelected : ''}`}
                  onClick={() => onSelect(deck.value)}
                >
                  <img
                    src={`/cards/${deck.value}/coins-1.webp`}
                    alt={deck.label}
                    className={styles.deckPreview}
                  />
                  <span className={styles.deckLabel}>{deck.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
