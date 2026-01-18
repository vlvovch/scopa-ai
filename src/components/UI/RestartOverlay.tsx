// RestartOverlay Component - Shows restart request status in multiplayer

import styles from './RestartOverlay.module.css';

interface RestartOverlayProps {
  /** Who requested the restart (null if no request pending) */
  requestedBy: 'self' | 'opponent' | null;
  /** Opponent's nickname */
  opponentNickname: string;
  /** Callback when user requests/accepts restart */
  onRequestRestart: () => void;
  /** Callback to cancel the request */
  onCancel: () => void;
}

export function RestartOverlay({
  requestedBy,
  opponentNickname,
  onRequestRestart,
  onCancel,
}: RestartOverlayProps) {
  if (!requestedBy) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.content}>
        {requestedBy === 'self' ? (
          <>
            <div className={styles.icon}>🔄</div>
            <h3 className={styles.title}>Restart Requested</h3>
            <p className={styles.message}>
              Waiting for {opponentNickname} to accept...
            </p>
            <div className={styles.spinner}></div>
            <button className={styles.cancelButton} onClick={onCancel}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <div className={styles.icon}>🔄</div>
            <h3 className={styles.title}>{opponentNickname} wants to restart</h3>
            <p className={styles.message}>
              Do you want to restart the game from the beginning?
            </p>
            <div className={styles.buttons}>
              <button className={styles.acceptButton} onClick={onRequestRestart}>
                Accept
              </button>
              <button className={styles.declineButton} onClick={onCancel}>
                Decline
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
