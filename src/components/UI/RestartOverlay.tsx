// RestartOverlay Component - Shows restart request status in multiplayer

import { useT } from '../../i18n/LanguageContext';
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
  const t = useT();
  if (!requestedBy) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.content}>
        {requestedBy === 'self' ? (
          <>
            <div className={styles.icon}>🔄</div>
            <h3 className={styles.title}>{t.multiplayer.restartRequested}</h3>
            <p className={styles.message}>
              {t.multiplayer.waitingAccept(opponentNickname)}
            </p>
            <div className={styles.spinner}></div>
            <button className={styles.cancelButton} onClick={onCancel}>
              {t.common.cancel}
            </button>
          </>
        ) : (
          <>
            <div className={styles.icon}>🔄</div>
            <h3 className={styles.title}>{t.multiplayer.wantsRestart(opponentNickname)}</h3>
            <p className={styles.message}>
              {t.multiplayer.restartPrompt}
            </p>
            <div className={styles.buttons}>
              <button className={styles.acceptButton} onClick={onRequestRestart}>
                {t.multiplayer.accept}
              </button>
              <button className={styles.declineButton} onClick={onCancel}>
                {t.multiplayer.decline}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
