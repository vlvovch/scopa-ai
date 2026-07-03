// GameLayout Component - Centered playing area with aligned elements

import type { ReactNode } from 'react';
import { useT } from '../../i18n/LanguageContext';
import styles from './GameLayout.module.css';

interface GameLayoutProps {
  /** CPU hand area content */
  cpuHand: ReactNode;
  /** Human hand area content */
  humanHand: ReactNode;
  /** Table cards area content */
  tableCards: ReactNode;
  /** Score board content */
  scoreBoard: ReactNode;
  /** CPU captured pile content */
  cpuPile: ReactNode;
  /** Human captured pile content */
  humanPile: ReactNode;
  /** Optional controls area content */
  controls?: ReactNode;
}

export function GameLayout({
  cpuHand,
  humanHand,
  tableCards,
  scoreBoard,
  cpuPile,
  humanPile,
  controls,
}: GameLayoutProps) {
  const t = useT();
  return (
    <div className={styles.gameLayout}>
      {/* Top row: scoreboard left, CPU pile right - aligned with playing area */}
      <div className={styles.topRow}>
        <div className={styles.scoreBoardArea}>{scoreBoard}</div>
        <div className={styles.cpuPileArea}>{cpuPile}</div>
      </div>

      {/* Center column: CPU hand, playing area, human hand */}
      <div className={styles.centerColumn}>
        <div className={styles.cpuArea}>{cpuHand}</div>
        <div className={styles.tableArea}>{tableCards}</div>
        <div className={styles.humanArea}>{humanHand}</div>
      </div>

      {/* Bottom row: human pile left, controls right - aligned with playing area */}
      <div className={styles.bottomRow}>
        <div className={styles.humanPileArea}>{humanPile}</div>
        <div className={styles.controlsArea}>{controls}</div>
      </div>

      <footer className={styles.footer}>
        © 2026 <a href="https://github.com/vlvovch" target="_blank" rel="noopener noreferrer">Volodymyr Vovchenko</a> | <a href="https://github.com/vlvovch/scopa-ai" target="_blank" rel="noopener noreferrer">GitHub</a>. {t.start.builtWithPrefix}<a href="https://claude.ai/code" target="_blank" rel="noopener noreferrer">Claude Code</a>.
      </footer>
    </div>
  );
}
