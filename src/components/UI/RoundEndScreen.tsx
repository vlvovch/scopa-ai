// Step 8.4: RoundEndScreen Component

import type { RoundScore } from '../../game/types';
import styles from './RoundEndScreen.module.css';

interface RoundEndScreenProps {
  roundNumber: number;
  humanScore: RoundScore;
  cpuScore: RoundScore;
  cumulativeHuman: number;
  cumulativeCpu: number;
  onNextRound: () => void;
}

export function RoundEndScreen({
  roundNumber,
  humanScore,
  cpuScore,
  cumulativeHuman,
  cumulativeCpu,
  onNextRound,
}: RoundEndScreenProps) {
  // Categories with Italian names
  const categories = [
    { name: 'Carte', human: humanScore.cards, cpu: cpuScore.cards, isCheckmark: false },
    { name: 'Denari', human: humanScore.coins, cpu: cpuScore.coins, isCheckmark: false },
    { name: 'Sette Bello', human: humanScore.setteBello, cpu: cpuScore.setteBello, isCheckmark: true },
    { name: 'Primiera', human: humanScore.prime, cpu: cpuScore.prime, isCheckmark: false },
    { name: 'Scope', human: humanScore.scopas, cpu: cpuScore.scopas, isCheckmark: false },
  ];

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2 className={styles.title}>Round {roundNumber} Complete</h2>

        <table className={styles.scoreTable}>
          <thead>
            <tr>
              <th>Category</th>
              <th>You</th>
              <th>CPU</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => (
              <tr key={cat.name}>
                <td>{cat.name}</td>
                <td className={cat.human > cat.cpu ? styles.winner : ''}>
                  {cat.isCheckmark
                    ? (cat.human > 0 ? '✓' : '-')
                    : (cat.human > 0 ? cat.human : '-')
                  }
                </td>
                <td className={cat.cpu > cat.human ? styles.winner : ''}>
                  {cat.isCheckmark
                    ? (cat.cpu > 0 ? '✓' : '-')
                    : (cat.cpu > 0 ? cat.cpu : '-')
                  }
                </td>
              </tr>
            ))}
            <tr className={styles.totalRow}>
              <td>Round Total</td>
              <td className={humanScore.total > cpuScore.total ? styles.winner : ''}>
                +{humanScore.total}
              </td>
              <td className={cpuScore.total > humanScore.total ? styles.winner : ''}>
                +{cpuScore.total}
              </td>
            </tr>
          </tbody>
        </table>

        <div className={styles.cumulativeScores}>
          <div className={styles.scoreBox}>
            <span className={styles.scoreLabel}>Your Score</span>
            <span className={styles.scoreValue}>{cumulativeHuman}</span>
          </div>
          <span className={styles.scoreDivider}>-</span>
          <div className={styles.scoreBox}>
            <span className={styles.scoreLabel}>CPU Score</span>
            <span className={styles.scoreValue}>{cumulativeCpu}</span>
          </div>
        </div>

        <button className={styles.nextButton} onClick={onNextRound}>
          Next Round
        </button>
      </div>
    </div>
  );
}
