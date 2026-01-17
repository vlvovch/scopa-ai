// OpponentDisconnected Component - Overlay shown when opponent disconnects

import styles from './OpponentDisconnected.module.css';

interface OpponentDisconnectedProps {
  opponentNickname: string | null;
  onLeaveRoom: () => void;
}

export function OpponentDisconnected({
  opponentNickname,
  onLeaveRoom,
}: OpponentDisconnectedProps) {
  const displayName = opponentNickname || 'Opponent';

  return (
    <div className={styles.overlay}>
      <div className={styles.content}>
        <div className={styles.icon}>⚠️</div>
        <h2 className={styles.title}>{displayName} Disconnected</h2>
        <p className={styles.message}>
          Waiting for them to reconnect...
        </p>
        <div className={styles.spinner}></div>
        <p className={styles.hint}>
          The game will resume automatically when they reconnect
        </p>
        <button className={styles.leaveButton} onClick={onLeaveRoom}>
          Leave Game
        </button>
      </div>
    </div>
  );
}
