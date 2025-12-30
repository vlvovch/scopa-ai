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
import { SetteBelloCelebration } from './components/UI/SetteBelloCelebration';
import { SettingsModal } from './components/UI/SettingsModal';
import { GameControls } from './components/UI/GameControls';
import { CpuCardAnimation } from './components/UI/CpuCardAnimation';
import { getValidMoves } from './game/rules';
import { AI_PLAYERS, AI_INFO } from './ai';
import type { AIType } from './ai';
import type { PanInfo } from 'framer-motion';
import type { Card, PlayerId } from './game/types';

function App() {
  const { state, startGame, playCard, endRound, nextRound, showGameEnd, resetGame } = useGame();
  const { settings, updateSetting, resetSettings } = useSettings();
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [selectedTableCards, setSelectedTableCards] = useState<Card[]>([]);
  const [scopaCelebration, setScopaCelebration] = useState<{ show: boolean; player: PlayerId }>({
    show: false,
    player: 'human',
  });
  const [setteBelloCelebration, setSetteBelloCelebration] = useState<{ show: boolean; player: PlayerId }>({
    show: false,
    player: 'human',
  });
  const [showSettings, setShowSettings] = useState(false);
  const [confirmNewGame, setConfirmNewGame] = useState(false);

  // Spectator mode state
  const [spectatorAIs, setSpectatorAIs] = useState<{ player1: AIType; player2: AIType }>({
    player1: 'heuristic',
    player2: 'random',
  });
  const [isSpectatorPaused, setIsSpectatorPaused] = useState(false);

  // Check if in spectator mode
  const isSpectatorMode = state.gameMode === 'cpuVsCPU';

  // Track previous scopa counts to detect new scopas
  const prevScopaCounts = useRef({ human: 0, cpu: 0 });
  // Track if sette bello has been captured this round
  const setteBelloCaptured = useRef(false);

  // Ref for table area (for drag-and-drop detection)
  const tableRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Card animation state (used for CPU and human in spectator mode)
  const [animatingCard, setAnimatingCard] = useState<{
    card: Card;
    phase: 'reveal' | 'moving' | 'capturing' | 'done';
    capturedCards: Card[];
    player: PlayerId;
  } | null>(null);

  // Clear selection when turn changes or game state changes
  useEffect(() => {
    setSelectedCard(null);
    setSelectedTableCards([]);
  }, [state.round.currentPlayer, state.status]);

  // Reset sette bello tracking when a new round starts
  useEffect(() => {
    setteBelloCaptured.current = false;
  }, [state.roundNumber]);

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

  // Helper to check if captured cards include sette bello (7 of coins)
  const hasSetteBello = useCallback((capturedCards: Card[]) => {
    return capturedCards.some(c => c.suit === 'coins' && c.value === 7);
  }, []);

  // Wrapper for playCard that triggers sette bello celebration
  const playCardWithCelebration = useCallback((move: Parameters<typeof playCard>[0]) => {
    // Check for sette bello capture before playing
    if (!setteBelloCaptured.current && hasSetteBello(move.capturedCards)) {
      setteBelloCaptured.current = true;
      setSetteBelloCelebration({ show: true, player: move.player });
      setTimeout(() => setSetteBelloCelebration(prev => ({ ...prev, show: false })), 1500);
    }
    playCard(move);
  }, [playCard, hasSetteBello]);

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
      playCardWithCelebration(placeMove);
      setSelectedCard(null);
      setSelectedTableCards([]);
    }
  }, [state.round.currentPlayer, state.round.table, playCard]);

  // Handle card drag start
  const handleCardDragStart = useCallback((card: Card) => {
    setIsDragging(true);
    setSelectedCard(card);
    setSelectedTableCards([]);
  }, []);

  // Handle card drag end - check if dropped on table
  const handleCardDragEnd = useCallback((card: Card, info: PanInfo) => {
    setIsDragging(false);

    if (state.round.currentPlayer !== 'human') return;

    // Check if dropped on table area
    if (tableRef.current) {
      const tableRect = tableRef.current.getBoundingClientRect();
      const { x, y } = info.point;

      const isOverTable =
        x >= tableRect.left &&
        x <= tableRect.right &&
        y >= tableRect.top &&
        y <= tableRect.bottom;

      if (isOverTable) {
        const moves = getValidMoves(card, state.round.table, 'human');

        // If only one move option (place or single capture), execute it
        if (moves.length === 1) {
          playCardWithCelebration(moves[0]);
          setSelectedCard(null);
          setSelectedTableCards([]);
        } else if (moves.length > 1) {
          // Multiple capture options - check if all are single card captures with same value
          const captureOptions = moves.filter(m => m.capturedCards.length > 0);

          if (captureOptions.length === 1) {
            // Only one capture option, execute it
            playCardWithCelebration(captureOptions[0]);
            setSelectedCard(null);
            setSelectedTableCards([]);
          }
          // Otherwise keep card selected for user to pick capture targets
        }
      }
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
      playCardWithCelebration(move);
      setSelectedCard(null);
      setSelectedTableCards([]);
    }
  }, [selectedCard, selectedTableCards, validMoves, isValidCapture, playCard]);

  // Execute place
  const executePlace = useCallback(() => {
    if (!selectedCard || !canOnlyPlace) return;

    const placeMove = validMoves[0];
    playCardWithCelebration(placeMove);
    setSelectedCard(null);
  }, [selectedCard, canOnlyPlace, validMoves, playCard]);

  // Auto-execute single card capture when table card is clicked (with brief delay for visual feedback)
  useEffect(() => {
    if (selectedTableCards.length === 1 && isValidCapture) {
      // Single card capture - auto-execute after a brief delay to show selection
      const timeoutId = setTimeout(() => {
        executeCapture();
      }, 250);
      return () => clearTimeout(timeoutId);
    }
  }, [selectedTableCards, isValidCapture, executeCapture]);

  // CPU turn execution with animation phases
  useEffect(() => {
    if (state.round.currentPlayer !== 'cpu' || state.status !== 'playing') {
      return;
    }

    // Pause in spectator mode
    if (isSpectatorMode && isSpectatorPaused) {
      return;
    }

    // Don't start new animation if one is in progress
    if (animatingCard) {
      return;
    }

    const cpuHand = state.players.cpu.hand;
    if (cpuHand.length === 0) {
      return;
    }

    // Add delay for UX (500-1000ms) before starting animation
    const delay = 500 + Math.random() * 500;
    const timeoutId = setTimeout(() => {
      // Use selected AI to select move (use spectator AI in spectator mode)
      const aiType = isSpectatorMode ? spectatorAIs.player2 : settings.cpuAI;
      const ai = AI_PLAYERS[aiType];
      const moveToExecute = ai.selectMove({
        hand: cpuHand,
        table: state.round.table,
        player: 'cpu',
      });

      // Start animation: reveal phase (flip card in place)
      setAnimatingCard({
        card: moveToExecute.cardPlayed,
        phase: 'reveal',
        capturedCards: moveToExecute.capturedCards,
        player: 'cpu',
      });

      // Phase 2: moving to table (after flip completes)
      setTimeout(() => {
        setAnimatingCard(prev => prev ? { ...prev, phase: 'moving' } : null);

        // Phase 3: execute move and show capture (after card reaches table)
        setTimeout(() => {
          playCardWithCelebration(moveToExecute);
          if (moveToExecute.capturedCards.length > 0) {
            setAnimatingCard(prev => prev ? { ...prev, phase: 'capturing' } : null);
            // Phase 4: done
            setTimeout(() => {
              setAnimatingCard(null);
            }, 400);
          } else {
            setAnimatingCard(null);
          }
        }, 500);
      }, 600);  // Give more time for flip animation
    }, delay);

    return () => clearTimeout(timeoutId);
  }, [state.round.currentPlayer, state.status, state.players.cpu.hand, state.round.table, playCard, animatingCard, settings.cpuAI, isSpectatorMode, isSpectatorPaused, spectatorAIs.player2]);

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

  // Handle AI selection change
  const handleSelectAI = useCallback((ai: AIType) => {
    updateSetting('cpuAI', ai);
  }, [updateSetting]);

  // Handle spectator AI selection
  const handleSelectSpectatorAI = useCallback((player: 'player1' | 'player2', ai: AIType) => {
    setSpectatorAIs(prev => ({ ...prev, [player]: ai }));
  }, []);

  // Get AI for current player in spectator mode
  const getAIForPlayer = useCallback((player: PlayerId): AIType => {
    if (player === 'human') {
      return spectatorAIs.player1;
    }
    return spectatorAIs.player2;
  }, [spectatorAIs]);

  // Human turn auto-play in spectator mode (with animation)
  useEffect(() => {
    if (!isSpectatorMode || isSpectatorPaused) return;
    if (state.round.currentPlayer !== 'human' || state.status !== 'playing') return;

    // Don't start new animation if one is in progress
    if (animatingCard) return;

    const humanHand = state.players.human.hand;
    if (humanHand.length === 0) return;

    // Add delay for UX
    const delay = 500 + Math.random() * 500;
    const timeoutId = setTimeout(() => {
      const ai = AI_PLAYERS[spectatorAIs.player1];
      const moveToExecute = ai.selectMove({
        hand: humanHand,
        table: state.round.table,
        player: 'human',
      });

      // Start animation: reveal phase (flip card in place)
      setAnimatingCard({
        card: moveToExecute.cardPlayed,
        phase: 'reveal',
        capturedCards: moveToExecute.capturedCards,
        player: 'human',
      });

      // Phase 2: moving to table (after flip completes)
      setTimeout(() => {
        setAnimatingCard(prev => prev ? { ...prev, phase: 'moving' } : null);

        // Phase 3: execute move and show capture (after card reaches table)
        setTimeout(() => {
          playCardWithCelebration(moveToExecute);
          if (moveToExecute.capturedCards.length > 0) {
            setAnimatingCard(prev => prev ? { ...prev, phase: 'capturing' } : null);
            // Phase 4: done
            setTimeout(() => {
              setAnimatingCard(null);
            }, 400);
          } else {
            setAnimatingCard(null);
          }
        }, 500);
      }, 600);  // Give more time for flip animation
    }, delay);

    return () => clearTimeout(timeoutId);
  }, [isSpectatorMode, isSpectatorPaused, state.round.currentPlayer, state.status, state.players.human.hand, state.round.table, spectatorAIs.player1, playCardWithCelebration, animatingCard]);

  // If game hasn't started, show start screen
  if (state.status === 'idle') {
    return (
      <>
        <StartScreen
          onStartGame={startGame}
          selectedAI={settings.cpuAI}
          onSelectAI={handleSelectAI}
          spectatorAIs={spectatorAIs}
          onSelectSpectatorAI={handleSelectSpectatorAI}
        />
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
        humanCaptured={state.players.human.captured}
        cpuCaptured={state.players.cpu.captured}
        humanScopaCaptures={state.players.human.scopaCaptures}
        cpuScopaCaptures={state.players.cpu.scopaCaptures}
        isGameOver={state.isGameOver}
        onNextRound={nextRound}
        onShowGameEnd={showGameEnd}
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
      <SetteBelloCelebration
        show={setteBelloCelebration.show}
        player={setteBelloCelebration.player}
      />
      <CpuCardAnimation
        card={animatingCard?.card ?? null}
        phase={animatingCard?.phase ?? null}
        capturedCardIds={animatingCard?.capturedCards.map(c => c.id) ?? []}
        player={animatingCard?.player}
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
              cpuName={isSpectatorMode ? AI_INFO[spectatorAIs.player2].name : AI_INFO[settings.cpuAI].name}
              humanName={isSpectatorMode ? AI_INFO[spectatorAIs.player1].name : undefined}
              isSpectatorMode={isSpectatorMode}
            />
            <GameControls
              onNewGame={handleNewGame}
              onOpenSettings={() => setShowSettings(true)}
            />
          </div>
        }
        cpuHand={
          <PlayerHand
            cards={
              // Filter out card being animated so it disappears from hand immediately
              animatingCard?.player === 'cpu'
                ? state.players.cpu.hand.filter(c => c.id !== animatingCard.card.id)
                : state.players.cpu.hand
            }
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
            ref={tableRef}
            cards={state.round.table}
            highlightedCardIds={validCaptureTargetIds}
            selectedCardIds={selectedTableCards.map(c => c.id)}
            onCardClick={handleTableCardClick}
            selectable={isHumanTurn && selectedCard !== null}
            isDragOver={isDragging}
            deckCount={state.round.deck.length}
            dealer={state.round.dealer}
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
            cards={
              // Filter out card being animated so it disappears from hand immediately (in spectator mode)
              animatingCard?.player === 'human'
                ? state.players.human.hand.filter(c => c.id !== animatingCard.card.id)
                : state.players.human.hand
            }
            isHuman={!isSpectatorMode}
            onCardClick={isSpectatorMode ? undefined : handleHandCardClick}
            onCardDoubleClick={isSpectatorMode ? undefined : handleHandCardDoubleClick}
            onCardDragStart={isSpectatorMode ? undefined : handleCardDragStart}
            onCardDragEnd={isSpectatorMode ? undefined : handleCardDragEnd}
            selectedCardId={isSpectatorMode ? undefined : selectedCard?.id}
            disabled={isSpectatorMode || !isHumanTurn}
          />
        }
        controls={
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '180px' }}>
            <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
              {isSpectatorMode
                ? `${AI_INFO[getAIForPlayer(state.round.currentPlayer)].name}'s turn${isSpectatorPaused ? ' (Paused)' : ''}`
                : isHumanTurn ? 'Your turn' : 'CPU thinking...'}
            </span>

            {/* Action buttons container - always takes up space */}
            <div style={{ minHeight: '36px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Spectator mode pause/play controls */}
              {isSpectatorMode && (
                <button
                  onClick={() => setIsSpectatorPaused(prev => !prev)}
                  style={{
                    padding: '8px 16px',
                    fontSize: '14px',
                    background: isSpectatorPaused ? 'var(--color-accent)' : 'rgba(255,255,255,0.1)',
                    color: isSpectatorPaused ? '#000' : 'var(--color-text-primary)',
                    border: isSpectatorPaused ? 'none' : '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  {isSpectatorPaused ? '▶ Resume' : '⏸ Pause'}
                </button>
              )}

              {/* Show place button when card can only be placed (only in player mode) */}
              {!isSpectatorMode && isHumanTurn && selectedCard && canOnlyPlace && (
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

              {/* Show confirm button for multi-card capture (only in player mode) */}
              {!isSpectatorMode && isHumanTurn && selectedTableCards.length > 1 && (
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
