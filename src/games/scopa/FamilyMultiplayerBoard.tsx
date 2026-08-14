import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { PanInfo } from 'framer-motion';
import { PlayerHand } from '../../components/Table/PlayerHand';
import { TableCards } from '../../components/Table/TableCards';
import { DealerDeck } from '../../components/Table/DealerDeck';
import { ScopaCelebration } from '../../components/UI/ScopaCelebration';
import { SetteBelloCelebration } from '../../components/UI/SetteBelloCelebration';
import { useSound } from '../../hooks/useSound';
import { CardBack, CardImage } from '../../components/Card/CardImage';
import { GameControls } from '../../components/UI/GameControls';
import { TurnTimer } from '../../components/UI/TurnTimer';
import type { Card } from './types';
import type { FamilyMove, FamilyPlayerId, FamilyVisibleGameState } from './multiplayer/types';
import { MULTIPLAYER_ANIMATION } from './multiplayer/animationTimings';
import styles from './FamilyMultiplayerBoard.module.css';

interface FamilyMultiplayerBoardProps {
  state: FamilyVisibleGameState;
  lastMove: { move: FamilyMove; state: FamilyVisibleGameState } | null;
  onPlayMove: (card: Card, capturedCards: Card[]) => void;
  onLeave: () => void;
  onOpenSettings: () => void;
  onOpenStats: () => void;
  onOpenRules: () => void;
  onRequestRestart: () => void;
  onRequestRematch: () => void;
  onForceMove: () => void;
  turnTimerEnabled: boolean;
  turnTimerSeconds: number | null;
  canForceMove: boolean;
  onOpenPile: (playerId: FamilyPlayerId) => void;
  soundEnabled: boolean;
  onApplyPendingState: () => void;
  onMoveAnimationComplete: () => void;
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

function localPlayerName(state: FamilyVisibleGameState, id: FamilyPlayerId): string {
  return state.players.find((player) => player.id === id)?.nickname ?? 'Player';
}

export function FamilyMultiplayerBoard({ state, lastMove, onPlayMove, onLeave, onOpenSettings, onOpenStats, onOpenRules, onRequestRestart, onRequestRematch, onForceMove, turnTimerEnabled, turnTimerSeconds, canForceMove, onOpenPile, soundEnabled, onApplyPendingState, onMoveAnimationComplete }: FamilyMultiplayerBoardProps) {
  const tableRef = useRef<HTMLDivElement>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [selectedTableCards, setSelectedTableCards] = useState<Card[]>([]);
  const [animatingMove, setAnimatingMove] = useState<FamilyMove | null>(null);
  const [animationPhase, setAnimationPhase] = useState<'reveal' | 'moving' | 'capturing' | null>(null);
  const [showScopa, setShowScopa] = useState(false);
  const [showSetteBello, setShowSetteBello] = useState(false);
  const [dealing, setDealing] = useState(false);
  const [dealKey, setDealKey] = useState(0);
  const [dealPhase, setDealPhase] = useState<'table' | 'hands'>('hands');
  const [optimisticCardId, setOptimisticCardId] = useState<string | null>(null);
  const previousDeck = useRef<number | null>(null);
  const previousRound = useRef<number | null>(null);
  const { play: playSound, resume: resumeAudio } = useSound({ enabled: soundEnabled });
  const isMyTurn = state.round.currentPlayer === state.self.id;
  const selfPlayer = state.players.find((player) => player.isSelf)!;
  const opponents = state.players.filter((player) => !player.isSelf);

  const validCaptures = useMemo(
    () => selectedCard ? getValidCaptures(selectedCard, state.round.table) : [],
    [selectedCard, state.round.table]
  );
  const selectedIds = new Set(selectedTableCards.map((card) => card.id));
  const canCapture = validCaptures.some((capture) =>
    capture.length === selectedTableCards.length && capture.every((card) => selectedIds.has(card.id))
  );

  useEffect(() => {
    if (!lastMove) return;
    const move = lastMove.move;
    const isMyMove = move.player === state.self.id;
    const hasCapture = move.capturedCards.length > 0;
    const hasCoins = move.cardPlayed.suit === 'coins' || move.capturedCards.some((card) => card.suit === 'coins');
    const hasSetteBello = [move.cardPlayed, ...move.capturedCards].some((card) => card.suit === 'coins' && card.value === 7);
    resumeAudio();
    if (isMyMove && !hasCapture) setOptimisticCardId(null);

    const celebrate = () => {
      if (hasCoins) playSound('coin');
      if (hasSetteBello) {
        playSound('setteBello');
        setShowSetteBello(true);
        window.setTimeout(() => setShowSetteBello(false), MULTIPLAYER_ANIMATION.celebration);
      }
      if (move.isScopa) {
        playSound('scopa');
        setShowScopa(true);
        window.setTimeout(() => setShowScopa(false), MULTIPLAYER_ANIMATION.celebration);
      }
    };

    if (isMyMove && !hasCapture) {
      playSound('play');
      onApplyPendingState();
      onMoveAnimationComplete();
      return;
    }

    setAnimatingMove(move);
    setAnimationPhase(isMyMove ? 'moving' : 'reveal');

    if (isMyMove) {
      window.setTimeout(() => {
        playSound('capture');
        celebrate();
        setAnimationPhase('capturing');
        onApplyPendingState();
        window.setTimeout(() => { setAnimatingMove(null); setAnimationPhase(null); setOptimisticCardId(null); onMoveAnimationComplete(); }, MULTIPLAYER_ANIMATION.captureExit);
      }, MULTIPLAYER_ANIMATION.localCaptureLeadIn);
      return;
    }

    window.setTimeout(() => {
      setAnimationPhase('moving');
      window.setTimeout(() => {
        if (hasCapture) {
          playSound('capture');
          celebrate();
          setAnimationPhase('capturing');
          onApplyPendingState();
          window.setTimeout(() => { setAnimatingMove(null); setAnimationPhase(null); onMoveAnimationComplete(); }, MULTIPLAYER_ANIMATION.captureExit);
        } else {
          playSound('play');
          setAnimatingMove(null);
          setAnimationPhase(null);
          onApplyPendingState();
          onMoveAnimationComplete();
        }
      }, MULTIPLAYER_ANIMATION.remoteMove);
    }, MULTIPLAYER_ANIMATION.remoteReveal);
  }, [lastMove, state.self.id, playSound, resumeAudio, onApplyPendingState, onMoveAnimationComplete]);

  useEffect(() => {
    const roundChanged = previousRound.current !== null && previousRound.current !== state.roundNumber;
    const deckDrop = previousDeck.current !== null ? previousDeck.current - state.round.deckCount : 0;
    const initialDeal = previousDeck.current === null || roundChanged;
    const shouldDeal = initialDeal || deckDrop >= state.players.length;
    previousDeck.current = state.round.deckCount;
    previousRound.current = state.roundNumber;
    if (!shouldDeal || state.status !== 'playing') return;
    setDealing(true);
    setDealKey((key) => key + 1);
    setDealPhase(initialDeal ? 'table' : 'hands');
    playSound('deal');
    const dealtCards = state.players.reduce((total, player) => total + Math.min(3, player.handCount), 0);
    const handDuration = Math.max(MULTIPLAYER_ANIMATION.handDeal, (Math.max(0, dealtCards - 1) * 55) + 450);
    if (initialDeal) {
      const tableTimer = window.setTimeout(() => {
        setDealPhase('hands');
        playSound('deal');
      }, MULTIPLAYER_ANIMATION.tableDeal + MULTIPLAYER_ANIMATION.dealPause);
      const endTimer = window.setTimeout(() => setDealing(false), MULTIPLAYER_ANIMATION.tableDeal + MULTIPLAYER_ANIMATION.dealPause + handDuration);
      return () => { window.clearTimeout(tableTimer); window.clearTimeout(endTimer); };
    }
    const timer = window.setTimeout(() => setDealing(false), handDuration);
    return () => window.clearTimeout(timer);
  }, [state.round.deckCount, state.roundNumber, state.players.length, state.status, playSound]);

  const play = (card: Card, capturedCards: Card[]) => {
    setOptimisticCardId(card.id);
    window.setTimeout(() => setOptimisticCardId((current) => current === card.id ? null : current), 2000);
    onPlayMove(card, capturedCards);
    setSelectedCard(null);
    setSelectedTableCards([]);
  };

  const selectCard = (card: Card) => {
    if (!isMyTurn) return;
    setSelectedCard(card);
    setSelectedTableCards([]);
    const captures = getValidCaptures(card, state.round.table);
    if (captures.length === 1) setSelectedTableCards(captures[0]);
  };

  const doubleClickCard = (card: Card) => {
    if (!isMyTurn) return;
    const captures = getValidCaptures(card, state.round.table);
    if (captures.length <= 1) play(card, captures[0] ?? []);
    else selectCard(card);
  };

  const dropCard = (card: Card, info: PanInfo) => {
    if (!isMyTurn) return;
    const captures = getValidCaptures(card, state.round.table);
    // Safari can report a scaled pointer offset after touch scrolling. A
    // modest upward movement is enough to mean "play this card".
    if (info.offset.y < -12 || info.velocity.y < -120) {
      if (captures.length <= 1) play(card, captures[0] ?? []);
      else selectCard(card);
      return;
    }
    if (!tableRef.current) return;
    const rect = tableRef.current.getBoundingClientRect();
    const padding = Math.max(80, rect.height * 0.45);
    const onTable = info.point.x >= rect.left - padding && info.point.x <= rect.right + padding && info.point.y >= rect.top - padding && info.point.y <= rect.bottom + padding;
    if (!onTable) return;
    if (captures.length <= 1) play(card, captures[0] ?? []);
    else selectCard(card);
  };

  return (
    <main className={styles.board}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <strong>Scopa</strong>
          <span>Round {state.roundNumber}</span>
        </div>
        <GameControls
          onNewGame={onLeave}
          onOpenSettings={onOpenSettings}
          onOpenStats={onOpenStats}
          onOpenRules={onOpenRules}
          onRequestRestart={onRequestRestart}
          onQuitGame={onLeave}
          isMultiplayer
          compact
        />
      </header>

      <section className={styles.seats} data-count={opponents.length} aria-label="Opponents">
        {opponents.map((player) => (
          <button key={player.id} type="button" onClick={() => state.pileViewEnabled && onOpenPile(player.id)} className={`${styles.seat} ${player.id === state.round.currentPlayer ? styles.turn : ''} ${!player.connected ? styles.offline : ''} ${state.pileViewEnabled ? styles.clickableSeat : ''}`}>
            <div className={styles.seatName}>
              <span className={styles.turnDot} aria-hidden="true" />
              <strong title={player.nickname}>{player.nickname}</strong>
              {player.id === state.round.dealer && <span className={styles.dealer}>D</span>}
            </div>
            {state.pileStatsEnabled && <div className={styles.seatStats}>
              <span>{Math.max(0, player.handCount - (animatingMove?.player === player.id && animationPhase !== 'capturing' ? 1 : 0))} hand</span>
              <span>{player.capturedCount} won</span>
              <span>{player.score} pts</span>
              {player.scopaCount > 0 && <span>{player.scopaCount} scopa</span>}
            </div>}
            {!player.connected && <small>offline</small>}
          </button>
        ))}
      </section>

      {state.restartRequests.length > 0 && (
        <div className={styles.voteBanner}>
          <span>Restart requested · {state.restartRequests.length}/{state.players.length}</span>
          <button onClick={onRequestRestart}>
            {state.restartRequests.includes(state.self.id) ? 'Cancel' : 'Accept'}
          </button>
        </div>
      )}

      {state.status === 'gameEnd' ? (
        <section className={styles.summary}><h2>Game complete</h2><div className={styles.finalScores}>{[...state.players].sort((a, b) => b.score - a.score).map((player) => <div key={player.id}><strong>{player.isSelf ? 'You' : player.nickname}</strong><span>{player.score} pts</span></div>)}</div><button onClick={onRequestRematch}>{state.rematchRequests.includes(state.self.id) ? 'Waiting for players...' : 'Play again'}</button><button onClick={onLeave}>Leave game</button></section>
      ) : (
        <>
          <section className={styles.tableSection}>
            <div className={styles.playSurface}>
              <div className={styles.deckIndicator}>
                <DealerDeck cardsRemaining={state.round.deckCount} />
              </div>
              <TableCards
                ref={tableRef}
                cards={dealing && dealPhase === 'table' ? [] : state.round.table}
                highlightedCardIds={isMyTurn && selectedCard ? validCaptures.flat().map((card) => card.id) : []}
                selectedCardIds={selectedTableCards.map((card) => card.id)}
                capturingCardIds={animationPhase === 'capturing' ? animatingMove?.capturedCards.map((card) => card.id) : []}
                captureDirection={animatingMove?.player === state.self.id ? 'human' : 'cpu'}
                onCardClick={(card) => setSelectedTableCards((current) => current.some((item) => item.id === card.id) ? current.filter((item) => item.id !== card.id) : [...current, card])}
                selectable={isMyTurn && selectedCard !== null}
              />
            </div>
            <div className={styles.turnText}>
              Deck: {state.round.deckCount} · {isMyTurn ? 'Your turn' : `Turn: ${localPlayerName(state, state.round.currentPlayer)}`}
            </div>
            {turnTimerEnabled && turnTimerSeconds !== null && (
              <div className={styles.timer}>
                <TurnTimer secondsRemaining={turnTimerSeconds} isMyTurn={isMyTurn} canForceMove={canForceMove} onForceMove={onForceMove} />
              </div>
            )}
            {animatingMove && animationPhase && (
              <motion.div
                className={styles.familyMoveAnimation}
                initial={{ y: animatingMove.player === state.self.id ? 90 : -90, opacity: 0, scale: .8 }}
                animate={animationPhase === 'capturing'
                  ? { y: animatingMove.player === state.self.id ? 100 : -100, opacity: 0, scale: .72 }
                  : { y: 0, opacity: 1, scale: 1 }}
                transition={{ duration: animationPhase === 'reveal' ? .45 : .35, ease: 'easeOut' }}
              >
                <motion.div
                  className={styles.familyFlip}
                  initial={{ rotateY: animatingMove.player === state.self.id ? 180 : 0 }}
                  animate={{ rotateY: animatingMove.player === state.self.id || animationPhase !== 'reveal' ? 180 : 0 }}
                  transition={{ duration: animationPhase === 'reveal' ? .5 : 0 }}
                >
                  <div className={styles.familyFace}><CardBack /></div>
                  <div className={`${styles.familyFace} ${styles.familyFront}`}><CardImage card={animatingMove.cardPlayed} /></div>
                </motion.div>
              </motion.div>
            )}
          </section>

          <section className={styles.bottomDock}>
            <button type="button" onClick={() => state.pileViewEnabled && onOpenPile(state.self.id)} className={`${styles.localStatus} ${state.pileViewEnabled ? styles.clickableSeat : ''}`}>
              <div className={styles.localIdentity}>
                <strong>You</strong>
                {state.self.id === state.round.dealer && <span className={styles.dealer}>D</span>}
              </div>
              {state.pileStatsEnabled && <div className={styles.localStats}>
                <span>{selfPlayer.capturedCount} won</span>
                <span>{selfPlayer.score} pts</span>
                {selfPlayer.scopaCount > 0 && <span>{selfPlayer.scopaCount} scopa</span>}
              </div>}
              <div className={`${styles.turnStatus} ${isMyTurn ? styles.myTurn : ''}`}>
                {isMyTurn ? 'Your turn' : `Waiting for ${localPlayerName(state, state.round.currentPlayer)}`}
              </div>
            </button>
            <PlayerHand
              cards={dealing ? [] : state.self.hand.filter((card) => card.id !== optimisticCardId)}
              isHuman
              onCardClick={selectCard}
              onCardDoubleClick={doubleClickCard}
              onCardDragEnd={dropCard}
              selectedCardId={selectedCard?.id}
              disabled={!isMyTurn || animatingMove !== null || dealing}
            />
            <div className={styles.actions}>
              {selectedCard && validCaptures.length === 0 && <button onClick={() => play(selectedCard, [])}>Place card</button>}
              {selectedCard && canCapture && <button onClick={() => play(selectedCard, selectedTableCards)}>Capture</button>}
              {selectedCard && validCaptures.length > 1 && <span>Select the cards to capture</span>}
            </div>
          </section>
        </>
      )}

      <ScopaCelebration
        show={showScopa}
        player={animatingMove?.player === state.self.id ? 'human' : 'cpu'}
        playerName={animatingMove ? localPlayerName(state, animatingMove.player) : undefined}
        onComplete={() => setShowScopa(false)}
      />
      <SetteBelloCelebration
        show={showSetteBello}
        player={animatingMove?.player === state.self.id ? 'human' : 'cpu'}
        playerName={animatingMove ? localPlayerName(state, animatingMove.player) : undefined}
        onComplete={() => setShowSetteBello(false)}
      />
      {dealing && (
        <div className={styles.familyDeal} key={dealKey}>
          {(dealPhase === 'table'
            ? Array.from({ length: 4 }, (_, cardIndex) => ({ player: null, playerIndex: cardIndex, cardIndex }))
            : state.players.flatMap((player, playerIndex) => Array.from({ length: Math.min(3, player.handCount) }, (_, cardIndex) => ({ player, playerIndex, cardIndex })))
          ).map(({ player, playerIndex, cardIndex }, index) => (
              <motion.div
                key={player ? `${player.id}-${cardIndex}` : `table-${cardIndex}`}
                className={styles.dealCard}
                initial={{ x: 0, y: 0, opacity: 1, scale: .75 }}
                animate={{
                  x: player ? (playerIndex - (state.players.length - 1) / 2) * 72 : (cardIndex - 1.5) * 55,
                  y: player ? (player.isSelf ? 250 : -220) : 0,
                  opacity: [1, 1, 0],
                  scale: 1,
                }}
                transition={{ duration: .45, delay: index * .055 }}
              >
                <CardBack />
              </motion.div>
          ))}
        </div>
      )}
    </main>
  );
}
