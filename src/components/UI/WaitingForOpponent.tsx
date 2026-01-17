// WaitingForOpponent Component - Waiting room after creating a game

import { useState, useCallback } from 'react';
import styles from './WaitingForOpponent.module.css';

interface WaitingForOpponentProps {
  roomCode: string;
  nickname: string;
  targetScore: number;
  turnTimerEnabled: boolean;
  onUpdateNickname: (nickname: string) => void;
  onLeaveRoom: () => void;
}

export function WaitingForOpponent({
  roomCode,
  nickname,
  targetScore,
  turnTimerEnabled,
  onUpdateNickname,
  onLeaveRoom,
}: WaitingForOpponentProps) {
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [editedNickname, setEditedNickname] = useState(nickname);
  const [copied, setCopied] = useState(false);

  // Generate the share URL
  const shareUrl = `${window.location.origin}/join/${roomCode}`;

  const handleCopyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback - select the text for manual copy
      const codeElement = document.querySelector(`.${styles.roomCode}`) as HTMLElement;
      if (codeElement) {
        const range = document.createRange();
        range.selectNodeContents(codeElement);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
  }, [roomCode]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers that don't support clipboard API
      const input = document.createElement('input');
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [shareUrl]);

  const handleNicknameSubmit = () => {
    if (editedNickname.trim() && editedNickname !== nickname) {
      onUpdateNickname(editedNickname.trim());
    }
    setIsEditingNickname(false);
  };

  const handleNicknameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNicknameSubmit();
    } else if (e.key === 'Escape') {
      setEditedNickname(nickname);
      setIsEditingNickname(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1 className={styles.title}>Waiting for Opponent</h1>
        <p className={styles.subtitle}>Share the code below with your friend</p>

        {/* Room Code Display */}
        <div className={styles.codeSection}>
          <span className={styles.codeLabel}>Game Code</span>
          <div className={styles.codeDisplay}>
            <span className={styles.roomCode}>{roomCode}</span>
            <button
              className={styles.copyButton}
              onClick={handleCopyCode}
              title="Copy code"
            >
              {copied ? '✓' : '📋'}
            </button>
          </div>
        </div>

        {/* Share Link */}
        <div className={styles.linkSection}>
          <span className={styles.linkLabel}>Or share this link</span>
          <div className={styles.linkDisplay}>
            <span className={styles.shareLink}>{shareUrl}</span>
            <button
              className={styles.copyButton}
              onClick={handleCopyLink}
              title="Copy link"
            >
              {copied ? '✓' : '📋'}
            </button>
          </div>
        </div>

        {/* Waiting indicator */}
        <div className={styles.waitingIndicator}>
          <div className={styles.spinner}></div>
          <span>Waiting for opponent to join...</span>
        </div>

        {/* Game Settings Summary */}
        <div className={styles.settingsSummary}>
          <div className={styles.settingItem}>
            <span className={styles.settingLabel}>Target Score</span>
            <span className={styles.settingValue}>{targetScore}</span>
          </div>
          <div className={styles.settingItem}>
            <span className={styles.settingLabel}>Turn Timer</span>
            <span className={styles.settingValue}>
              {turnTimerEnabled ? '60 seconds' : 'Off'}
            </span>
          </div>
        </div>

        {/* Nickname editor */}
        <div className={styles.nicknameSection}>
          <span className={styles.nicknameLabel}>Your Nickname</span>
          {isEditingNickname ? (
            <div className={styles.nicknameEditor}>
              <input
                type="text"
                className={styles.nicknameInput}
                value={editedNickname}
                onChange={(e) => setEditedNickname(e.target.value)}
                onKeyDown={handleNicknameKeyDown}
                onBlur={handleNicknameSubmit}
                maxLength={20}
                autoFocus
              />
            </div>
          ) : (
            <button
              className={styles.nicknameDisplay}
              onClick={() => {
                setEditedNickname(nickname);
                setIsEditingNickname(true);
              }}
            >
              {nickname}
              <span className={styles.editIcon}>✏️</span>
            </button>
          )}
        </div>

        <button className={styles.leaveButton} onClick={onLeaveRoom}>
          Cancel & Leave Room
        </button>
      </div>
    </div>
  );
}
