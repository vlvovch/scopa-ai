// MultiplayerLobby Component - Create or Join multiplayer games.
// Shared between Scopa and Briscola: caller passes a `gameConfig` with the
// game-specific room prefix, name, target-score presets, and score label.

import { useState, useEffect } from 'react';
import { useT } from '../../i18n/LanguageContext';
import styles from './MultiplayerLobby.module.css';

// Structurally identical to the per-game ConnectionStatus union; inlined
// so the shared component doesn't import from one game's types module.
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

type LobbyMode = 'select' | 'create' | 'join';

const DEFAULT_NICKNAME = 'Player';
const NICKNAME_STORAGE_KEY = 'mp-nickname';

/** Per-game lobby configuration. */
export interface LobbyGameConfig {
  /** Game name for UI ('Scopa', 'Briscola'). */
  gameName: string;
  /** Room code prefix ('SCOPA', 'BRISCOLA'). The full code is `${prefix}-XXXX`. */
  gameCodePrefix: string;
  /** Target-score preset buttons (e.g. [11, 16, 21] points, or [1, 3, 5] rounds). */
  presetScores: readonly number[];
  /** Default selected target-score value. */
  defaultScore: number;
  /** Label shown above the score picker ('Target Score', 'Best of N'). */
  scoreLabel: string;
  /** Optional extra create-game toggles (e.g. captured-pile review,
   *  pile stats). Game-agnostic: each game declares whatever it needs;
   *  the lobby renders a switch per entry and reports their states back
   *  through onCreateRoom's roomOptions record (keyed by `key`). */
  extraToggles?: ExtraToggle[];
  /** Supported room sizes. Omit for the legacy two-player flow. */
  playerCountOptions?: readonly number[];
  defaultPlayerCount?: number;
}

/** One host-configurable create-game switch. */
export interface ExtraToggle {
  /** Stable identifier; the boolean is reported under this key in the
   *  roomOptions record passed to onCreateRoom. */
  key: string;
  /** Toggle row label, e.g. "Captured-pile review". */
  label: string;
  /** Helper text shown under the toggle (on/off variants). */
  hintOn: string;
  hintOff: string;
  /** Initial state of the toggle. */
  defaultValue: boolean;
}

interface MultiplayerLobbyProps {
  // Connection state
  connectionStatus: ConnectionStatus;
  connectionError: string | null;

  // Pre-filled join code (from URL)
  initialJoinCode?: string;

  // Per-game configuration
  config: LobbyGameConfig;

  // Actions
  onCreateRoom: (
    nickname: string,
    targetScore: number,
    turnTimerEnabled: boolean,
    /** Booleans for each config.extraToggles entry, keyed by toggle key.
     *  Final, future-proof arg — new toggles need no signature change. */
    roomOptions: Record<string, boolean | number>
  ) => void;
  onJoinRoom: (code: string, nickname: string) => void;
  onBack: () => void;
}

function loadSavedNickname(): string {
  try {
    const saved = localStorage.getItem(NICKNAME_STORAGE_KEY);
    if (saved) return saved;
  } catch {
    // localStorage not available
  }
  return DEFAULT_NICKNAME;
}

function saveNickname(nickname: string) {
  try {
    localStorage.setItem(NICKNAME_STORAGE_KEY, nickname);
  } catch {
    // localStorage not available
  }
}

