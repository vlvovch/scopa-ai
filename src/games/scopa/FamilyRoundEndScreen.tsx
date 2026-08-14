import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { CardImage } from '../../components/Card/CardImage';
import { PRIME_VALUES, SUITS } from './constants';
import type { Card, RoundScore } from './types';
import type { FamilyPlayerId, FamilyVisibleGameState } from './multiplayer/types';
import styles from './FamilyRoundEndScreen.module.css';

type Category = 'cards' | 'coins' | 'setteBello' | 'prime' | 'scopas';

interface FamilyRoundEndScreenProps {
  state: FamilyVisibleGameState;
  scores: Record<FamilyPlayerId, RoundScore>;
  gameOver: boolean;
  onNextRound: () => void;
  onShowGameEnd: () => void;
}

function primeCardIds(cards: Card[]): Set<string> {
  const ids = new Set<string>();
  for (const suit of SUITS) {
    const suitCards = cards.filter((card) => card.suit === suit);
    if (suitCards.length === 0) continue;
    const best = suitCards.reduce((current, card) =>
      PRIME_VALUES[card.value] > PRIME_VALUES[current.value] ? card : current
    );
    ids.add(best.id);
  }
  return ids;
}

export function FamilyRoundEndScreen({ state, scores, gameOver, onNextRound, onShowGameEnd }: FamilyRoundEndScreenProps) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<FamilyPlayerId>(state.self.id);
  const [category, setCategory] = useState<Category | null>(null);
  const selectedPlayer = state.players.find((player) => player.id === selectedPlayerId) ?? state.players[0];
  const primeIds = useMemo(() => primeCardIds(selectedPlayer.captured), [selectedPlayer.captured]);
  const scopaIds = useMemo(() => new Set(selectedPlayer.scopaCaptures.flat().map((card) => card.id)), [selectedPlayer.scopaCaptures]);

  const isHighlighted = (card: Card) => {
    if (!category) return false;
    if (category === 'cards') return true;
    if (category === 'coins') return card.suit === 'coins';
    if (category === 'setteBello') return card.suit === 'coins' && card.value === 7;
    if (category === 'prime') return primeIds.has(card.id);
    return scopaIds.has(card.id);
  };

  const categories: Array<{ id: Category; label: string; icon: string; raw: (score: RoundScore) => string | number; won: (score: RoundScore) => boolean }> = [
    { id: 'cards', label: 'Carte Lungo', icon: '🃏', raw: (score) => score.counts.cards, won: (score) => score.cards > 0 },
    { id: 'coins', label: 'Denari', icon: '🪙', raw: (score) => score.counts.coins, won: (score) => score.coins > 0 },
    { id: 'setteBello', label: 'Sette Bello', icon: '7', raw: (score) => score.setteBello > 0 ? '✓' : '-', won: (score) => score.setteBello > 0 },
    { id: 'prime', label: 'Primiera', icon: '★', raw: (score) => score.counts.prime ?? '-', won: (score) => score.prime > 0 },
    { id: 'scopas', label: 'Scopa', icon: '🧹', raw: (score) => score.scopas || '-', won: (score) => score.scopas > 0 },
  ];

  return (
    <main className={styles.overlay}>
      <section className={styles.cardsPane}>
        <div className={styles.playerTabs}>
          {state.players.map((player) => (
            <button
              key={player.id}
              className={player.id === selectedPlayer.id ? styles.activeTab : ''}
              onClick={() => setSelectedPlayerId(player.id)}
            >
              {player.isSelf ? 'You' : player.nickname}
              <small>{player.capturedCount}</small>
            </button>
          ))}
        </div>
        <div className={styles.cardsLabel}>{selectedPlayer.isSelf ? 'Your captured cards' : `${selectedPlayer.nickname}'s captured cards`}</div>
        <div className={styles.cardGrid}>
          {selectedPlayer.captured.map((card) => (
            <div
              key={card.id}
              className={`${styles.miniCard} ${isHighlighted(card) ? styles.highlighted : ''} ${category && !isHighlighted(card) ? styles.dimmed : ''}`}
            >
              <CardImage card={card} />
            </div>
          ))}
        </div>
      </section>

      <section className={styles.modal}>
        <h1>Round {state.roundNumber} Complete</h1>
        <div className={styles.categoryTable} style={{ '--player-count': state.players.length } as CSSProperties}>
          <div className={styles.tableHeader}>
            <span>Category</span>
            {state.players.map((player) => <span key={player.id}>{player.isSelf ? 'You' : player.nickname}</span>)}
          </div>
          {categories.map((item) => (
            <button
              key={item.id}
              className={`${styles.categoryRow} ${category === item.id ? styles.selectedRow : ''}`}
              onClick={() => setCategory((current) => current === item.id ? null : item.id)}
            >
              <span className={styles.categoryName}><b>{item.icon}</b>{item.label}</span>
              {state.players.map((player) => {
                const score = scores[player.id];
                return <span key={player.id} className={item.won(score) ? styles.winner : ''}>{item.raw(score)}</span>;
              })}
            </button>
          ))}
          <div className={`${styles.categoryRow} ${styles.totalRow}`}>
            <span>Round Total</span>
            {state.players.map((player) => <span key={player.id}>+{scores[player.id]?.total ?? 0}</span>)}
          </div>
        </div>

        <div className={styles.cumulative}>
          {state.players.map((player) => (
            <div key={player.id}>
              <small>{player.isSelf ? 'You' : player.nickname}</small>
              <strong>{player.score}</strong>
            </div>
          ))}
        </div>

        <div className={styles.ready}>{state.continueRequests.length} / {state.players.length} ready</div>
        <button
          className={styles.nextButton}
          onClick={gameOver ? onShowGameEnd : onNextRound}
          disabled={!gameOver && state.continueRequests.includes(state.self.id)}
        >
          {gameOver ? 'See Results' : state.continueRequests.includes(state.self.id) ? 'Waiting...' : 'Next Round'}
        </button>
      </section>
    </main>
  );
}
