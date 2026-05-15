// Briscola rules modal — static reference for trump hierarchy, in-suit
// ordering, point values, and match flow. Reuses Scopa's
// SettingsModal.module.css for the modal chrome.

import { motion, AnimatePresence } from 'framer-motion';
import settingsStyles from '../../components/UI/SettingsModal.module.css';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RulesModal({ isOpen, onClose }: RulesModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={settingsStyles.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className={settingsStyles.modal}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className={settingsStyles.title}>How to play Briscola</h2>

            <section style={section}>
              <h3 style={sectionHeading}>Setup</h3>
              <p style={paragraph}>
                40-card Italian deck (Coins, Cups, Swords, Clubs · values 1–10).
                Both players get <strong>3 cards</strong>. The next card flipped
                face-up beside the deck is the <strong>briscola</strong> (trump)
                — its suit beats any non-trump card for the whole round. The
                briscola is the last card drawn before the deck runs out.
              </p>
            </section>

            <section style={section}>
              <h3 style={sectionHeading}>Tricks</h3>
              <p style={paragraph}>
                The non-dealer leads. Each player plays one card. There's
                <strong> no follow-suit rule</strong> — play any card from hand.
              </p>
              <p style={paragraph}>
                The trick is taken by:
              </p>
              <ul style={list}>
                <li>The higher trump, if any trump is played.</li>
                <li>The higher card of the <em>led suit</em>, if both follow it.</li>
                <li>Otherwise the lead card wins (off-suit non-trumps can't take).</li>
              </ul>
              <p style={paragraph}>
                Within a suit, rank order is{' '}
                <strong>Ace · 3 · King · Knight · Knave · 7 · 6 · 5 · 4 · 2</strong>.
                Winner of the trick draws first, then the loser. Winner leads next.
              </p>
            </section>

            <section style={section}>
              <h3 style={sectionHeading}>Scoring (per round)</h3>
              <table style={pointTable}>
                <thead>
                  <tr>
                    <th style={pointTh}>Card</th>
                    <th style={pointThNum}>Points</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td style={pointTd}>Ace (Asso)</td><td style={pointTdNum}>11</td></tr>
                  <tr><td style={pointTd}>3 (Tre)</td><td style={pointTdNum}>10</td></tr>
                  <tr><td style={pointTd}>King (Re)</td><td style={pointTdNum}>4</td></tr>
                  <tr><td style={pointTd}>Knight (Cavallo)</td><td style={pointTdNum}>3</td></tr>
                  <tr><td style={pointTd}>Knave (Fante)</td><td style={pointTdNum}>2</td></tr>
                  <tr><td style={pointTd}>2, 4, 5, 6, 7</td><td style={pointTdNum}>0</td></tr>
                </tbody>
              </table>
              <p style={paragraph}>
                30 points per suit, <strong>120 points total</strong> per round.
                Whoever takes more than 60 points wins the round; 60–60 is a tie.
              </p>
            </section>

            <section style={section}>
              <h3 style={sectionHeading}>Match (Best of N)</h3>
              <p style={paragraph}>
                Each match is best-of-N rounds. First to{' '}
                <code>⌊N/2⌋ + 1</code> round wins takes the match. Best of 1 is a
                single round; tied rounds don't count toward anyone's score.
              </p>
            </section>

            <div className={settingsStyles.actions}>
              <button
                type="button"
                className={settingsStyles.resetButton}
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const section: React.CSSProperties = {
  marginBottom: '1rem',
};

const sectionHeading: React.CSSProperties = {
  fontSize: '0.85rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--color-accent)',
  margin: '0 0 0.5rem',
};

const paragraph: React.CSSProperties = {
  fontSize: '0.9rem',
  lineHeight: 1.5,
  margin: '0.4rem 0',
  color: 'var(--color-text-primary)',
};

const list: React.CSSProperties = {
  fontSize: '0.9rem',
  lineHeight: 1.5,
  margin: '0.4rem 0',
  paddingLeft: '1.25rem',
  color: 'var(--color-text-primary)',
};

const pointTable: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.85rem',
  marginTop: '0.5rem',
};

const pointTh: React.CSSProperties = {
  textAlign: 'left',
  padding: '4px 8px',
  borderBottom: '1px solid rgba(255,255,255,0.15)',
  color: 'var(--color-text-secondary)',
  fontWeight: 500,
};

const pointThNum: React.CSSProperties = {
  ...pointTh,
  textAlign: 'right',
};

const pointTd: React.CSSProperties = {
  padding: '4px 8px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
};

const pointTdNum: React.CSSProperties = {
  ...pointTd,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
};
