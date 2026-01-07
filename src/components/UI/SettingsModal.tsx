// Step 10.2: Settings Modal Component

import { useState } from 'react';
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

// Session storage key for API key warning dismissal
const API_KEY_WARNING_KEY = 'scopa-api-key-warning-shown';

export function SettingsModal({
  isOpen,
  onClose,
  settings,
  onUpdateSetting,
  onResetSettings,
}: SettingsModalProps) {
  // Track if warning popup should be shown
  const [showApiKeyWarning, setShowApiKeyWarning] = useState(false);
  const [pendingKeyUpdate, setPendingKeyUpdate] = useState<{
    key: 'geminiApiKey' | 'openaiApiKey' | 'claudeApiKey';
    value: string;
  } | null>(null);

  // Check if warning was already shown this session
  const wasWarningShown = () => sessionStorage.getItem(API_KEY_WARNING_KEY) === 'true';
  const markWarningShown = () => sessionStorage.setItem(API_KEY_WARNING_KEY, 'true');

  // Handle API key input - show warning on first input if not shown before
  const handleApiKeyChange = (
    key: 'geminiApiKey' | 'openaiApiKey' | 'claudeApiKey',
    value: string
  ) => {
    // If clearing the key, just do it
    if (value === '') {
      onUpdateSetting(key, value);
      return;
    }

    // If warning was already shown this session, just update
    if (wasWarningShown()) {
      onUpdateSetting(key, value);
      return;
    }

    // Show warning and store pending update
    setPendingKeyUpdate({ key, value });
    setShowApiKeyWarning(true);
  };

  // Handle warning confirmation
  const handleWarningConfirm = () => {
    markWarningShown();
    if (pendingKeyUpdate) {
      onUpdateSetting(pendingKeyUpdate.key, pendingKeyUpdate.value);
    }
    setShowApiKeyWarning(false);
    setPendingKeyUpdate(null);
  };

  // Handle warning cancel
  const handleWarningCancel = () => {
    setShowApiKeyWarning(false);
    setPendingKeyUpdate(null);
  };

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

            {/* API Keys Section */}
            <h3 className={styles.sectionTitle}>API Keys (to play against AI)</h3>

            <div className={styles.apiKeyGroup}>
              <label className={styles.apiKeyLabel}>
                Gemini
                {settings.geminiApiKey && (
                  <span className={`${styles.apiKeyStatus} ${styles.configured}`}>Configured</span>
                )}
              </label>
              <input
                type="password"
                className={styles.apiKeyInput}
                placeholder="Enter your Gemini API key"
                value={settings.geminiApiKey}
                onChange={(e) => handleApiKeyChange('geminiApiKey', e.target.value)}
              />
            </div>

            <div className={styles.apiKeyGroup}>
              <label className={styles.apiKeyLabel}>
                OpenAI
                {settings.openaiApiKey && (
                  <span className={`${styles.apiKeyStatus} ${styles.configured}`}>Configured</span>
                )}
              </label>
              <input
                type="password"
                className={styles.apiKeyInput}
                placeholder="Enter your OpenAI API key"
                value={settings.openaiApiKey}
                onChange={(e) => handleApiKeyChange('openaiApiKey', e.target.value)}
              />
            </div>

            <div className={styles.apiKeyGroup}>
              <label className={styles.apiKeyLabel}>
                Claude
                {settings.claudeApiKey && (
                  <span className={`${styles.apiKeyStatus} ${styles.configured}`}>Configured</span>
                )}
              </label>
              <input
                type="password"
                className={styles.apiKeyInput}
                placeholder="Enter your Claude API key"
                value={settings.claudeApiKey}
                onChange={(e) => handleApiKeyChange('claudeApiKey', e.target.value)}
              />
            </div>

            <p className={styles.apiKeyHint}>
              Keys are stored locally in your browser only. We do not have access to your keys.
              Always exercise caution when entering API keys on any website.
            </p>

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

      {/* API Key Security Warning Popup */}
      {showApiKeyWarning && (
        <motion.div
          className={styles.warningOverlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleWarningCancel}
        >
          <motion.div
            className={styles.warningModal}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={styles.warningTitle}>API Key Security Notice</h3>
            <div className={styles.warningContent}>
              <p>Before entering your API key, please note:</p>
              <ul>
                <li>Your API key is stored <strong>only in your browser's local storage</strong></li>
                <li>We do not transmit or store your key on any server</li>
                <li>API calls are made directly from your browser to the AI provider</li>
                <li>Always exercise caution when entering API keys on any website</li>
                <li>Consider using a key with usage limits for added safety</li>
              </ul>
            </div>
            <div className={styles.warningActions}>
              <button className={styles.warningCancel} onClick={handleWarningCancel}>
                Cancel
              </button>
              <button className={styles.warningConfirm} onClick={handleWarningConfirm}>
                I Understand
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
