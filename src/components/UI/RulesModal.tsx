// Shared rules modal for Scopa and Briscola. The chrome (overlay, modal,
// title, close button, scroll behavior) is identical; only the inner
// content differs, so we branch on the `game` prop.

import { motion, AnimatePresence } from 'framer-motion';
import styles from './RulesModal.module.css';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  game?: 'scopa' | 'briscola';
}

export function RulesModal({ isOpen, onClose, game = 'scopa' }: RulesModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={styles.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className={styles.modal}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className={styles.title}>
              {game === 'briscola' ? 'How to play Briscola' : 'Scopa Rules'}
            </h2>

            <div className={styles.content}>
              {game === 'briscola' ? <BriscolaRules /> : <ScopaRules />}
            </div>

            <button className={styles.closeButton} onClick={onClose}>
              Got It
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ScopaRules() {
  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Overview</h3>
        <p>
          Scopa (Italian for "broom") is a classic Italian card game. The name refers to
          "sweeping" all cards from the table, which awards bonus points.
        </p>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>The Deck</h3>
        <p>
          40 cards in 4 suits: <strong>Coins</strong> (Denari), <strong>Cups</strong> (Coppe),
          <strong> Swords</strong> (Spade), <strong>Clubs</strong> (Bastoni).
        </p>
        <p>
          Each suit has Ace-7 plus three face cards: Fante (8), Cavallo (9), Re (10).
        </p>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Setup</h3>
        <ul>
          <li>Each player receives 3 cards</li>
          <li>4 cards are placed face-up on the table</li>
          <li>Players take turns playing one card</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Gameplay</h3>
        <p>On your turn, play one card to either:</p>
        <ul>
          <li><strong>Capture:</strong> Match a single table card OR sum of multiple cards</li>
          <li><strong>Place:</strong> If no capture is possible, add card to table</li>
        </ul>
        <p className={styles.rule}>
          <strong>Mandatory Capture:</strong> If you can capture, you must!
        </p>
        <p className={styles.rule}>
          <strong>Single Card Priority:</strong> A single match takes precedence over sums.
        </p>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Scopa (Sweep)</h3>
        <p>
          Clearing ALL cards from the table scores a <strong>Scopa</strong> (+1 point).
          Exception: No scopa on the last play of a round.
        </p>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Scoring</h3>
        <table className={styles.scoreTable}>
          <tbody>
            <tr>
              <td><strong>Carte</strong></td>
              <td>1 pt</td>
              <td>Most cards captured</td>
            </tr>
            <tr>
              <td><strong>Denari</strong></td>
              <td>1 pt</td>
              <td>Most Coins suit cards</td>
            </tr>
            <tr>
              <td><strong>Sette Bello</strong></td>
              <td>1 pt</td>
              <td>7 of Coins</td>
            </tr>
            <tr>
              <td><strong>Primiera</strong></td>
              <td>1 pt</td>
              <td>Best prime score</td>
            </tr>
            <tr>
              <td><strong>Scopa</strong></td>
              <td>1 pt each</td>
              <td>Each sweep</td>
            </tr>
          </tbody>
        </table>
        <p className={styles.note}>Ties award no points for that category.</p>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Primiera (Prime)</h3>
        <p>Sum the best card from each suit using prime values:</p>
        <div className={styles.primeValues}>
          <span>7=21</span>
          <span>6=18</span>
          <span>A=16</span>
          <span>5=15</span>
          <span>4=14</span>
          <span>3=13</span>
          <span>2=12</span>
          <span>8-10=10</span>
        </div>
        <p className={styles.note}>Must have at least one card from each suit to compete.</p>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Winning</h3>
        <p>
          First player to reach the target score (default: 11) wins!
        </p>
      </section>
    </>
  );
}

function BriscolaRules() {
  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Setup</h3>
        <p>
          40-card Italian deck (Coins, Cups, Swords, Clubs · values 1–10).
          Both players get <strong>3 cards</strong>. The next card flipped
          face-up beside the deck is the <strong>briscola</strong> (trump) —
          its suit beats any non-trump card for the whole round. The briscola
          is the last card drawn before the deck runs out.
        </p>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Tricks</h3>
        <p>
          The non-dealer leads. Each player plays one card. There's{' '}
          <strong>no follow-suit rule</strong> — play any card from hand.
        </p>
        <p>The trick is taken by:</p>
        <ul>
          <li>The higher trump, if any trump is played.</li>
          <li>The higher card of the <em>led suit</em>, if both follow it.</li>
          <li>Otherwise the lead card wins (off-suit non-trumps can't take).</li>
        </ul>
        <p>
          Within a suit, rank order is{' '}
          <strong>Ace · 3 · King · Knight · Knave · 7 · 6 · 5 · 4 · 2</strong>.
          Winner of the trick draws first, then the loser. Winner leads next.
        </p>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Scoring (per round)</h3>
        <table className={styles.scoreTable}>
          <tbody>
            <tr><td><strong>Ace (Asso)</strong></td><td>11</td><td></td></tr>
            <tr><td><strong>3 (Tre)</strong></td><td>10</td><td></td></tr>
            <tr><td><strong>King (Re)</strong></td><td>4</td><td></td></tr>
            <tr><td><strong>Knight (Cavallo)</strong></td><td>3</td><td></td></tr>
            <tr><td><strong>Knave (Fante)</strong></td><td>2</td><td></td></tr>
            <tr><td><strong>2, 4, 5, 6, 7</strong></td><td>0</td><td></td></tr>
          </tbody>
        </table>
        <p>
          30 points per suit, <strong>120 points total</strong> per round.
          Whoever takes more than 60 points wins the round; 60–60 is a tie.
        </p>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Match (Best of N)</h3>
        <p>
          A match is a set of rounds. Whoever wins more than half of them
          first takes the match — best of 3 needs 2 round wins, best of 5
          needs 3, and so on. Best of 1 is just a single round. Tied rounds
          don't count toward either side.
        </p>
      </section>
    </>
  );
}
