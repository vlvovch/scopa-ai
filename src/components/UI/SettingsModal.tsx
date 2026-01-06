// Step 10.2: Settings Modal Component

import { motion, AnimatePresence } from 'framer-motion';
import type { GameSettings, DeckType } from '../../hooks/useSettings';
import styles from './SettingsModal.module.css';

const DECK_OPTIONS: { value: DeckType; label: string }[] = [
  { value: 'napoletane', label: 'Napoletane' },
  { value: 'siciliane', label: 'Siciliane' },
];

const PRESET_SCORES = [11, 16, 21] as const;

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: GameSettings;
  onUpdateSetting: <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => void;
  onResetSettings: () => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  settings,
  onUpdateSetting,
  onResetSettings,
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

            <div className={styles.setting}>
              <label className={styles.label}>Default Target Score</label>
              <div className={styles.options}>
                {PRESET_SCORES.map((score) => (
                  <button
                    key={score}
                    className={`${styles.option} ${settings.defaultTargetScore === score ? styles.selected : ''}`}
                    onClick={() => onUpdateSetting('defaultTargetScore', score)}
                  >
                    {score}
                  </button>
                ))}
                <input
                  type="number"
                  min="1"
                  max="999"
                  className={`${styles.customInput} ${!PRESET_SCORES.includes(settings.defaultTargetScore as 11 | 16 | 21) ? styles.selected : ''}`}
                  value={settings.defaultTargetScore}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val >= 1) {
                      onUpdateSetting('defaultTargetScore', val);
                    }
                  }}
                  title="Custom target score"
                />
              </div>
            </div>

            <div className={styles.setting}>
              <label className={styles.label}>Animation Speed</label>
              <div className={styles.options}>
                {(['instant', 'fast', 'normal', 'slow'] as const).map((speed) => (
                  <button
                    key={speed}
                    className={`${styles.option} ${settings.animationSpeed === speed ? styles.selected : ''}`}
                    onClick={() => onUpdateSetting('animationSpeed', speed)}
                    title={speed === 'instant' ? 'Skip all animations for fast simulation' : undefined}
                  >
                    {speed === 'instant' ? '⚡' : speed.charAt(0).toUpperCase() + speed.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.setting}>
              <label className={styles.label}>Card Deck</label>
              <div className={styles.options}>
                {DECK_OPTIONS.map((deck) => (
                  <button
                    key={deck.value}
                    className={`${styles.option} ${settings.deck === deck.value ? styles.selected : ''}`}
                    onClick={() => onUpdateSetting('deck', deck.value)}
                  >
                    {deck.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.setting}>
              <label className={styles.label}>Watch Mode</label>
              <div className={styles.toggleRow}>
                <span className={styles.toggleLabel}>Auto-advance rounds</span>
                <button
                  className={`${styles.toggle} ${settings.autoAdvanceSpectator ? styles.on : ''}`}
                  onClick={() => onUpdateSetting('autoAdvanceSpectator', !settings.autoAdvanceSpectator)}
                  title={settings.autoAdvanceSpectator ? 'Auto-advance enabled (2s delay)' : 'Manual advance'}
                >
                  <span className={styles.toggleKnob} />
                </button>
              </div>
              <p className={styles.settingHint}>
                {settings.autoAdvanceSpectator
                  ? 'Round summary shows for 2 seconds, then auto-continues'
                  : 'Wait for manual click to proceed between rounds'}
              </p>
            </div>

            <div className={styles.setting}>
              <label className={styles.label}>Sound</label>
              <div className={styles.toggleRow}>
                <span className={styles.toggleLabel}>Sound effects</span>
                <button
                  className={`${styles.toggle} ${settings.soundEnabled ? styles.on : ''}`}
                  onClick={() => onUpdateSetting('soundEnabled', !settings.soundEnabled)}
                  title={settings.soundEnabled ? 'Sound on' : 'Sound off'}
                >
                  <span className={styles.toggleKnob} />
                </button>
              </div>
            </div>

            <div className={styles.actions}>
              <button className={styles.resetButton} onClick={onResetSettings}>
                Reset to Defaults
              </button>
              <button className={styles.closeButton} onClick={onClose}>
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
