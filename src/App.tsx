import { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
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
import { DealingAnimation, type DealMode } from './components/UI/DealingAnimation';
import { CaptureChoiceModal } from './components/UI/CaptureChoiceModal';
import { DeckProvider } from './contexts/DeckContext';
import { getValidMoves } from './game/rules';
import { AI_PLAYERS, AI_INFO, getGeminiAI, getGeminiSingleTurnAI, isAsyncAI, getGeminiTokenStats, getGeminiTokenDelta, resetGeminiTokenStats, startGeminiRound, endGeminiRound, getGeminiSingleTurnTokenStats, getGeminiSingleTurnTokenDelta, resetGeminiSingleTurnTokenStats, startGeminiSingleTurnRound, endGeminiSingleTurnRound } from './ai';
import type { ExtendedAIType, LLMAIContext, AnyAIPlayer, GeminiTokenStats, GeminiTokenDelta } from './ai';
import { TokenStatsDisplay } from './components/UI/TokenStatsDisplay';
import type { PanInfo } from 'framer-motion';
import type { Card, Move, PlayerId } from './game/types';

function App() {
  const { state, startGame, playCard, endRound, nextRound, showGameEnd, resetGame } = useGame();
  const { settings, updateSetting, resetSettings } = useSettings();
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [selectedTableCards, setSelectedTableCards] = useState<Card[]>([]);
  const [scopaCelebration, setScopaCelebration] = useState<{ show: boolean; player: PlayerId; playerName?: string }>({
    show: false,
    player: 'human',
  });
  const [setteBelloCelebration, setSetteBelloCelebration] = useState<{ show: boolean; player: PlayerId; playerName?: string }>({
    show: false,
    player: 'human',
  });
  // Track if any celebration animation is active (including exit animation)
  // This prevents user input during the full celebration cycle
  const [celebrationActive, setCelebrationActive] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [confirmNewGame, setConfirmNewGame] = useState(false);

  // Capture choice modal state (shown when multiple capture options exist)
  const [captureChoiceModal, setCaptureChoiceModal] = useState<{
    isOpen: boolean;
    playedCard: Card | null;
    captureOptions: Move[];
  }>({ isOpen: false, playedCard: null, captureOptions: [] });

  // Spectator mode state
  const [spectatorAIs, setSpectatorAIs] = useState<{ player1: ExtendedAIType; player2: ExtendedAIType }>({
    player1: 'heuristic',
    player2: 'random',
  });
  const [isSpectatorPaused, setIsSpectatorPaused] = useState(false);
  // Track pause state before settings opened (to restore on close)
  const pausedBeforeSettings = useRef(false);

  // Gemini token stats (refreshed after each AI move)
  const [tokenStats, setTokenStats] = useState<GeminiTokenStats | null>(null);
  const [tokenDelta, setTokenDelta] = useState<GeminiTokenDelta | null>(null);

  // Check if in spectator mode
  const isSpectatorMode = state.gameMode === 'cpuVsCPU';

  // Helper to check if an AI type is a Gemini variant
  const isGeminiAI = (aiType: ExtendedAIType): boolean => {
    return aiType === 'gemini' || aiType === 'gemini-singleturn';
  };

  // Helper to get display name with correct suffix: (AI) for LLM, (CPU) for traditional
  const getAIDisplayName = (aiType: ExtendedAIType) => {
    const name = AI_INFO[aiType].name;
    const suffix = isGeminiAI(aiType) ? 'AI' : 'CPU';
    return `${name} (${suffix})`;
  };

  // Helper to update token stats and delta
  const updateTokenStats = useCallback(() => {
    setTokenStats(getGeminiTokenStats());
    setTokenDelta(getGeminiTokenDelta());
  }, []);

  // Animation speed multipliers based on settings
  const getAnimationDelay = useCallback((baseMs: number) => {
    const multipliers = { fast: 0.5, normal: 1, slow: 2 };
    return baseMs * multipliers[settings.animationSpeed];
  }, [settings.animationSpeed]);

  // Get AI player instance for a given AI type
  const getAIPlayer = useCallback((aiType: ExtendedAIType): AnyAIPlayer => {
    if (aiType === 'gemini') {
      const gemini = getGeminiAI(settings.geminiModel);
      if (gemini) return gemini;
      // Fallback to heuristic if Gemini not available
      return AI_PLAYERS.heuristic;
    }
    return AI_PLAYERS[aiType];
  }, [settings.geminiModel]);

  // Build extended context for LLM AI
  const buildLLMContext = useCallback((
    hand: Card[],
    table: Card[],
    player: PlayerId
  ): LLMAIContext => {
    const selfPlayer = player;
    const oppPlayer = player === 'human' ? 'cpu' : 'human';

    // Compute all valid moves for this player
    const validMoves: Move[] = [];
    for (const card of hand) {
      const moves = getValidMoves(card, table, player);
      validMoves.push(...moves);
    }

    return {
      hand,
      table,
      player,
      scores: {
        self: state.scores[selfPlayer],
        opponent: state.scores[oppPlayer],
      },
      targetScore: state.targetScore,
      roundNumber: state.roundNumber,
      opponentHandCount: state.players[oppPlayer].hand.length,
      selfCapturedCount: state.players[selfPlayer].captured.length,
      opponentCapturedCount: state.players[oppPlayer].captured.length,
      deckCount: state.round.deck.length,
      lastOpponentMove: lastMoves.current[oppPlayer],
      validMoves,
    };
  }, [state.scores, state.targetScore, state.roundNumber, state.players, state.round.deck.length]);

  // Track previous scopa counts to detect new scopas
  const prevScopaCounts = useRef({ human: 0, cpu: 0 });
  // Track who has sette bello (null = neither, 'human' or 'cpu' = that player has it)
  const prevSetteBelloOwner = useRef<PlayerId | null>(null);
  // Track last move made by each player (for LLM context)
  const lastMoves = useRef<{ human: Move | null; cpu: Move | null }>({ human: null, cpu: null });

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

  // Dealing animation state
  const [isDealing, setIsDealing] = useState(false);
  const [dealMode, setDealMode] = useState<DealMode>('hands');
  // Track if this is a round-start deal (needs table phase before hands phase)
  const [isRoundStartDeal, setIsRoundStartDeal] = useState(false);
  // Track if CPU animation is being scheduled to prevent double-firing
  const cpuAnimationScheduled = useRef(false);

  // Track deck count to detect deals (more reliable than hand count)
  // Deck decreases by 10 on round start (4 table + 6 hands), by 6 mid-round
  const prevDeckCount = useRef<number | null>(null);
  const prevRoundNumber = useRef(0);

  // Unified animation blocking - blocks ALL user input during any animation
  // Uses celebrationActive instead of .show to block during exit animations too
  const isAnimationBlocking = isDealing || celebrationActive || !!animatingCard;

  // Clear selection when turn changes or game state changes
  useEffect(() => {
    setSelectedCard(null);
    setSelectedTableCards([]);
  }, [state.round.currentPlayer, state.status]);

  // Control body scroll: allow on start screen, hide during game to prevent flickering
  useEffect(() => {
    if (state.status === 'idle') {
      document.body.style.overflowY = 'auto';
    } else {
      document.body.style.overflowY = 'hidden';
    }
  }, [state.status]);

  // Reset sette bello and last moves tracking when a new round starts
  useEffect(() => {
    prevSetteBelloOwner.current = null;
    lastMoves.current = { human: null, cpu: null };
  }, [state.roundNumber]);

  // Detect dealing by tracking deck count changes
  // This is more robust than tracking hand count because deck only changes during deals
  // IMPORTANT: Using useLayoutEffect to run BEFORE paint, preventing flash of cards before animation
  useLayoutEffect(() => {
    if (state.status !== 'playing') {
      // Reset tracking when not playing - use -1 for round to ensure first round triggers
      prevDeckCount.current = null;
      prevRoundNumber.current = -1;
      return;
    }

    const currentDeckCount = state.round.deck.length;

    // On first render in playing state (prevDeckCount is null), trigger round start animation
    if (prevDeckCount.current === null) {
      prevDeckCount.current = currentDeckCount;
      prevRoundNumber.current = state.roundNumber;

      // If deck is 30 (fresh deal: 40 - 4 table - 6 hands), trigger round start animation
      // Phase 1: deal table cards first
      if (currentDeckCount === 30) {
        setIsDealing(true);
        setDealMode('table');
        setIsRoundStartDeal(true);
      }
      return;
    }

    // Check for new round (round number increased)
    if (state.roundNumber !== prevRoundNumber.current) {
      prevRoundNumber.current = state.roundNumber;
      prevDeckCount.current = currentDeckCount;
      if (currentDeckCount === 30 && !isDealing) {
        // Phase 1: deal table cards first
        setIsDealing(true);
        setDealMode('table');
        setIsRoundStartDeal(true);
      }
      return;
    }

    // Detect mid-round deals: deck decreased by 6 (dealt 3 cards to each player)
    const deckDecrease = prevDeckCount.current - currentDeckCount;
    if (deckDecrease === 6 && !isDealing) {
      setIsDealing(true);
      setDealMode('hands');
      setIsRoundStartDeal(false);
    }

    // Update tracking
    prevDeckCount.current = currentDeckCount;
  }, [state.round.deck.length, state.status, state.roundNumber, isDealing]);

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
    if (isAnimationBlocking) return; // Block input during animations
    if (selectedCard?.id === card.id) {
      // Deselect
      setSelectedCard(null);
      setSelectedTableCards([]);
    } else {
      // Select new card
      setSelectedCard(card);
      setSelectedTableCards([]);
    }
  }, [selectedCard, isAnimationBlocking]);

  // Handle double-clicking a card in hand (place card)
  const handleHandCardDoubleClick = useCallback((card: Card) => {
    if (isAnimationBlocking) return; // Block input during animations
    if (state.round.currentPlayer !== 'human') return;

    const moves = getValidMoves(card, state.round.table, 'human');
    const placeMove = moves.find(m => m.capturedCards.length === 0);

    if (placeMove) {
      playCard(placeMove);
      // Record last move for LLM context
      lastMoves.current.human = placeMove;
      setSelectedCard(null);
      setSelectedTableCards([]);
    }
  }, [state.round.currentPlayer, state.round.table, playCard, isAnimationBlocking]);

  // Handle card drag start
  const handleCardDragStart = useCallback((card: Card) => {
    if (isAnimationBlocking) return; // Block input during animations
    setIsDragging(true);
    setSelectedCard(card);
    setSelectedTableCards([]);
  }, [isAnimationBlocking]);

  // Execute a move with capture animation
  const executeMoveWithAnimation = useCallback((move: Move) => {
    if (move.capturedCards.length > 0) {
      // Start capture animation - show levitate then fly to pile
      setAnimatingCard({
        card: move.cardPlayed,
        phase: 'moving',
        capturedCards: move.capturedCards,
        player: 'human',
      });

      // Brief delay for levitate animation, then execute and show fly-to-pile
      setTimeout(() => {
        playCard(move);
        // Record last move for LLM context
        lastMoves.current.human = move;
        setAnimatingCard(prev => prev ? { ...prev, phase: 'capturing' } : null);
        setSelectedCard(null);
        setSelectedTableCards([]);
        // Clear animation after exit animation completes
        setTimeout(() => {
          setAnimatingCard(null);
        }, 900);
      }, 400);
    } else {
      // No capture, just place
      playCard(move);
      // Record last move for LLM context
      lastMoves.current.human = move;
      setSelectedCard(null);
      setSelectedTableCards([]);
    }
  }, [playCard]);

  // Handle card drag end - check if dropped on table
  const handleCardDragEnd = useCallback((card: Card, info: PanInfo) => {
    setIsDragging(false);

    if (isAnimationBlocking) return; // Block input during animations
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
          executeMoveWithAnimation(moves[0]);
        } else if (moves.length > 1) {
          // Multiple options - filter to capture moves only
          const captureOptions = moves.filter(m => m.capturedCards.length > 0);

          if (captureOptions.length === 1) {
            // Only one capture option, execute it
            executeMoveWithAnimation(captureOptions[0]);
          } else if (captureOptions.length > 1) {
            // Multiple capture options - show choice modal
            setCaptureChoiceModal({
              isOpen: true,
              playedCard: card,
              captureOptions,
            });
          }
        }
      }
    }
  }, [state.round.currentPlayer, state.round.table, executeMoveWithAnimation, isAnimationBlocking]);

  // Handle clicking a table card
  const handleTableCardClick = useCallback((card: Card) => {
    if (isAnimationBlocking) return; // Block input during animations
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
  }, [selectedCard, validCaptureTargetIds, isAnimationBlocking]);

  // Execute capture with animation
  const executeCapture = useCallback(() => {
    if (!selectedCard || !isValidCapture) return;

    // Find the matching move
    const selectedIds = new Set(selectedTableCards.map(c => c.id));
    const move = validMoves.find(m => {
      if (m.capturedCards.length !== selectedTableCards.length) return false;
      return m.capturedCards.every(c => selectedIds.has(c.id));
    });

    if (move) {
      executeMoveWithAnimation(move);
    }
  }, [selectedCard, selectedTableCards, validMoves, isValidCapture, executeMoveWithAnimation]);

  // Execute place
  const executePlace = useCallback(() => {
    if (!selectedCard || !canOnlyPlace) return;

    const placeMove = validMoves[0];
    playCard(placeMove);
    // Record last move for LLM context
    lastMoves.current.human = placeMove;
    setSelectedCard(null);
  }, [selectedCard, canOnlyPlace, validMoves, playCard]);

  // Handle capture selection from modal
  const handleCaptureChoice = useCallback((move: Move) => {
    setCaptureChoiceModal({ isOpen: false, playedCard: null, captureOptions: [] });
    executeMoveWithAnimation(move);
  }, [executeMoveWithAnimation]);

  // Handle cancel capture choice modal
  const handleCancelCaptureChoice = useCallback(() => {
    setCaptureChoiceModal({ isOpen: false, playedCard: null, captureOptions: [] });
  }, []);

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
      cpuAnimationScheduled.current = false;
      return;
    }

    // Pause in spectator mode
    if (isSpectatorMode && isSpectatorPaused) {
      return;
    }

    // Wait for celebration animations to complete
    if (scopaCelebration.show || setteBelloCelebration.show) {
      return;
    }

    // Wait for dealing animation to complete
    if (isDealing) {
      return;
    }

    // Don't start new animation if one is in progress or already scheduled
    if (animatingCard || cpuAnimationScheduled.current) {
      return;
    }

    const cpuHand = state.players.cpu.hand;
    if (cpuHand.length === 0) {
      return;
    }

    // Mark as scheduled to prevent double-firing
    cpuAnimationScheduled.current = true;

    // Add delay for UX before starting animation (scaled by animation speed)
    const baseDelay = 500 + Math.random() * 500;
    const delay = getAnimationDelay(baseDelay);
    const timeoutId = setTimeout(async () => {
      // Use selected AI to select move (use spectator AI in spectator mode)
      const aiType = isSpectatorMode ? spectatorAIs.player2 : settings.cpuAI;
      const ai = getAIPlayer(aiType);

      let moveToExecute: Move;
      if (isAsyncAI(ai)) {
        // Async AI (e.g., Gemini) - build extended context and await
        const context = buildLLMContext(cpuHand, state.round.table, 'cpu');
        moveToExecute = await ai.selectMove(context);
        // Update token stats after async AI move
        updateTokenStats();
      } else {
        // Sync AI - use simple context
        moveToExecute = ai.selectMove({
          hand: cpuHand,
          table: state.round.table,
          player: 'cpu',
        });
      }

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
          playCard(moveToExecute);
          // Record last move for LLM context
          lastMoves.current.cpu = moveToExecute;
          if (moveToExecute.capturedCards.length > 0) {
            setAnimatingCard(prev => prev ? { ...prev, phase: 'capturing' } : null);
            // Phase 4: done (wait for cards to fly to pile)
            setTimeout(() => {
              setAnimatingCard(null);
              cpuAnimationScheduled.current = false;
            }, getAnimationDelay(900));
          } else {
            setAnimatingCard(null);
            cpuAnimationScheduled.current = false;
          }
        }, getAnimationDelay(500));
      }, getAnimationDelay(600));  // Give more time for flip animation
    }, delay);

    return () => {
      clearTimeout(timeoutId);
      // Only reset scheduled flag if we're cleaning up before animation started
      if (!animatingCard) {
        cpuAnimationScheduled.current = false;
      }
    };
  }, [state.round.currentPlayer, state.status, state.players.cpu.hand, state.round.table, playCard, animatingCard, settings.cpuAI, isSpectatorMode, isSpectatorPaused, spectatorAIs.player2, scopaCelebration.show, setteBelloCelebration.show, isDealing, getAnimationDelay, getAIPlayer, buildLLMContext]);

  // Calculate and store round scores when entering roundEnd status
  // Handles final animations and Sette Bello detection for cards awarded at round end
  useEffect(() => {
    if (state.status !== 'roundEnd' || state.lastRoundScores) {
      return;
    }

    // Wait for any card animation to complete
    if (animatingCard) {
      return;
    }

    // Wait for any celebration to complete
    if (scopaCelebration.show || setteBelloCelebration.show) {
      return;
    }

    // Check if 7 of coins is on the table and will be awarded to lastCapture player
    const setteBelloOnTable = state.round.table.some(c => c.suit === 'coins' && c.value === 7);
    const lastCapturePlayer = state.round.lastCapture;

    if (setteBelloOnTable && lastCapturePlayer && prevSetteBelloOwner.current === null) {
      // Sette Bello will be awarded in final hand - trigger celebration
      const playerName = lastCapturePlayer === 'human'
        ? (isSpectatorMode ? AI_INFO[spectatorAIs.player1].name : undefined)
        : (isSpectatorMode ? AI_INFO[spectatorAIs.player2].name : AI_INFO[settings.cpuAI].name);

      // Mark as captured to prevent re-triggering
      prevSetteBelloOwner.current = lastCapturePlayer;

      setCelebrationActive(true); // Block input until exit animation completes
      setSetteBelloCelebration({ show: true, player: lastCapturePlayer, playerName });
      // Auto-hide after display duration to trigger exit animation
      setTimeout(() => setSetteBelloCelebration(prev => ({ ...prev, show: false })), 1500);
      // Fallback: ensure celebrationActive is reset even if onExitComplete doesn't fire
      setTimeout(() => setCelebrationActive(false), 2000);
      // The effect will re-run after celebration ends and then call endRound()
      return;
    }

    // Longer delay before showing round summary to let final animations complete
    const timeoutId = setTimeout(() => {
      endGeminiRound(); // Clear chat session at end of round
      endRound();
    }, 1500);

    return () => clearTimeout(timeoutId);
  }, [state.status, state.lastRoundScores, state.round.table, state.round.lastCapture, animatingCard, scopaCelebration.show, setteBelloCelebration.show, endRound, isSpectatorMode, spectatorAIs, settings.cpuAI]);

  // Detect scopa and show celebration
  useEffect(() => {
    const currentHumanScopas = state.players.human.scopaCount;
    const currentCpuScopas = state.players.cpu.scopaCount;

    if (currentHumanScopas > prevScopaCounts.current.human) {
      const playerName = isSpectatorMode ? AI_INFO[spectatorAIs.player1].name : undefined;
      setCelebrationActive(true); // Block input until exit animation completes
      setScopaCelebration({ show: true, player: 'human', playerName });
      // Auto-hide after display duration to trigger exit animation
      setTimeout(() => setScopaCelebration(prev => ({ ...prev, show: false })), 1500);
      // Fallback: ensure celebrationActive is reset even if onExitComplete doesn't fire
      setTimeout(() => setCelebrationActive(false), 2000);
    } else if (currentCpuScopas > prevScopaCounts.current.cpu) {
      const playerName = isSpectatorMode ? AI_INFO[spectatorAIs.player2].name : AI_INFO[settings.cpuAI].name;
      setCelebrationActive(true); // Block input until exit animation completes
      setScopaCelebration({ show: true, player: 'cpu', playerName });
      setTimeout(() => setScopaCelebration(prev => ({ ...prev, show: false })), 1500);
      // Fallback: ensure celebrationActive is reset even if onExitComplete doesn't fire
      setTimeout(() => setCelebrationActive(false), 2000);
    }

    prevScopaCounts.current = { human: currentHumanScopas, cpu: currentCpuScopas };
  }, [state.players.human.scopaCount, state.players.cpu.scopaCount, isSpectatorMode, spectatorAIs, settings.cpuAI]);

  // Detect sette bello capture and show celebration
  useEffect(() => {
    // Check who currently has the 7 of coins
    const humanHasSetteBello = state.players.human.captured.some(
      c => c.suit === 'coins' && c.value === 7
    );
    const cpuHasSetteBello = state.players.cpu.captured.some(
      c => c.suit === 'coins' && c.value === 7
    );

    const currentOwner: PlayerId | null = humanHasSetteBello ? 'human' : cpuHasSetteBello ? 'cpu' : null;

    // If someone just captured it (previous was null, now someone has it)
    if (prevSetteBelloOwner.current === null && currentOwner !== null) {
      const playerName = currentOwner === 'human'
        ? (isSpectatorMode ? AI_INFO[spectatorAIs.player1].name : undefined)
        : (isSpectatorMode ? AI_INFO[spectatorAIs.player2].name : AI_INFO[settings.cpuAI].name);

      // Small delay to let capture animation start first
      setTimeout(() => {
        setCelebrationActive(true); // Block input until exit animation completes
        setSetteBelloCelebration({ show: true, player: currentOwner, playerName });
        // Auto-hide after display duration to trigger exit animation
        setTimeout(() => setSetteBelloCelebration(prev => ({ ...prev, show: false })), 1500);
        // Fallback: ensure celebrationActive is reset even if onExitComplete doesn't fire
        setTimeout(() => setCelebrationActive(false), 2000);
      }, 300);
    }

    prevSetteBelloOwner.current = currentOwner;
  }, [state.players.human.captured, state.players.cpu.captured, isSpectatorMode, spectatorAIs, settings.cpuAI]);

  // Handle starting a new game (wraps startGame to reset token stats)
  const handleStartGame = useCallback((targetScore: number, gameMode: 'pvsCPU' | 'cpuVsCPU') => {
    resetGeminiTokenStats();
    setTokenStats(null);
    setTokenDelta(null);
    startGeminiRound(); // Start fresh chat session for first round
    startGame(targetScore, gameMode);
  }, [startGame]);

  // Handle new game request
  const handleNewGame = useCallback(() => {
    if (state.status === 'playing') {
      setConfirmNewGame(true);
    } else {
      resetGeminiTokenStats();
      setTokenStats(null);
      setTokenDelta(null);
      resetGame();
    }
  }, [state.status, resetGame]);

  const confirmAndStartNewGame = useCallback(() => {
    setConfirmNewGame(false);
    resetGeminiTokenStats();
    setTokenStats(null);
    setTokenDelta(null);
    resetGame();
  }, [resetGame]);

  // Handle AI selection change
  const handleSelectAI = useCallback((ai: ExtendedAIType) => {
    updateSetting('cpuAI', ai);
  }, [updateSetting]);

  // Handle spectator AI selection
  const handleSelectSpectatorAI = useCallback((player: 'player1' | 'player2', ai: ExtendedAIType) => {
    setSpectatorAIs(prev => ({ ...prev, [player]: ai }));
  }, []);

  // Get AI for current player in spectator mode
  const getAIForPlayer = useCallback((player: PlayerId): ExtendedAIType => {
    if (player === 'human') {
      return spectatorAIs.player1;
    }
    return spectatorAIs.player2;
  }, [spectatorAIs]);

  // Handle next round (wraps nextRound to start fresh chat session)
  const handleNextRound = useCallback(() => {
    startGeminiRound(); // Start fresh chat session for next round
    nextRound();
  }, [nextRound]);

  // Handle opening settings - pause spectator mode if active
  const handleOpenSettings = useCallback(() => {
    if (isSpectatorMode) {
      pausedBeforeSettings.current = isSpectatorPaused;
      setIsSpectatorPaused(true);
    }
    setShowSettings(true);
  }, [isSpectatorMode, isSpectatorPaused]);

  // Handle closing settings - restore previous pause state
  const handleCloseSettings = useCallback(() => {
    setShowSettings(false);
    if (isSpectatorMode) {
      setIsSpectatorPaused(pausedBeforeSettings.current);
    }
  }, [isSpectatorMode]);

  // Human turn auto-play in spectator mode (with animation)
  // Uses same cpuAnimationScheduled ref since only one player moves at a time
  useEffect(() => {
    if (!isSpectatorMode || isSpectatorPaused) return;
    if (state.round.currentPlayer !== 'human' || state.status !== 'playing') {
      cpuAnimationScheduled.current = false;
      return;
    }

    // Wait for celebration animations to complete
    if (scopaCelebration.show || setteBelloCelebration.show) return;

    // Wait for dealing animation to complete
    if (isDealing) return;

    // Don't start new animation if one is in progress or already scheduled
    if (animatingCard || cpuAnimationScheduled.current) return;

    const humanHand = state.players.human.hand;
    if (humanHand.length === 0) return;

    // Mark as scheduled to prevent double-firing
    cpuAnimationScheduled.current = true;

    // Add delay for UX (scaled by animation speed)
    const baseDelay = 500 + Math.random() * 500;
    const delay = getAnimationDelay(baseDelay);
    const timeoutId = setTimeout(async () => {
      const ai = getAIPlayer(spectatorAIs.player1);

      let moveToExecute: Move;
      if (isAsyncAI(ai)) {
        // Async AI (e.g., Gemini) - build extended context and await
        const context = buildLLMContext(humanHand, state.round.table, 'human');
        moveToExecute = await ai.selectMove(context);
        // Update token stats after async AI move
        updateTokenStats();
      } else {
        // Sync AI - use simple context
        moveToExecute = ai.selectMove({
          hand: humanHand,
          table: state.round.table,
          player: 'human',
        });
      }

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
          playCard(moveToExecute);
          // Record last move for LLM context
          lastMoves.current.human = moveToExecute;
          if (moveToExecute.capturedCards.length > 0) {
            setAnimatingCard(prev => prev ? { ...prev, phase: 'capturing' } : null);
            // Phase 4: done (wait for cards to fly to pile)
            setTimeout(() => {
              setAnimatingCard(null);
              cpuAnimationScheduled.current = false;
            }, getAnimationDelay(900));
          } else {
            setAnimatingCard(null);
            cpuAnimationScheduled.current = false;
          }
        }, getAnimationDelay(500));
      }, getAnimationDelay(600));  // Give more time for flip animation
    }, delay);

    return () => {
      clearTimeout(timeoutId);
      if (!animatingCard) {
        cpuAnimationScheduled.current = false;
      }
    };
  }, [isSpectatorMode, isSpectatorPaused, state.round.currentPlayer, state.status, state.players.human.hand, state.round.table, spectatorAIs.player1, playCard, animatingCard, scopaCelebration.show, setteBelloCelebration.show, isDealing, getAnimationDelay, getAIPlayer, buildLLMContext]);

  // If game hasn't started, show start screen
  if (state.status === 'idle') {
    return (
      <DeckProvider deck={settings.deck}>
        <StartScreen
          onStartGame={handleStartGame}
          selectedAI={settings.cpuAI}
          onSelectAI={handleSelectAI}
          spectatorAIs={spectatorAIs}
          onSelectSpectatorAI={handleSelectSpectatorAI}
          selectedDeck={settings.deck}
          onSelectDeck={(deck) => updateSetting('deck', deck)}
          geminiModel={settings.geminiModel}
          onSelectGeminiModel={(model) => updateSetting('geminiModel', model)}
        />
        <SettingsModal
          isOpen={showSettings}
          onClose={handleCloseSettings}
          settings={settings}
          onUpdateSetting={updateSetting}
          onResetSettings={resetSettings}
        />
      </DeckProvider>
    );
  }

  // Round end screen (wait for scores to be calculated)
  if (state.status === 'roundEnd' && state.lastRoundScores) {
    return (
      <DeckProvider deck={settings.deck}>
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
          onNextRound={handleNextRound}
          onShowGameEnd={showGameEnd}
          player1Name={isSpectatorMode ? getAIDisplayName(spectatorAIs.player1) : undefined}
          player2Name={getAIDisplayName(isSpectatorMode ? spectatorAIs.player2 : settings.cpuAI)}
          player1TokenStats={isSpectatorMode && spectatorAIs.player1 === 'gemini' ? tokenStats : null}
          player2TokenStats={
            isSpectatorMode
              ? spectatorAIs.player2 === 'gemini' ? tokenStats : null
              : settings.cpuAI === 'gemini' ? tokenStats : null
          }
        />
      </DeckProvider>
    );
  }

  // Game end screen
  if (state.status === 'gameEnd') {
    return (
      <DeckProvider deck={settings.deck}>
        <GameEndScreen
          humanScore={state.scores.human}
          cpuScore={state.scores.cpu}
          roundsPlayed={state.roundNumber}
          onPlayAgain={resetGame}
          player1Name={isSpectatorMode ? getAIDisplayName(spectatorAIs.player1) : undefined}
          player2Name={getAIDisplayName(isSpectatorMode ? spectatorAIs.player2 : settings.cpuAI)}
          player1TokenStats={isSpectatorMode && spectatorAIs.player1 === 'gemini' ? tokenStats : null}
          player2TokenStats={
            isSpectatorMode
              ? spectatorAIs.player2 === 'gemini' ? tokenStats : null
              : settings.cpuAI === 'gemini' ? tokenStats : null
          }
        />
      </DeckProvider>
    );
  }

  const isHumanTurn = state.round.currentPlayer === 'human';

  return (
    <DeckProvider deck={settings.deck}>
      <ScopaCelebration
        show={scopaCelebration.show}
        player={scopaCelebration.player}
        playerName={scopaCelebration.playerName}
        onComplete={() => {
          setScopaCelebration(prev => ({ ...prev, show: false }));
          setCelebrationActive(false); // Unblock input after exit animation completes
        }}
      />
      <SetteBelloCelebration
        show={setteBelloCelebration.show}
        player={setteBelloCelebration.player}
        playerName={setteBelloCelebration.playerName}
        onComplete={() => {
          setSetteBelloCelebration(prev => ({ ...prev, show: false }));
          setCelebrationActive(false); // Unblock input after exit animation completes
        }}
      />
      <CpuCardAnimation
        card={animatingCard?.card ?? null}
        phase={animatingCard?.phase ?? null}
        capturedCardIds={animatingCard?.capturedCards.map(c => c.id) ?? []}
        player={animatingCard?.player}
      />
      <DealingAnimation
        isDealing={isDealing}
        startPlayer={state.round.dealer === 'cpu' ? 'human' : 'cpu'}
        deckPosition={state.round.dealer === 'cpu' ? 'left' : 'right'}
        dealMode={dealMode}
        onComplete={() => {
          if (dealMode === 'table' && isRoundStartDeal) {
            // Phase 1 complete: enter pause phase (table cards appear, no animation)
            setDealMode('pause');
          } else if (dealMode === 'pause' && isRoundStartDeal) {
            // Pause complete: start dealing hands
            setDealMode('hands');
          } else {
            // Hands phase complete (or mid-round deal): finish dealing
            setIsDealing(false);
            setIsRoundStartDeal(false);
          }
        }}
      />
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onUpdateSetting={updateSetting}
        onResetSettings={resetSettings}
      />
      <CaptureChoiceModal
        isOpen={captureChoiceModal.isOpen}
        playedCard={captureChoiceModal.playedCard}
        captureOptions={captureChoiceModal.captureOptions}
        onSelectCapture={handleCaptureChoice}
        onCancel={handleCancelCaptureChoice}
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
              cpuName={getAIDisplayName(isSpectatorMode ? spectatorAIs.player2 : settings.cpuAI)}
              humanName={isSpectatorMode ? getAIDisplayName(spectatorAIs.player1) : undefined}
              isSpectatorMode={isSpectatorMode}
            />
            <GameControls
              onNewGame={handleNewGame}
              onOpenSettings={handleOpenSettings}
            />
          </div>
        }
        cpuHand={
          <PlayerHand
            cards={
              // Hide cards during dealing animation, otherwise filter out animating card
              isDealing
                ? []
                : animatingCard?.player === 'cpu'
                  ? state.players.cpu.hand.filter(c => c.id !== animatingCard.card.id)
                  : state.players.cpu.hand
            }
            isHuman={false}
          />
        }
        cpuPile={
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <CapturedPile
              cards={state.players.cpu.captured}
              scopaCount={state.players.cpu.scopaCount}
              player="cpu"
              playerLabel={getAIDisplayName(isSpectatorMode ? spectatorAIs.player2 : settings.cpuAI)}
            />
            {((isSpectatorMode && spectatorAIs.player2 === 'gemini') || (!isSpectatorMode && settings.cpuAI === 'gemini')) && (
              <TokenStatsDisplay stats={tokenStats} delta={tokenDelta} show mode="game" position="bottom" />
            )}
          </div>
        }
        tableCards={
          <TableCards
            ref={tableRef}
            cards={isDealing && dealMode === 'table' ? [] : state.round.table}
            highlightedCardIds={validCaptureTargetIds}
            selectedCardIds={selectedTableCards.map(c => c.id)}
            capturingCardIds={(animatingCard?.phase === 'moving' || animatingCard?.phase === 'capturing') && animatingCard?.capturedCards.length
              ? animatingCard.capturedCards.map(c => c.id)
              : undefined}
            captureDirection={animatingCard?.capturedCards.length ? animatingCard.player : undefined}
            onCardClick={handleTableCardClick}
            selectable={isHumanTurn && selectedCard !== null}
            isDragOver={isDragging}
            deckCount={state.round.deck.length}
            dealer={state.round.dealer}
          />
        }
        humanPile={
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px' }}>
            {isSpectatorMode && spectatorAIs.player1 === 'gemini' && (
              <TokenStatsDisplay stats={tokenStats} delta={tokenDelta} show mode="game" position="top" />
            )}
            <CapturedPile
              cards={state.players.human.captured}
              scopaCount={state.players.human.scopaCount}
              player="human"
              playerLabel={isSpectatorMode ? getAIDisplayName(spectatorAIs.player1) : undefined}
            />
          </div>
        }
        humanHand={
          <PlayerHand
            cards={
              // Hide cards during dealing animation, otherwise filter out animating card
              isDealing
                ? []
                : animatingCard?.player === 'human'
                  ? state.players.human.hand.filter(c => c.id !== animatingCard.card.id)
                  : state.players.human.hand
            }
            isHuman={!isSpectatorMode}
            onCardClick={isSpectatorMode ? undefined : handleHandCardClick}
            onCardDoubleClick={isSpectatorMode ? undefined : handleHandCardDoubleClick}
            onCardDragStart={isSpectatorMode ? undefined : handleCardDragStart}
            onCardDragEnd={isSpectatorMode ? undefined : handleCardDragEnd}
            selectedCardId={isSpectatorMode ? undefined : selectedCard?.id}
            disabled={isSpectatorMode || !isHumanTurn || isAnimationBlocking}
          />
        }
        controls={
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '180px' }}>
            <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
              {isSpectatorMode
                ? `${AI_INFO[getAIForPlayer(state.round.currentPlayer)].name}'s turn${isSpectatorPaused ? ' (Paused)' : ''}`
                : isHumanTurn ? 'Your turn' : `${AI_INFO[settings.cpuAI].name} thinking...`}
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
    </DeckProvider>
  );
}

export default App;
