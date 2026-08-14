import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { PanInfo } from 'framer-motion';
import { PlayerHand } from '../../components/Table/PlayerHand';
import { TableCards } from '../../components/Table/TableCards';
import { DealerDeck } from '../../components/Table/DealerDeck';
import { ScopaCelebration } from '../../components/UI/ScopaCelebration';
import { SetteBelloCelebration } from '../../components/UI/SetteBelloCelebration';
import { useSound } from '../../hooks/useSound';
import { Card as CardView } from '../../components/Card/Card';
import { GameControls } from '../../components/UI/GameControls';
import { TurnTimer } from '../../components/UI/TurnTimer';
import type { Card } from './types';
import type { FamilyMove, FamilyPlayerId, FamilyVisibleGameState } from './multiplayer/types';
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

export function FamilyMultiplayerBoard({ state, lastMove, onPlayMove, onLeave, onOpenSettings, onOpenStats, onOpenRules, onRequestRestart, onRequestRematch, onForceMove, turnTimerEnabled, turnTimerSeconds, canForceMove, onOpenPile, soundEnabled }: FamilyMultiplayerBoardProps) {
  const tableRef = useRef<HTMLDivElement>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [selectedTableCards, setSelectedTableCards] = useState<Card[]>([]);
  const [animatingMove, setAnimatingMove] = useState<FamilyMove | null>(null);
  const [animationPhase, setAnimationPhase] = useState<'reveal' | 'moving' | 'capturing' | null>(null);
  const [showScopa, setShowScopa] = useState(false);
  const [showSetteBello, setShowSetteBello] = useState(false);
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
    setAnimatingMove(lastMove.move);
    resumeAudio();
    playSound(lastMove.move.capturedCards.length > 0 ? 'capture' : 'play');
    setAnimationPhase(lastMove.move.player === state.self.id ? 'moving' : 'reveal');
    const movingTimer = window.setTimeout(() => setAnimationPhase(lastMove.move.capturedCards.length > 0 ? 'capturing' : null), 500);
    const duration = lastMove.move.capturedCards.length > 0 ? 1250 : 700;
    const timer = window.setTimeout(() => { setAnimatingMove(null); setAnimationPhase(null); }, duration);
    if (lastMove.move.isScopa) {
      playSound('scopa');
      setShowScopa(true);
      window.setTimeout(() => setShowScopa(false), 1500);
    }
    const capturedSetteBello = [lastMove.move.cardPlayed, ...lastMove.move.capturedCards].some((card) => card.suit === 'coins' && card.value === 7);
    if (capturedSetteBello) {
      playSound('setteBello');
      setShowSetteBello(true);
      window.setTimeout(() => setShowSetteBello(false), 1500);
    }
    return () => { window.clearTimeout(movingTimer); window.clearTimeout(timer); };
  }, [lastMove, state.self.id, playSound, resumeAudio]);

  const play = (card: Card, capturedCards: Card[]) => {
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
              <span>{player.handCount} hand</span>
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
                cards={state.round.table}
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
                <CardView card={animatingMove.cardPlayed} />
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
              cards={state.self.hand}
              isHuman
              onCardClick={selectCard}
              onCardDoubleClick={doubleClickCard}
              onCardDragEnd={dropCard}
              selectedCardId={selectedCard?.id}
              disabled={!isMyTurn || animatingMove !== null}
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
    </main>
  );
}