export function MultiplayerLobby({
  connectionStatus,
  connectionError,
  initialJoinCode,
  config,
  onCreateRoom,
  onJoinRoom,
  onBack,
}: MultiplayerLobbyProps) {
  const t = useT();
  const codePrefix = `${config.gameCodePrefix}-`;
  // If there's an initial join code, go straight to join mode
  const [mode, setMode] = useState<LobbyMode>(initialJoinCode ? 'join' : 'select');
  const [nickname, setNickname] = useState(loadSavedNickname);
  const [joinCode, setJoinCode] = useState(initialJoinCode || codePrefix);
  const [targetScore, setTargetScore] = useState(config.defaultScore);
  const [turnTimerEnabled, setTurnTimerEnabled] = useState(false);
  const [playerCount, setPlayerCount] = useState(
    config.defaultPlayerCount ?? config.playerCountOptions?.[0] ?? 2
  );
  // One boolean per extra toggle, keyed by toggle.key, seeded from
  // each toggle's defaultValue.
  const [toggleStates, setToggleStates] = useState<Record<string, boolean>>(
    () =>
      Object.fromEntries(
        (config.extraToggles ?? []).map((t) => [t.key, t.defaultValue])
      )
  );

  // Save nickname when it changes
  useEffect(() => {
    if (nickname.trim()) {
      saveNickname(nickname);
    }
  }, [nickname]);

  const isConnecting = connectionStatus === 'connecting' || connectionStatus === 'reconnecting';
  // Only disable inputs while actively connecting, not when just connected
  // This allows users to edit and retry after a failed join attempt
  const isDisabled = isConnecting;

  const handleCreateRoom = () => {
    if (!nickname.trim()) return;
    onCreateRoom(nickname.trim(), targetScore, turnTimerEnabled, {
      ...toggleStates,
      maxPlayers: playerCount,
    });
  };

  const handleJoinRoom = () => {
    if (!nickname.trim() || !joinCode.trim()) return;
    onJoinRoom(joinCode.trim().toUpperCase(), nickname.trim());
  };

  const handleJoinCodeChange = (value: string) => {
    const upper = value.toUpperCase();
    // Ensure the game-specific prefix is always present
    if (!upper.startsWith(codePrefix)) {
      setJoinCode(codePrefix);
      return;
    }
    // Strip non-alphanumeric characters from the suffix
    const suffix = upper.slice(codePrefix.length).replace(/[^A-Z0-9]/g, '');
    // Limit to prefix plus 4 character code
    setJoinCode(codePrefix + suffix.slice(0, 4));
  };

  // Selection screen
  if (mode === 'select') {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <h1 className={styles.title}>{t.lobby.title}</h1>
          <p className={styles.subtitle}>{t.lobby.playWithFriend(config.gameName)}</p>

          <div className={styles.modeButtons}>
            <button
              className={styles.modeButton}
              onClick={() => setMode('create')}
            >
              <span className={styles.modeIcon}>+</span>
              <span className={styles.modeLabel}>{t.lobby.createGame}</span>
              <span className={styles.modeDescription}>{t.lobby.createDescription}</span>
            </button>

            <button
              className={styles.modeButton}
              onClick={() => setMode('join')}
            >
              <span className={styles.modeIcon}>#</span>
              <span className={styles.modeLabel}>{t.lobby.joinGame}</span>
              <span className={styles.modeDescription}>{t.lobby.joinDescription}</span>
            </button>
          </div>

          <button className={styles.backButton} onClick={onBack}>
            {t.lobby.backToMenu}
          </button>
        </div>
      </div>
    );
  }

  // Create game screen
  if (mode === 'create') {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <h1 className={styles.title}>{t.lobby.createGame}</h1>
          <p className={styles.subtitle}>{t.lobby.createSubtitle}</p>

          <div className={styles.formGroup}>
            <label className={styles.label}>{t.multiplayer.yourNickname}</label>
            <input
              type="text"
              className={styles.input}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={t.lobby.enterNickname}
              maxLength={20}
              disabled={isDisabled}
            />
          </div>

          {config.playerCountOptions && (
            <div className={styles.formGroup}>
              <label className={styles.label}>Players</label>
              <div className={styles.scoreOptions}>
                {config.playerCountOptions.map((count) => (
                  <button
                    key={count}
                    className={`${styles.scoreOption} ${playerCount === count ? styles.selected : ''}`}
                    onClick={() => setPlayerCount(count)}
                    disabled={isDisabled}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={styles.formGroup}>
            <label className={styles.label}>{config.scoreLabel}</label>
            <div className={styles.scoreOptions}>
              {config.presetScores.map((score) => (
                <button
                  key={score}
                  className={`${styles.scoreOption} ${targetScore === score ? styles.selected : ''}`}
                  onClick={() => setTargetScore(score)}
                  disabled={isDisabled}
                >
                  {score}
                </button>
              ))}
              <input
                type="number"
                min="1"
                max="999"
                className={`${styles.customScoreInput} ${!config.presetScores.includes(targetScore) ? styles.selected : ''}`}
                value={!config.presetScores.includes(targetScore) ? targetScore : ''}
                placeholder="..."
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val >= 1) {
                    setTargetScore(val);
                  }
                }}
                disabled={isDisabled}
                title={t.lobby.customScore}
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.toggleRow}>
              <span className={styles.toggleLabel}>{t.lobby.turnTimer60}</span>
              <button
                className={`${styles.toggle} ${turnTimerEnabled ? styles.toggleEnabled : ''}`}
                onClick={() => setTurnTimerEnabled(!turnTimerEnabled)}
                disabled={isDisabled}
                type="button"
              >
                <span className={styles.toggleSlider} />
              </button>
            </label>
            <p className={styles.toggleHint}>
              {turnTimerEnabled
                ? t.lobby.timerOnHint
                : t.lobby.timerOffHint}
            </p>
          </div>

          {(config.extraToggles ?? []).map((t) => {
            const on = toggleStates[t.key] ?? t.defaultValue;
            return (
              <div className={styles.formGroup} key={t.key}>
                <label className={styles.toggleRow}>
                  <span className={styles.toggleLabel}>{t.label}</span>
                  <button
                    className={`${styles.toggle} ${on ? styles.toggleEnabled : ''}`}
                    onClick={() =>
                      setToggleStates((prev) => ({ ...prev, [t.key]: !on }))
                    }
                    disabled={isDisabled}
                    type="button"
                  >
                    <span className={styles.toggleSlider} />
                  </button>
                </label>
                <p className={styles.toggleHint}>
                  {on ? t.hintOn : t.hintOff}
                </p>
              </div>
            );
          })}

          {connectionError && (
            <div className={styles.error}>{connectionError}</div>
          )}

          <button
            className={styles.primaryButton}
            onClick={handleCreateRoom}
            disabled={!nickname.trim() || isDisabled}
          >
            {isConnecting ? t.lobby.creating : t.lobby.createGame}
          </button>

          <button
            className={styles.backButton}
            onClick={() => setMode('select')}
            disabled={isConnecting}
          >
            {t.lobby.back}
          </button>
        </div>
      </div>
    );
  }

  // Join game screen
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1 className={styles.title}>{t.lobby.joinGame}</h1>
        <p className={styles.subtitle}>{t.lobby.joinSubtitle}</p>

        <div className={styles.formGroup}>
          <label className={styles.label}>{t.multiplayer.yourNickname}</label>
          <input
            type="text"
            className={styles.input}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder={t.lobby.enterNickname}
            maxLength={20}
            disabled={isDisabled}
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>{t.multiplayer.gameCode}</label>
          <input
            type="text"
            className={`${styles.input} ${styles.codeInput}`}
            value={joinCode}
            onChange={(e) => handleJoinCodeChange(e.target.value)}
            placeholder={`${codePrefix}XXXX`}
            maxLength={codePrefix.length + 4}
            disabled={isDisabled}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {connectionError && (
          <div className={styles.error}>{connectionError}</div>
        )}

        <button
          className={styles.primaryButton}
          onClick={handleJoinRoom}
          disabled={!nickname.trim() || !joinCode.trim() || isDisabled}
        >
          {isConnecting ? t.lobby.joining : t.lobby.joinGame}
        </button>

        <button
          className={styles.backButton}
          onClick={() => {
            setMode('select');
            setJoinCode('');
          }}
          disabled={isConnecting}
        >
          {t.lobby.back}
        </button>
      </div>
    </div>
  );
}
