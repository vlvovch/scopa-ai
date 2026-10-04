// TurnTimer Component - Display turn timer and force move button

import { useT } from '../../i18n/LanguageContext';
import styles from './TurnTimer.module.css';

interface TurnTimerProps {
  secondsRemaining: number;
  isMyTurn: boolean;
  canForceMove: boolean;
  onForceMove: () => void;
}

export function TurnTimer({
  secondsRemaining,
  isMyTurn,
  canForceMove,
  onForceMove,
}: TurnTimerProps) {
  const t = useT();
  // Calculate progress percentage (assuming 60 second timer)
  const maxTime = 60;
  const progress = Math.max(0, Math.min(100, (secondsRemaining / maxTime) * 100));

  // Determine urgency level for styling
  const isUrgent = secondsRemaining <= 10;
  const isCritical = secondsRemaining <= 5;

  return (
    <div className={styles.container}>
      <div className={styles.timerWrapper}>
        <div
          className={`${styles.timerBar} ${isUrgent ? styles.urgent : ''} ${isCritical ? styles.critical : ''}`}
          style={{ width: `${progress}%` }}
        />
        <div className={styles.timerContent}>
          <span className={styles.timerLabel}>
            {isMyTurn ? t.multiplayer.timerYourTurn : t.multiplayer.timerOpponentTurn}
          </span>
          <span className={`${styles.timerValue} ${isCritical ? styles.critical : ''}`}>
            {secondsRemaining <= 0 ? t.multiplayer.timerExpired : `${secondsRemaining}s`}
          </span>
        </div>
      </div>

      {canForceMove && !isMyTurn && (
        <button className={styles.forceButton} onClick={onForceMove}>
          {t.multiplayer.forceRandomMove}
        </button>
      )}
    </div>
  );
}
