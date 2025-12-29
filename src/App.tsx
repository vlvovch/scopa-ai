import { useState } from 'react';
import { useGame } from './hooks/useGame';
import { GameLayout } from './components/Layout/GameLayout';
import { PlayerHand } from './components/Table/PlayerHand';
import { TableCards } from './components/Table/TableCards';
import { CapturedPile } from './components/Table/CapturedPile';
import { ScoreBoard } from './components/UI/ScoreBoard';
import type { Card } from './game/types';

function App() {
  const { state, startGame } = useGame();
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  // If game hasn't started, show start button
  if (state.status === 'idle') {
    return (
      <div className="app">
        <h1>Scopa</h1>
        <p>Italian Card Game</p>
        <button
          onClick={() => startGame(11)}
          style={{
            marginTop: '20px',
            padding: '12px 24px',
            fontSize: '16px',
            background: 'var(--color-accent)',
            color: '#000',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
          }}
        >
          Start Game
        </button>
      </div>
    );
  }

  const handleCardClick = (card: Card) => {
    setSelectedCard(selectedCard?.id === card.id ? null : card);
  };

  return (
    <GameLayout
      scoreBoard={
        <ScoreBoard
          humanScore={state.scores.human}
          cpuScore={state.scores.cpu}
          roundNumber={state.roundNumber}
          targetScore={state.targetScore}
          currentPlayer={state.round.currentPlayer}
        />
      }
      cpuHand={
        <PlayerHand
          cards={state.players.cpu.hand}
          isHuman={false}
        />
      }
      cpuPile={
        <CapturedPile
          cards={state.players.cpu.captured}
          scopaCount={state.players.cpu.scopaCount}
          player="cpu"
        />
      }
      tableCards={
        <TableCards
          cards={state.round.table}
          selectable={selectedCard !== null}
        />
      }
      humanPile={
        <CapturedPile
          cards={state.players.human.captured}
          scopaCount={state.players.human.scopaCount}
          player="human"
        />
      }
      humanHand={
        <PlayerHand
          cards={state.players.human.hand}
          isHuman={true}
          onCardClick={handleCardClick}
          selectedCardId={selectedCard?.id}
          disabled={state.round.currentPlayer !== 'human'}
        />
      }
      controls={
        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
          {state.round.currentPlayer === 'human' ? 'Your turn' : 'CPU thinking...'}
        </div>
      }
    />
  );
}

export default App;
