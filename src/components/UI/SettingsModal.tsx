// Step 10.2: Settings Modal Component

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { GameSettings, DeckType, TableStyle } from '../../hooks/useSettings';
import { validateGeminiKey, validateOpenAIKey, validateClaudeKey, type ValidationStatus } from '../../games/scopa/ai/validateApiKey';
import { clearGeminiCache, clearGeminiSingleTurnCache, clearOpenAICache, clearOpenAISingleTurnCache, clearClaudeCache, clearClaudeSingleTurnCache } from '../../games/scopa/ai';
import {
  clearGeminiCache as clearBriscolaGeminiCache,
  clearOpenAICache as clearBriscolaOpenAICache,
  clearClaudeCache as clearBriscolaClaudeCache,
} from '../../games/briscola/ai';
import styles from './SettingsModal.module.css';

const DECK_OPTIONS: { value: DeckType; label: string }[] = [
  { value: 'napoletane', label: 'Napoletane' },
  { value: 'siciliane', label: 'Siciliane' },
  { value: 'sarde', label: 'Sarde' },
  { value: 'piacentine', label: 'Piacentine' },
  { value: 'bergamasche', label: 'Bergamasche' },
  { value: 'romagnole', label: 'Romagnole' },
];

const TABLE_STYLE_OPTIONS: { value: TableStyle; label: string }[] = [
  { value: 'green', label: 'Green Felt' },
  { value: 'tablecloth', label: 'Tablecloth' },
];

const PRESET_SCORES = [11, 16, 21] as const;

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: GameSettings;
  onUpdateSetting: <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => void;
  onResetSettings: () => void;
  /** Which game's settings are being shown. Controls the "Default ..."
   *  section (Target Score for Scopa vs First To for Briscola) and which
   *  game-specific sections are visible. Defaults to 'scopa'. */
  game?: 'scopa' | 'briscola';
}

const PRESET_BEST_OF = [1, 2, 3] as const;

// Session storage key for API key warning dismissal
const API_KEY_WARNING_KEY = 'scopa-api-key-warning-shown';

// Check if running in itch.io mode (API keys disabled)
const ITCH_MODE = import.meta.env.VITE_ITCH_MODE === 'true';
const MAIN_SITE_URL = 'https://scopa-ai.vovchenko.net';

