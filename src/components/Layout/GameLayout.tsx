// Step 7.8: GameLayout Component

import type { ReactNode } from 'react';
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
  return (
    <div className={styles.gameLayout}>
      <div className={styles.scoreBoardArea}>{scoreBoard}</div>
      <div className={styles.cpuArea}>{cpuHand}</div>
      <div className={styles.cpuPileArea}>{cpuPile}</div>

      <div className={styles.tableArea}>{tableCards}</div>

      <div className={styles.humanPileArea}>{humanPile}</div>
      <div className={styles.humanArea}>{humanHand}</div>
      <div className={styles.controlsArea}>{controls}</div>

      <footer className={styles.footer}>
        © 2026 <a href="https://github.com/vlvovch" target="_blank" rel="noopener noreferrer">Volodymyr Vovchenko</a>. Built with help from <a href="https://claude.ai/code" target="_blank" rel="noopener noreferrer">Claude Code</a>
      </footer>
    </div>
  );
}
