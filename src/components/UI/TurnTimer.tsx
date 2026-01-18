// TurnTimer Component - Display turn timer and force move button

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
            {isMyTurn ? 'Your Turn' : "Opponent's Turn"}
          </span>
          <span className={`${styles.timerValue} ${isCritical ? styles.critical : ''}`}>
            {secondsRemaining <= 0 ? 'Expired' : `${secondsRemaining}s`}
          </span>
        </div>
      </div>

      {canForceMove && !isMyTurn && (
        <button className={styles.forceButton} onClick={onForceMove}>
          Force Random Move
        </button>
      )}
    </div>
  );
}
