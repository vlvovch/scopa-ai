// OpponentDisconnected Component - Overlay shown when opponent disconnects

import { useT } from '../../i18n/LanguageContext';
import styles from './OpponentDisconnected.module.css';

interface OpponentDisconnectedProps {
  opponentNickname: string | null;
  onLeaveRoom: () => void;
}

export function OpponentDisconnected({
  opponentNickname,
  onLeaveRoom,
}: OpponentDisconnectedProps) {
  const t = useT();
  const displayName = opponentNickname || t.common.opponent;

  return (
    <div className={styles.overlay}>
      <div className={styles.content}>
        <div className={styles.icon}>⚠️</div>
        <h2 className={styles.title}>{t.multiplayer.disconnected(displayName)}</h2>
        <p className={styles.message}>
          {t.multiplayer.waitingReconnect}
        </p>
        <div className={styles.spinner}></div>
        <p className={styles.hint}>
          {t.multiplayer.resumeAuto}
        </p>
        <button className={styles.leaveButton} onClick={onLeaveRoom}>
          {t.multiplayer.leaveGame}
        </button>
      </div>
    </div>
  );
}
