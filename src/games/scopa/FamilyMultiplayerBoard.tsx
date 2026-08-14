import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { PanInfo } from 'framer-motion';
import { PlayerHand } from '../../components/Table/PlayerHand';
import { TableCards } from '../../components/Table/TableCards';
import { CapturedPile } from '../../components/Table/CapturedPile';
import { ScopaCelebration } from '../../components/UI/ScopaCelebration';
import { Card as CardView } from '../../components/Card/Card';
import type { Card } from './types';
import type { FamilyMove, FamilyPlayerId, FamilyVisibleGameState } from './multiplayer/types';
import styles from './FamilyMultiplayerBoard.module.css';

interface FamilyMultiplayerBoardProps {
  state: FamilyVisibleGameState;
  nickname: string;
  lastMove: { move: FamilyMove; state: FamilyVisibleGameState } | null;
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

function localPlayerName(state: FamilyVisibleGameState, id: FamilyPlayerId): string {
  return state.players.find((player) => player.id === id)?.nickname ?? 'Player';
}

export function FamilyMultiplayerBoard({ state, nickname, lastMove, onPlayMove, onContinueRound, onLeave }: FamilyMultiplayerBoardProps) {
  const tableRef = useRef<HTMLDivElement>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [selectedTableCards, setSelectedTableCards] = useState<Card[]>([]);
  const [animatingMove, setAnimatingMove] = useState<FamilyMove | null>(null);
  const [animationPhase, setAnimationPhase] = useState<'reveal' | 'moving' | 'capturing' | null>(null);
  const [showScopa, setShowScopa] = useState(false);
  const isMyTurn = state.round.currentPlayer === state.self.id;

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
    setAnimationPhase(lastMove.move.player === state.self.id ? 'moving' : 'reveal');
    const movingTimer = window.setTimeout(() => setAnimationPhase(lastMove.move.capturedCards.length > 0 ? 'capturing' : null), 500);
    const duration = lastMove.move.capturedCards.length > 0 ? 1250 : 700;
    const timer = window.setTimeout(() => { setAnimatingMove(null); setAnimationPhase(null); }, duration);
    if (lastMove.move.isScopa) {
      setShowScopa(true);
      window.setTimeout(() => setShowScopa(false), 1500);
    }
    return () => { window.clearTimeout(movingTimer); window.clearTimeout(timer); };
  }, [lastMove, state.self.id]);

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

  const pileForPlayer = (player: typeof state.players[number]) => (
    <CapturedPile
      cards={[]}
      scopaCount={player.scopaCount}
      player={player.isSelf ? 'human' : 'cpu'}
      playerLabel={player.isSelf ? 'You' : player.nickname}
      capturedCount={player.capturedCount}
      showStats
    />
  );

  return (
    <main className={styles.board}>
      <header className={styles.header}>
        <div><strong>Scopa</strong><span>{nickname} · round {state.roundNumber}</span></div>
        <button onClick={onLeave}>Leave game</button>
      </header>

      <section className={styles.players} aria-label="Players">
        {state.players.map((player) => (
          <div key={player.id} className={`${styles.player} ${player.isSelf ? styles.self : ''} ${player.id === state.round.currentPlayer ? styles.turn : ''}`}>
            <strong>{player.isSelf ? 'You' : player.nickname}</strong>
            <span>{player.handCount} cards · {player.capturedCount} captured · {player.score} pts</span>
            {!player.connected && <small>offline</small>}
          </div>
        ))}
      </section>

      {state.status === 'gameEnd' ? (
        <section className={styles.summary}><h2>Game complete</h2><button onClick={onLeave}>Leave game</button></section>
      ) : state.status === 'roundEnd' ? (
        <section className={styles.summary}><h2>Round complete</h2><p>Everyone must continue before the next deal.</p><button onClick={onContinueRound}>Next round</button></section>
      ) : (
        <>
          <section className={styles.tableSection}>
            <TableCards
              ref={tableRef}
              cards={state.round.table}
              highlightedCardIds={isMyTurn && selectedCard ? validCaptures.flat().map((card) => card.id) : []}
              selectedCardIds={selectedTableCards.map((card) => card.id)}
              capturingCardIds={animationPhase === 'capturing' ? animatingMove?.capturedCards.map((card) => card.id) : []}
              captureDirection={animatingMove?.player === state.self.id ? 'human' : 'cpu'}
              onCardClick={(card) => setSelectedTableCards((current) => current.some((item) => item.id === card.id) ? current.filter((item) => item.id !== card.id) : [...current, card])}
              selectable={isMyTurn && selectedCard !== null}
              deckCount={state.round.deckCount}
              dealer={state.round.dealer === state.self.id ? 'human' : 'cpu'}
            />
            <div className={styles.turnText}>
              Deck: {state.round.deckCount} · {isMyTurn ? 'Your turn' : `Turn: ${localPlayerName(state, state.round.currentPlayer)}`}
            </div>
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

          <section className={styles.piles} aria-label="Captured piles">
            {state.players.map((player) => <div key={player.id}>{pileForPlayer(player)}</div>)}
          </section>

          <section className={styles.handSection}>
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
    </main>
  );
}
