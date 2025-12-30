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
  // Helper to format primiera score
  const formatPrime = (prime: number | null) => prime !== null ? prime.toString() : '-';

  // Categories with counts and winner highlighting
  const categories = [
    {
      name: 'Carte',
      humanCount: humanScore.counts.cards,
      cpuCount: cpuScore.counts.cards,
      humanWon: humanScore.cards > 0,
      cpuWon: cpuScore.cards > 0,
    },
    {
      name: 'Denari',
      humanCount: humanScore.counts.coins,
      cpuCount: cpuScore.counts.coins,
      humanWon: humanScore.coins > 0,
      cpuWon: cpuScore.coins > 0,
    },
    {
      name: 'Sette Bello',
      humanCount: humanScore.setteBello > 0 ? '✓' : '-',
      cpuCount: cpuScore.setteBello > 0 ? '✓' : '-',
      humanWon: humanScore.setteBello > 0,
      cpuWon: cpuScore.setteBello > 0,
      isCheckmark: true,
    },
    {
      name: 'Primiera',
      humanCount: formatPrime(humanScore.counts.prime),
      cpuCount: formatPrime(cpuScore.counts.prime),
      humanWon: humanScore.prime > 0,
      cpuWon: cpuScore.prime > 0,
    },
    {
      name: 'Scopa',
      humanCount: humanScore.scopas || '-',
      cpuCount: cpuScore.scopas || '-',
      humanWon: humanScore.scopas > cpuScore.scopas,
      cpuWon: cpuScore.scopas > humanScore.scopas,
    },
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
                <td className={cat.humanWon ? styles.winner : ''}>
                  {cat.humanCount}
                </td>
                <td className={cat.cpuWon ? styles.winner : ''}>
                  {cat.cpuCount}
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
