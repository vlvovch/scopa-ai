// Step 10.2: Settings Modal Component

import { motion, AnimatePresence } from 'framer-motion';
import type { GameSettings } from '../../hooks/useSettings';
import styles from './SettingsModal.module.css';

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
                {([11, 16, 21] as const).map((score) => (
                  <button
                    key={score}
                    className={`${styles.option} ${settings.defaultTargetScore === score ? styles.selected : ''}`}
                    onClick={() => onUpdateSetting('defaultTargetScore', score)}
                  >
                    {score}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.setting}>
              <label className={styles.label}>Animation Speed</label>
              <div className={styles.options}>
                {(['fast', 'normal', 'slow'] as const).map((speed) => (
                  <button
                    key={speed}
                    className={`${styles.option} ${settings.animationSpeed === speed ? styles.selected : ''}`}
                    onClick={() => onUpdateSetting('animationSpeed', speed)}
                  >
                    {speed.charAt(0).toUpperCase() + speed.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.setting}>
              <label className={styles.label}>Show Card Values</label>
              <button
                className={`${styles.toggle} ${settings.showCardValues ? styles.on : ''}`}
                onClick={() => onUpdateSetting('showCardValues', !settings.showCardValues)}
              >
                <span className={styles.toggleKnob} />
              </button>
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
