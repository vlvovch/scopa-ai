import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useGame } from './hooks/useGame';
import { useSettings } from './hooks/useSettings';
import { GameLayout } from './components/Layout/GameLayout';
import { PlayerHand } from './components/Table/PlayerHand';
import { TableCards } from './components/Table/TableCards';
import { CapturedPile } from './components/Table/CapturedPile';
import { ScoreBoard } from './components/UI/ScoreBoard';
import { StartScreen } from './components/UI/StartScreen';
import { RoundEndScreen } from './components/UI/RoundEndScreen';
import { GameEndScreen } from './components/UI/GameEndScreen';
import { ScopaCelebration } from './components/UI/ScopaCelebration';
import { SettingsModal } from './components/UI/SettingsModal';
import { GameControls } from './components/UI/GameControls';
import { getValidMoves } from './game/rules';
import type { Card, PlayerId } from './game/types';

function App() {
  const { state, startGame, playCard, endRound, nextRound, resetGame } = useGame();
  const { settings, updateSetting, resetSettings } = useSettings();
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [selectedTableCards, setSelectedTableCards] = useState<Card[]>([]);
  const [scopaCelebration, setScopaCelebration] = useState<{ show: boolean; player: PlayerId }>({
    show: false,
    player: 'human',
  });
  const [showSettings, setShowSettings] = useState(false);
  const [confirmNewGame, setConfirmNewGame] = useState(false);

  // Track previous scopa counts to detect new scopas
  const prevScopaCounts = useRef({ human: 0, cpu: 0 });

  // Clear selection when turn changes or game state changes
  useEffect(() => {
    setSelectedCard(null);
    setSelectedTableCards([]);
  }, [state.round.currentPlayer, state.status]);

  // Calculate valid moves for selected card
  const validMoves = useMemo(() => {
    if (!selectedCard || state.round.currentPlayer !== 'human') {
      return [];
    }
    return getValidMoves(selectedCard, state.round.table, 'human');
  }, [selectedCard, state.round.table, state.round.currentPlayer]);

  // Check if selected card can only place (no capture possible)
  const canOnlyPlace = useMemo(() => {
    return validMoves.length === 1 && validMoves[0].capturedCards.length === 0;
  }, [validMoves]);

  // Get all valid capture target card IDs
  const validCaptureTargetIds = useMemo(() => {
    const ids = new Set<string>();
    for (const move of validMoves) {
      for (const card of move.capturedCards) {
        ids.add(card.id);
      }
    }
    return Array.from(ids);
  }, [validMoves]);

  // Calculate the sum of selected table cards
  const selectedSum = useMemo(() => {
    return selectedTableCards.reduce((sum, card) => sum + card.value, 0);
  }, [selectedTableCards]);

  // Check if current selection forms a valid capture
  const isValidCapture = useMemo(() => {
    if (!selectedCard || selectedTableCards.length === 0) {
      return false;
    }
    // Check if this exact combination exists in valid moves
    const selectedIds = new Set(selectedTableCards.map(c => c.id));
    return validMoves.some(move => {
      if (move.capturedCards.length !== selectedTableCards.length) {
        return false;
      }
      return move.capturedCards.every(c => selectedIds.has(c.id));
    });
  }, [selectedCard, selectedTableCards, validMoves]);

  // Handle clicking a card in hand
  const handleHandCardClick = useCallback((card: Card) => {
    if (selectedCard?.id === card.id) {
      // Deselect
      setSelectedCard(null);
      setSelectedTableCards([]);
    } else {
      // Select new card
      setSelectedCard(card);
      setSelectedTableCards([]);
    }
  }, [selectedCard]);

  // Handle double-clicking a card in hand (place card)
  const handleHandCardDoubleClick = useCallback((card: Card) => {
    if (state.round.currentPlayer !== 'human') return;

    const moves = getValidMoves(card, state.round.table, 'human');
    const placeMove = moves.find(m => m.capturedCards.length === 0);

    if (placeMove) {
      playCard(placeMove);
      setSelectedCard(null);
      setSelectedTableCards([]);
    }
  }, [state.round.currentPlayer, state.round.table, playCard]);

  // Handle clicking a table card
  const handleTableCardClick = useCallback((card: Card) => {
    if (!selectedCard) return;

    // Check if this card is a valid target
    if (!validCaptureTargetIds.includes(card.id)) return;

    // Toggle selection
    setSelectedTableCards(prev => {
      const isSelected = prev.some(c => c.id === card.id);
      if (isSelected) {
        return prev.filter(c => c.id !== card.id);
      } else {
        return [...prev, card];
      }
    });
  }, [selectedCard, validCaptureTargetIds]);

  // Execute capture
  const executeCapture = useCallback(() => {
    if (!selectedCard || !isValidCapture) return;

    // Find the matching move
    const selectedIds = new Set(selectedTableCards.map(c => c.id));
    const move = validMoves.find(m => {
      if (m.capturedCards.length !== selectedTableCards.length) return false;
      return m.capturedCards.every(c => selectedIds.has(c.id));
    });

    if (move) {
      playCard(move);
      setSelectedCard(null);
      setSelectedTableCards([]);
    }
  }, [selectedCard, selectedTableCards, validMoves, isValidCapture, playCard]);

  // Execute place
  const executePlace = useCallback(() => {
    if (!selectedCard || !canOnlyPlace) return;

    const placeMove = validMoves[0];
    playCard(placeMove);
    setSelectedCard(null);
  }, [selectedCard, canOnlyPlace, validMoves, playCard]);

  // Auto-execute single card capture when table card is clicked
  useEffect(() => {
    if (selectedTableCards.length === 1 && isValidCapture) {
      // Single card capture - auto-execute
      executeCapture();
    }
  }, [selectedTableCards, isValidCapture, executeCapture]);

  // CPU turn execution with delay
  useEffect(() => {
    if (state.round.currentPlayer !== 'cpu' || state.status !== 'playing') {
      return;
    }

    const cpuHand = state.players.cpu.hand;
    if (cpuHand.length === 0) {
      return;
    }

    // Add delay for UX (500-1000ms)
    const delay = 500 + Math.random() * 500;
    const timeoutId = setTimeout(() => {
      // Select a random card from CPU's hand
      const randomCardIndex = Math.floor(Math.random() * cpuHand.length);
      const cardToPlay = cpuHand[randomCardIndex];

      // Get valid moves for this card
      const cpuMoves = getValidMoves(cardToPlay, state.round.table, 'cpu');

      if (cpuMoves.length > 0) {
        // Select a random valid move (MVP random AI)
        const randomMoveIndex = Math.floor(Math.random() * cpuMoves.length);
        const moveToExecute = cpuMoves[randomMoveIndex];
        playCard(moveToExecute);
      }
    }, delay);

    return () => clearTimeout(timeoutId);
  }, [state.round.currentPlayer, state.status, state.players.cpu.hand, state.round.table, playCard]);

  // Calculate and store round scores when entering roundEnd status
  useEffect(() => {
    if (state.status === 'roundEnd' && !state.lastRoundScores) {
      endRound();
    }
  }, [state.status, state.lastRoundScores, endRound]);

  // Detect scopa and show celebration
  useEffect(() => {
    const currentHumanScopas = state.players.human.scopaCount;
    const currentCpuScopas = state.players.cpu.scopaCount;

    if (currentHumanScopas > prevScopaCounts.current.human) {
      setScopaCelebration({ show: true, player: 'human' });
      setTimeout(() => setScopaCelebration(prev => ({ ...prev, show: false })), 1500);
    } else if (currentCpuScopas > prevScopaCounts.current.cpu) {
      setScopaCelebration({ show: true, player: 'cpu' });
      setTimeout(() => setScopaCelebration(prev => ({ ...prev, show: false })), 1500);
    }

    prevScopaCounts.current = { human: currentHumanScopas, cpu: currentCpuScopas };
  }, [state.players.human.scopaCount, state.players.cpu.scopaCount]);

  // Handle new game request
  const handleNewGame = useCallback(() => {
    if (state.status === 'playing') {
      setConfirmNewGame(true);
    } else {
      resetGame();
    }
  }, [state.status, resetGame]);

  const confirmAndStartNewGame = useCallback(() => {
    setConfirmNewGame(false);
    resetGame();
  }, [resetGame]);

  // If game hasn't started, show start screen
  if (state.status === 'idle') {
    return (
      <>
        <StartScreen onStartGame={startGame} />
        <SettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          settings={settings}
          onUpdateSetting={updateSetting}
          onResetSettings={resetSettings}
        />
      </>
    );
  }

  // Round end screen (wait for scores to be calculated)
  if (state.status === 'roundEnd' && state.lastRoundScores) {
    return (
      <RoundEndScreen
        roundNumber={state.roundNumber}
        humanScore={state.lastRoundScores.human}
        cpuScore={state.lastRoundScores.cpu}
        cumulativeHuman={state.scores.human}
        cumulativeCpu={state.scores.cpu}
        onNextRound={nextRound}
      />
    );
  }

  // Game end screen
  if (state.status === 'gameEnd') {
    return (
      <GameEndScreen
        humanScore={state.scores.human}
        cpuScore={state.scores.cpu}
        roundsPlayed={state.roundNumber}
        onPlayAgain={resetGame}
      />
    );
  }

  const isHumanTurn = state.round.currentPlayer === 'human';

  return (
    <>
      <ScopaCelebration
        show={scopaCelebration.show}
        player={scopaCelebration.player}
      />
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onUpdateSetting={updateSetting}
        onResetSettings={resetSettings}
      />
      {/* New Game Confirmation Dialog */}
      {confirmNewGame && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 160,
          }}
          onClick={() => setConfirmNewGame(false)}
        >
          <div
            style={{
              background: 'linear-gradient(180deg, #1e3a2f 0%, #0d1f17 100%)',
              border: '2px solid var(--color-accent)',
              borderRadius: '12px',
              padding: '24px',
              textAlign: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px', color: 'var(--color-text-primary)' }}>
              Start New Game?
            </h3>
            <p style={{ margin: '0 0 20px', color: 'var(--color-text-secondary)' }}>
              Current game progress will be lost.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => setConfirmNewGame(false)}
                style={{
                  padding: '8px 20px',
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: '6px',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmAndStartNewGame}
                style={{
                  padding: '8px 20px',
                  background: 'var(--color-accent)',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#000',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                New Game
              </button>
            </div>
          </div>
        </div>
      )}
      <GameLayout
      scoreBoard={
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          <ScoreBoard
            humanScore={state.scores.human}
            cpuScore={state.scores.cpu}
            roundNumber={state.roundNumber}
            targetScore={state.targetScore}
            currentPlayer={state.round.currentPlayer}
          />
          <GameControls
            onNewGame={handleNewGame}
            onOpenSettings={() => setShowSettings(true)}
          />
        </div>
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
          highlightedCardIds={validCaptureTargetIds}
          selectedCardIds={selectedTableCards.map(c => c.id)}
          onCardClick={handleTableCardClick}
          selectable={isHumanTurn && selectedCard !== null}
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
          onCardClick={handleHandCardClick}
          onCardDoubleClick={handleHandCardDoubleClick}
          selectedCardId={selectedCard?.id}
          disabled={!isHumanTurn}
        />
      }
      controls={
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '180px' }}>
          <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
            {isHumanTurn ? 'Your turn' : 'CPU thinking...'}
          </span>

          {/* Action buttons container - always takes up space */}
          <div style={{ minHeight: '36px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Show place button when card can only be placed */}
            {isHumanTurn && selectedCard && canOnlyPlace && (
              <button
                onClick={executePlace}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  background: 'var(--color-accent)',
                  color: '#000',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                Place Card
              </button>
            )}

            {/* Show confirm button for multi-card capture */}
            {isHumanTurn && selectedTableCards.length > 1 && (
              <>
                <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                  Sum: {selectedSum}/{selectedCard?.value}
                </span>
                {isValidCapture && (
                  <button
                    onClick={executeCapture}
                    style={{
                      padding: '8px 16px',
                      fontSize: '14px',
                      background: 'var(--color-accent)',
                      color: '#000',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    Capture
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      }
    />
    </>
  );
}

export default App;
