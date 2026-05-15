// Briscola settings modal — sound on/off and deck art selector.
// Reuses Scopa's SettingsModal.module.css for the visual style.

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

            {/* Sound */}
            <div className={styles.setting}>
              <div className={styles.toggleRow}>
                <span className={styles.label}>Sound Effects</span>
                <button
                  type="button"
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

            {/* Deck art */}
            <div className={styles.setting}>
              <span className={styles.label}>Deck</span>
              <div className={styles.options}>
                {DECK_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`${styles.option} ${settings.deck === opt.value ? styles.selected : ''}`}
                    onClick={() => onUpdate('deck', opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className={styles.settingHint}>
                Italian regional deck art. Same 40-card structure.
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
        </motion.div>
      )}
    </AnimatePresence>
  );
}