export function SettingsModal({
  isOpen,
  onClose,
  settings,
  onUpdateSetting,
  onResetSettings,
  game = 'scopa',
}: SettingsModalProps) {
  // Track if warning popup should be shown
  const [showApiKeyWarning, setShowApiKeyWarning] = useState(false);
  // Track if deck selector modal should be shown
  const [showDeckSelector, setShowDeckSelector] = useState(false);
  const [pendingKeyUpdate, setPendingKeyUpdate] = useState<{
    key: 'geminiApiKey' | 'openaiApiKey' | 'claudeApiKey';
    value: string;
  } | null>(null);

  // Validation status for each provider
  const [geminiStatus, setGeminiStatus] = useState<ValidationStatus>('idle');
  const [openaiStatus, setOpenaiStatus] = useState<ValidationStatus>('idle');
  const [claudeStatus, setClaudeStatus] = useState<ValidationStatus>('idle');

  // Validate API key and save validity status to settings
  const validateKey = useCallback(async (
    provider: 'gemini' | 'openai' | 'claude',
    key: string
  ) => {
    const validityKey = provider === 'gemini' ? 'geminiKeyValid'
      : provider === 'openai' ? 'openaiKeyValid' : 'claudeKeyValid';

    if (!key) {
      if (provider === 'gemini') setGeminiStatus('idle');
      else if (provider === 'openai') setOpenaiStatus('idle');
      else setClaudeStatus('idle');
      // Mark as invalid when key is empty
      onUpdateSetting(validityKey, false);
      return;
    }

    const setStatus = provider === 'gemini' ? setGeminiStatus
      : provider === 'openai' ? setOpenaiStatus : setClaudeStatus;

    setStatus('validating');

    const validateFn = provider === 'gemini' ? validateGeminiKey
      : provider === 'openai' ? validateOpenAIKey : validateClaudeKey;

    const result = await validateFn(key);
    const isValid = result.valid;
    setStatus(isValid ? 'valid' : 'invalid');
    // Save validity status to settings
    onUpdateSetting(validityKey, isValid);
  }, [onUpdateSetting]);

  // Validate keys when modal opens or keys change (with debounce)
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      if (settings.geminiApiKey) validateKey('gemini', settings.geminiApiKey);
      if (settings.openaiApiKey) validateKey('openai', settings.openaiApiKey);
      if (settings.claudeApiKey) validateKey('claude', settings.claudeApiKey);
    }, 500);

    return () => clearTimeout(timer);
  }, [isOpen, settings.geminiApiKey, settings.openaiApiKey, settings.claudeApiKey, validateKey]);

  // Reset validation status when modal closes
  useEffect(() => {
    if (!isOpen) {
      setGeminiStatus('idle');
      setOpenaiStatus('idle');
      setClaudeStatus('idle');
    }
  }, [isOpen]);

  // Check if warning was already shown this session
  const wasWarningShown = () => sessionStorage.getItem(API_KEY_WARNING_KEY) === 'true';
  const markWarningShown = () => sessionStorage.setItem(API_KEY_WARNING_KEY, 'true');

  // Clear AI caches for a specific provider (call when key changes).
  // Both Scopa and Briscola maintain their own per-(model, useThinking)
  // bot caches — clearing only Scopa's would leave Briscola holding an
  // instance built with the stale (or missing) key.
  const clearCacheForProvider = useCallback((key: 'geminiApiKey' | 'openaiApiKey' | 'claudeApiKey') => {
    if (key === 'geminiApiKey') {
      clearGeminiCache();
      clearGeminiSingleTurnCache();
      clearBriscolaGeminiCache();
    } else if (key === 'openaiApiKey') {
      clearOpenAICache();
      clearOpenAISingleTurnCache();
      clearBriscolaOpenAICache();
    } else if (key === 'claudeApiKey') {
      clearClaudeCache();
      clearClaudeSingleTurnCache();
      clearBriscolaClaudeCache();
    }
  }, []);

  // Handle API key input - show warning on first input if not shown before
  const handleApiKeyChange = (
    key: 'geminiApiKey' | 'openaiApiKey' | 'claudeApiKey',
    value: string
  ) => {
    // Clear cache when key changes (so new key is used on next AI request)
    clearCacheForProvider(key);

    // Mark the key as invalid until validation completes
    const validityKey = key === 'geminiApiKey' ? 'geminiKeyValid'
      : key === 'openaiApiKey' ? 'openaiKeyValid' : 'claudeKeyValid';
    onUpdateSetting(validityKey, false);

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

  // Render validation status indicator
  const renderValidationStatus = (status: ValidationStatus, hasKey: boolean) => {
    if (!hasKey) return null;

    switch (status) {
      case 'validating':
        return <span className={`${styles.apiKeyStatus} ${styles.validating}`}>Checking...</span>;
      case 'valid':
        return <span className={`${styles.apiKeyStatus} ${styles.valid}`}>Valid</span>;
      case 'invalid':
        return <span className={`${styles.apiKeyStatus} ${styles.invalid}`}>Invalid</span>;
      default:
        return <span className={`${styles.apiKeyStatus} ${styles.configured}`}>Configured</span>;
    }
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

            {game === 'briscola' ? (
              <div className={styles.setting}>
                <label className={styles.label}>Default First To</label>
                <div className={styles.options}>
                  {PRESET_BEST_OF.map((n) => (
                    <button
                      key={n}
                      className={`${styles.option} ${settings.defaultBestOf === n ? styles.selected : ''}`}
                      onClick={() => onUpdateSetting('defaultBestOf', n)}
                    >
                      {n}
                    </button>
                  ))}
                  <input
                    type="number"
                    min="1"
                    max="99"
                    className={`${styles.customInput} ${!(PRESET_BEST_OF as readonly number[]).includes(settings.defaultBestOf) ? styles.selected : ''}`}
                    value={settings.defaultBestOf}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val >= 1) onUpdateSetting('defaultBestOf', val);
                    }}
                    title="Custom best-of value"
                  />
                </div>
              </div>
            ) : (
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
            )}

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
              <button
                className={styles.deckSelectorButton}
                onClick={() => setShowDeckSelector(true)}
              >
                <img
                  src={`/cards/${settings.deck}/coins-1.webp`}
                  alt={settings.deck}
                  className={styles.deckPreviewThumb}
                />
                <span>{DECK_OPTIONS.find(d => d.value === settings.deck)?.label}</span>
              </button>
            </div>

            <div className={styles.setting}>
              <label className={styles.label}>Table Style</label>
              <div className={styles.tableStyleOptions}>
                {TABLE_STYLE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={`${styles.tableStyleOption} ${settings.tableStyle === option.value ? styles.tableStyleSelected : ''}`}
                    onClick={() => onUpdateSetting('tableStyle', option.value)}
                  >
                    <div className={`${styles.tableStylePreview} ${styles[`tablePreview${option.value.charAt(0).toUpperCase() + option.value.slice(1)}`]}`} />
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Watch Mode: auto-advance rounds when both players are bots. */}
            <div className={styles.setting}>
              <label className={styles.label}>Watch Mode</label>
              <div className={styles.toggleRow}>
                <span className={styles.toggleLabel}>Auto-advance rounds</span>
                <button
                  className={`${styles.toggle} ${settings.autoAdvanceSpectator ? styles.on : ''}`}
                  onClick={() => onUpdateSetting('autoAdvanceSpectator', !settings.autoAdvanceSpectator)}
                  title={settings.autoAdvanceSpectator ? 'Auto-advance enabled' : 'Manual advance'}
                >
                  <span className={styles.toggleKnob} />
                </button>
              </div>
              <p className={styles.settingHint}>
                {settings.autoAdvanceSpectator
                  ? 'Round summary shows briefly, then auto-continues'
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

            <div className={styles.setting}>
              <label className={styles.label}>Display</label>
              <div className={styles.toggleRow}>
                <span className={styles.toggleLabel}>Show pile stats</span>
                <button
                  className={`${styles.toggle} ${settings.showPileStats ? styles.on : ''}`}
                  onClick={() => onUpdateSetting('showPileStats', !settings.showPileStats)}
                  title={settings.showPileStats ? 'Pile stats visible' : 'Pile stats hidden'}
                >
                  <span className={styles.toggleKnob} />
                </button>
              </div>
              <p className={styles.settingHint}>
                {settings.showPileStats
                  ? game === 'briscola'
                    ? 'Show point total and per-rank counts near each pile'
                    : 'Show coins count, sette bello, and scopas near piles'
                  : 'Hide pile statistics for a cleaner view'}
              </p>

              {game === 'briscola' && (
                <>
                  <div className={styles.toggleRow}>
                    <span className={styles.toggleLabel}>Win odds (analysis)</span>
                    <button
                      className={`${styles.toggle} ${settings.showWinOdds ? styles.on : ''}`}
                      onClick={() => onUpdateSetting('showWinOdds', !settings.showWinOdds)}
                      title={settings.showWinOdds ? 'Win odds shown' : 'Win odds hidden'}
                    >
                      <span className={styles.toggleKnob} />
                    </button>
                  </div>
                  <p className={styles.settingHint}>
                    {settings.showWinOdds
                      ? 'Estimated chance to win the round, from an Esperto self-play simulation. Single-player only.'
                      : 'Hide the win-odds estimate'}
                  </p>

                  {settings.showWinOdds && (
                    <>
                      <div className={styles.toggleRow}>
                        <span className={styles.toggleLabel}>
                          · Per-card odds
                        </span>
                        <button
                          className={`${styles.toggle} ${settings.showWinOddsPerCard ? styles.on : ''}`}
                          onClick={() =>
                            onUpdateSetting(
                              'showWinOddsPerCard',
                              !settings.showWinOddsPerCard
                            )
                          }
                          title={
                            settings.showWinOddsPerCard
                              ? 'Per-card odds shown'
                              : 'Per-card odds hidden'
                          }
                        >
                          <span className={styles.toggleKnob} />
                        </button>
                      </div>
                      <p className={styles.settingHint}>
                        {settings.showWinOddsPerCard
                          ? 'Show win % under each hand card. The headline is the best card’s odds.'
                          : 'Overall odds only (headline is still the best card)'}
                      </p>
                    </>
                  )}
                </>
              )}
            </div>

            {/* API Keys — Briscola supports Gemini today (slice 9), OpenAI
                and Claude still Scopa-only but keys are shared across both
                games (stored in the same settings object). */}
            <h3 className={styles.sectionTitle}>API Keys (to play against AI)</h3>

            {ITCH_MODE ? (
              <div className={styles.itchModeNotice}>
                <p>API key entry is disabled in this version.</p>
                <p>
                  To play against AI opponents (Claude, GPT, Gemini), visit the main site with BYOK (Bring Your Own Key):
                </p>
                <a
                  href={MAIN_SITE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.itchModeLink}
                >
                  {MAIN_SITE_URL}
                </a>
              </div>
            ) : (
              <>
                <div className={styles.apiKeyGroup}>
                  <label className={styles.apiKeyLabel}>
                    Gemini
                    {renderValidationStatus(geminiStatus, !!settings.geminiApiKey)}
                  </label>
                  <input
                    type="password"
                    className={`${styles.apiKeyInput} ${geminiStatus === 'invalid' ? styles.inputInvalid : ''}`}
                    placeholder="Enter your Gemini API key"
                    value={settings.geminiApiKey}
                    onChange={(e) => handleApiKeyChange('geminiApiKey', e.target.value)}
                  />
                </div>

                <div className={styles.apiKeyGroup}>
                  <label className={styles.apiKeyLabel}>
                    OpenAI
                    {renderValidationStatus(openaiStatus, !!settings.openaiApiKey)}
                  </label>
                  <input
                    type="password"
                    className={`${styles.apiKeyInput} ${openaiStatus === 'invalid' ? styles.inputInvalid : ''}`}
                    placeholder="Enter your OpenAI API key"
                    value={settings.openaiApiKey}
                    onChange={(e) => handleApiKeyChange('openaiApiKey', e.target.value)}
                  />
                </div>

                <div className={styles.apiKeyGroup}>
                  <label className={styles.apiKeyLabel}>
                    Claude
                    {renderValidationStatus(claudeStatus, !!settings.claudeApiKey)}
                  </label>
                  <input
                    type="password"
                    className={`${styles.apiKeyInput} ${claudeStatus === 'invalid' ? styles.inputInvalid : ''}`}
                    placeholder="Enter your Claude API key"
                    value={settings.claudeApiKey}
                    onChange={(e) => handleApiKeyChange('claudeApiKey', e.target.value)}
                  />
                </div>

                <p className={styles.apiKeyHint}>
                  Keys are stored locally in your browser only. We do not have access to your keys.
                  Always exercise caution when entering API keys on any website.
                </p>
              </>
            )}

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

      {showDeckSelector && (
        <motion.div
          className={styles.deckSelectorOverlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setShowDeckSelector(false)}
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
                  className={`${styles.deckOption} ${settings.deck === deck.value ? styles.deckSelected : ''}`}
                  onClick={() => {
                    onUpdateSetting('deck', deck.value);
                    setShowDeckSelector(false);
                  }}
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
