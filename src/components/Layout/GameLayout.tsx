// GameLayout Component - Centered playing area with aligned elements

import { useRef, type ReactNode } from 'react';
import { useFitBelowHand } from './useFitBelowHand';
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
  /** Optional content for the slot under the human hand (the analysis
   *  panel). The slot is out of flow, so the content never moves the
   *  cards. It hangs right under the hand, where the content is asked to
   *  shrink as far as the room requires (`data-fit` on the slot, see
   *  useFitBelowHand); on phones held upright that room is also bounded
   *  by the pile and the controls, which the content keeps clear of. */
  belowHand?: ReactNode;
}

export function GameLayout({
  cpuHand,
  humanHand,
  tableCards,
  scoreBoard,
  cpuPile,
  humanPile,
  controls,
  belowHand,
}: GameLayoutProps) {
  const layoutRef = useRef<HTMLDivElement>(null);
  const belowHandRef = useRef<HTMLDivElement>(null);
  const bottomRowRef = useRef<HTMLDivElement>(null);
  const humanPileRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  useFitBelowHand({
    layout: layoutRef,
    slot: belowHandRef,
    bottomRow: bottomRowRef,
    pile: humanPileRef,
    controls: controlsRef,
    footer: footerRef,
  });

  return (
    <div className={styles.gameLayout} ref={layoutRef}>
      {/* Top row: scoreboard left, CPU pile right - aligned with playing area */}
      <div className={styles.topRow}>
        <div className={styles.scoreBoardArea}>{scoreBoard}</div>
        <div className={styles.cpuPileArea}>{cpuPile}</div>
      </div>

      {/* Center column: CPU hand, playing area, human hand */}
      <div className={styles.centerColumn}>
        <div className={styles.cpuArea}>{cpuHand}</div>
        <div className={styles.tableArea}>{tableCards}</div>
        <div className={styles.humanArea}>
          {humanHand}
          {belowHand && (
            <div className={styles.belowHand} ref={belowHandRef}>
              {belowHand}
            </div>
          )}
        </div>
      </div>

      {/* Bottom row: human pile left, controls right - aligned with playing area */}
      <div className={styles.bottomRow} ref={bottomRowRef}>
        <div className={styles.humanPileArea} ref={humanPileRef}>{humanPile}</div>
        <div className={styles.controlsArea} ref={controlsRef}>{controls}</div>
      </div>

      <footer className={styles.footer} ref={footerRef}>
        © 2026 VV Labs | <a href="https://github.com/vlvovch/scopa-ai" target="_blank" rel="noopener noreferrer">GitHub</a>.
      </footer>
    </div>
  );
}
