// MultiplayerLobby Component - Create or Join multiplayer games

import { useState, useEffect } from 'react';
import type { ConnectionStatus } from '../../multiplayer/types';
import styles from './MultiplayerLobby.module.css';

type LobbyMode = 'select' | 'create' | 'join';

const PRESET_SCORES = [11, 16, 21] as const;
const DEFAULT_NICKNAME = 'Player';
const NICKNAME_STORAGE_KEY = 'scopa-mp-nickname';

interface MultiplayerLobbyProps {
  // Connection state
  connectionStatus: ConnectionStatus;
  connectionError: string | null;

  // Pre-filled join code (from URL)
  initialJoinCode?: string;

  // Actions
  onCreateRoom: (nickname: string, targetScore: number, turnTimerEnabled: boolean) => void;
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
  onCreateRoom,
  onJoinRoom,
  onBack,
}: MultiplayerLobbyProps) {
  // If there's an initial join code, go straight to join mode
  const [mode, setMode] = useState<LobbyMode>(initialJoinCode ? 'join' : 'select');
  const [nickname, setNickname] = useState(loadSavedNickname);
  const [joinCode, setJoinCode] = useState(initialJoinCode || 'SCOPA-');
  const [targetScore, setTargetScore] = useState(11);
  const [turnTimerEnabled, setTurnTimerEnabled] = useState(false);

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
    onCreateRoom(nickname.trim(), targetScore, turnTimerEnabled);
  };

  const handleJoinRoom = () => {
    if (!nickname.trim() || !joinCode.trim()) return;
    onJoinRoom(joinCode.trim().toUpperCase(), nickname.trim());
  };

  const handleJoinCodeChange = (value: string) => {
    const upper = value.toUpperCase();
    // Ensure the SCOPA- prefix is always present
    if (!upper.startsWith('SCOPA-')) {
      setJoinCode('SCOPA-');
      return;
    }
    // Strip non-alphanumeric characters from the suffix
    const suffix = upper.slice(6).replace(/[^A-Z0-9]/g, '');
    // Limit to SCOPA- plus 4 character code
    setJoinCode('SCOPA-' + suffix.slice(0, 4));
  };

  // Selection screen
  if (mode === 'select') {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <h1 className={styles.title}>Multiplayer</h1>
          <p className={styles.subtitle}>Play Scopa with a friend online</p>

          <div className={styles.modeButtons}>
            <button
              className={styles.modeButton}
              onClick={() => setMode('create')}
            >
              <span className={styles.modeIcon}>+</span>
              <span className={styles.modeLabel}>Create Game</span>
              <span className={styles.modeDescription}>Start a new game and invite a friend</span>
            </button>

            <button
              className={styles.modeButton}
              onClick={() => setMode('join')}
            >
              <span className={styles.modeIcon}>#</span>
              <span className={styles.modeLabel}>Join Game</span>
              <span className={styles.modeDescription}>Enter a code to join an existing game</span>
            </button>
          </div>

          <button className={styles.backButton} onClick={onBack}>
            Back to Menu
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
          <h1 className={styles.title}>Create Game</h1>
          <p className={styles.subtitle}>Set up your game and share the code</p>

          <div className={styles.formGroup}>
            <label className={styles.label}>Your Nickname</label>
            <input
              type="text"
              className={styles.input}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Enter your nickname"
              maxLength={20}
              disabled={isDisabled}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Target Score</label>
            <div className={styles.scoreOptions}>
              {PRESET_SCORES.map((score) => (
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
                className={`${styles.customScoreInput} ${!PRESET_SCORES.includes(targetScore as 11 | 16 | 21) ? styles.selected : ''}`}
                value={!PRESET_SCORES.includes(targetScore as 11 | 16 | 21) ? targetScore : ''}
                placeholder="..."
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val >= 1) {
                    setTargetScore(val);
                  }
                }}
                disabled={isDisabled}
                title="Enter custom target score"
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.toggleRow}>
              <span className={styles.toggleLabel}>Turn Timer (60 seconds)</span>
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
                ? 'Opponent can force a random move if you run out of time'
                : 'No time limit per turn'}
            </p>
          </div>

          {connectionError && (
            <div className={styles.error}>{connectionError}</div>
          )}

          <button
            className={styles.primaryButton}
            onClick={handleCreateRoom}
            disabled={!nickname.trim() || isDisabled}
          >
            {isConnecting ? 'Creating...' : 'Create Game'}
          </button>

          <button
            className={styles.backButton}
            onClick={() => setMode('select')}
            disabled={isConnecting}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // Join game screen
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1 className={styles.title}>Join Game</h1>
        <p className={styles.subtitle}>Enter the game code shared by your friend</p>

        <div className={styles.formGroup}>
          <label className={styles.label}>Your Nickname</label>
          <input
            type="text"
            className={styles.input}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Enter your nickname"
            maxLength={20}
            disabled={isDisabled}
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>Game Code</label>
          <input
            type="text"
            className={`${styles.input} ${styles.codeInput}`}
            value={joinCode}
            onChange={(e) => handleJoinCodeChange(e.target.value)}
            placeholder="SCOPA-XXXX"
            maxLength={10}
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
          {isConnecting ? 'Joining...' : 'Join Game'}
        </button>

        <button
          className={styles.backButton}
          onClick={() => {
            setMode('select');
            setJoinCode('');
          }}
          disabled={isConnecting}
        >
          Back
        </button>
      </div>
    </div>
  );
}
