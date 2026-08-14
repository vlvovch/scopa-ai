import { useMemo, useState } from 'react';
import { Card as CardView } from '../../components/Card/Card';
import type { Card } from './types';
import type { FamilyVisibleGameState } from './multiplayer/types';

interface FamilyMultiplayerBoardProps {
  state: FamilyVisibleGameState;
  nickname: string;
  onPlayMove: (card: Card, capturedCards: Card[]) => void;
  onContinueRound: () => void;
  onLeave: () => void;
}

function getValidCaptures(card: Card, table: Card[]): Card[][] {
  const singles = table.filter((tableCard) => tableCard.value === card.value);
  if (singles.length > 0) return singles.map((tableCard) => [tableCard]);

  const captures: Card[][] = [];
  const search = (index: number, sum: number, chosen: Card[]) => {
    if (sum === card.value && chosen.length > 1) captures.push(chosen);
    if (sum >= card.value) return;
    for (let i = index; i < table.length; i += 1) {
      search(i + 1, sum + table[i].value, [...chosen, table[i]]);
    }
  };
  search(0, 0, []);
  return captures;
}

export function FamilyMultiplayerBoard({
  state,
  nickname,
  onPlayMove,
  onContinueRound,
  onLeave,
}: FamilyMultiplayerBoardProps) {
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [selectedTableCards, setSelectedTableCards] = useState<Card[]>([]);
  const validCaptures = useMemo(() => {
    if (!selectedCard) return [];
    return getValidCaptures(selectedCard, state.round.table);
  }, [selectedCard, state.round.table]);
  const isMyTurn = state.round.currentPlayer === state.self.id;
  const selectedIds = new Set(selectedTableCards.map((card) => card.id));
  const canCapture = validCaptures.some((capture) => capture.length === selectedTableCards.length && capture.every((card) => selectedIds.has(card.id)));
  const play = (card: Card, capturedCards: Card[]) => {
    onPlayMove(card, capturedCards);
    setSelectedCard(null);
    setSelectedTableCards([]);
  };
  const handleCardDoubleClick = (card: Card) => {
    if (!isMyTurn) return;
    const captures = getValidCaptures(card, state.round.table);
    if (captures.length < 2) {
      play(card, captures[0] ?? []);
      return;
    }
    setSelectedCard(card);
    setSelectedTableCards([]);
  };

  return (
    <main style={{ minHeight: '100vh', padding: 'clamp(12px, 3vw, 32px)', color: 'var(--color-text-primary)', background: 'var(--color-background)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div><strong>Scopa</strong><span style={{ marginLeft: 12, opacity: 0.7 }}>{nickname} · round {state.roundNumber}</span></div>
        <button onClick={onLeave}>Leave game</button>
      </header>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        {state.players.map((player) => (
          <div key={player.id} style={{ padding: 10, border: player.id === state.round.currentPlayer ? '2px solid var(--color-accent)' : '1px solid var(--color-border)', borderRadius: 8, background: player.isSelf ? 'rgba(212, 175, 55, 0.12)' : 'rgba(0, 0, 0, 0.16)' }}>
            <div><strong>{player.isSelf ? 'You' : player.nickname}</strong>{player.connected ? '' : ' (offline)'}</div>
            <small>{player.handCount} cards · {player.capturedCount} captured · {player.score} pts</small>
          </div>
        ))}
      </section>
      {state.status === 'gameEnd' ? (
        <section style={{ textAlign: 'center', padding: 24 }}>
          <h2>Game complete</h2>
          <p>The target score has been reached.</p>
          <button onClick={onLeave}>Leave game</button>
        </section>
      ) : state.status === 'roundEnd' ? (
        <section style={{ textAlign: 'center', padding: 24 }}>
          <h2>Round complete</h2>
          <p>Cards have been scored. Everyone must continue for the next round.</p>
          <button onClick={onContinueRound}>Next round</button>
        </section>
      ) : (
        <>
          <section style={{ flex: 1, minHeight: 240, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 20 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, minHeight: 120 }}>
              {state.round.table.map((card) => (
                <CardView key={card.id} card={card} selected={selectedIds.has(card.id)} highlighted={isMyTurn && !!selectedCard && validCaptures.flat().some((candidate) => candidate.id === card.id)} disabled={!isMyTurn || !selectedCard} onClick={() => setSelectedTableCards((current) => current.some((item) => item.id === card.id) ? current.filter((item) => item.id !== card.id) : [...current, card])} />
              ))}
            </div>
            <div style={{ opacity: 0.7 }}>Deck: {state.round.deckCount} · {isMyTurn ? 'Your turn' : `Waiting for ${state.players.find((player) => player.id === state.round.currentPlayer)?.nickname ?? 'player'}`}</div>
          </section>
          <section style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
            {state.self.hand.map((card) => (
              <CardView key={card.id} card={card} selected={selectedCard?.id === card.id} disabled={!isMyTurn} onClick={() => { setSelectedCard(card); setSelectedTableCards([]); }} onDoubleClick={() => handleCardDoubleClick(card)} />
            ))}
          </section>
          <section style={{ minHeight: 42, display: 'flex', justifyContent: 'center', gap: 8 }}>
            {selectedCard && validCaptures.length === 0 && <button onClick={() => play(selectedCard, [])}>Place card</button>}
            {selectedCard && canCapture && <button onClick={() => play(selectedCard, selectedTableCards)}>Capture</button>}
            {selectedCard && validCaptures.length > 1 && <span>Select a valid capture</span>}
          </section>
        </>
      )}
    </main>
  );
}
