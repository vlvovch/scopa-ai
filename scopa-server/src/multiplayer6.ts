import { customAlphabet } from 'nanoid';
import type WebSocket from 'ws';
import {
  applyMultiplayerMove,
  createMultiplayerGame,
  type MultiplayerGameState,
  startNextMultiplayerRound,
} from './game/multiplayerEngine.js';
import {
  MULTIPLAYER_SEATS,
  type MultiplayerSeatId,
  SUPPORTED_PLAYER_COUNTS,
} from './game/multiplayer.js';
import type { Card, RoundScore } from './game/types.js';
import { calculatePrime } from './game/scoring.js';
import { getRoom } from './room.js';
import { getValidMoves } from './game/rules.js';

const codeSuffix = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 3);
const rooms = new Map<string, FamilyRoom>();
const turnTimers = new Map<string, NodeJS.Timeout>();
const TURN_SECONDS = 60;

export interface FamilySocket extends WebSocket {
  familyRoomCode?: string;
  familySeat?: MultiplayerSeatId;
  familySessionToken?: string;
}

interface FamilyPlayer {
  id: MultiplayerSeatId;
  nickname: string;
  sessionToken: string;
  ws: FamilySocket | null;
  lastSeen: number;
}

interface FamilyRoom {
  code: string;
  createdAt: number;
  lastActivity: number;
  maxPlayers: number;
  targetScore: number;
  turnTimerEnabled: boolean;
  pileViewEnabled: boolean;
  pileStatsEnabled: boolean;
  players: FamilyPlayer[];
  game: MultiplayerGameState | null;
  continueRequests: Set<MultiplayerSeatId>;
  restartRequests: Set<MultiplayerSeatId>;
  rematchRequests: Set<MultiplayerSeatId>;
  turnStartedAt: number | null;
}

export function isFamilyRoom(code: string): boolean {
  return rooms.has(code.toUpperCase());
}

type FamilyMessage =
  | { type: 'CREATE_ROOM'; payload: { nickname: string; maxPlayers: number; targetScore: number; turnTimerEnabled: boolean; pileViewEnabled: boolean; pileStatsEnabled: boolean } }
  | { type: 'JOIN_ROOM'; payload: { roomCode: string; nickname: string } }
  | { type: 'RECONNECT'; payload: { roomCode: string; sessionToken: string } }
  | { type: 'PLAY_MOVE'; payload: { move: { cardPlayed: Card; capturedCards: Card[] } } }
  | { type: 'CONTINUE_ROUND' }
  | { type: 'RESTART_GAME' }
  | { type: 'START_NEW_GAME' }
  | { type: 'FORCE_MOVE' }
  | { type: 'LEAVE_ROOM' }
  | { type: 'UPDATE_NICKNAME'; payload: { nickname: string } }
  | { type: 'PING' };

function sanitizeNickname(nickname: string): string {
  return nickname.trim().slice(0, 20).replace(/[<>&"']/g, '') || 'Player';
}

function send(ws: FamilySocket | null, message: unknown): void {
  if (ws?.readyState === 1) ws.send(JSON.stringify(message));
}

function roomCode(): string {
  let code = `SCOPA-M${codeSuffix()}`;
  while (rooms.has(code) || getRoom(code)) code = `SCOPA-M${codeSuffix()}`;
  return code;
}

function sessionToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function activeSeats(room: FamilyRoom): MultiplayerSeatId[] {
  return room.players.map((player) => player.id);
}

function findPlayer(room: FamilyRoom, seat: MultiplayerSeatId): FamilyPlayer | undefined {
  return room.players.find((player) => player.id === seat);
}

function scoreRound(game: MultiplayerGameState): Record<MultiplayerSeatId, RoundScore> {
  const seats = Object.keys(game.players).filter((seat) => game.players[seat as MultiplayerSeatId].hand || game.players[seat as MultiplayerSeatId].captured.length > 0) as MultiplayerSeatId[];
  const stats = seats.map((seat) => {
    const captured = game.players[seat].captured;
    return { seat, cards: captured.length, coins: captured.filter((card) => card.suit === 'coins').length, setteBello: captured.some((card) => card.suit === 'coins' && card.value === 7), prime: calculatePrime(captured), scopas: game.players[seat].scopaCount };
  });
  const maxCards = Math.max(...stats.map((stat) => stat.cards));
  const maxCoins = Math.max(...stats.map((stat) => stat.coins));
  const primeValues = stats.map((stat) => stat.prime ?? -1);
  const maxPrime = Math.max(...primeValues);
  return Object.fromEntries(stats.map((stat) => {
    const cards = stats.filter((other) => other.cards === maxCards).length === 1 && stat.cards === maxCards ? 1 : 0;
    const coins = stats.filter((other) => other.coins === maxCoins).length === 1 && stat.coins === maxCoins ? 1 : 0;
    const prime = maxPrime >= 0 && stats.filter((other) => (other.prime ?? -1) === maxPrime).length === 1 && (stat.prime ?? -1) === maxPrime ? 1 : 0;
    const setteBello = stat.setteBello ? 1 : 0;
    const total = cards + coins + prime + setteBello + stat.scopas;
    return [stat.seat, { cards, coins, prime, setteBello, scopas: stat.scopas, total, counts: { cards: stat.cards, coins: stat.coins, prime: stat.prime } }];
  })) as Record<MultiplayerSeatId, RoundScore>;
}

function visibleState(room: FamilyRoom, viewer: MultiplayerSeatId): unknown {
  if (!room.game) return null;
  const game = room.game;
  const roundComplete = game.round.deck.length === 0 && activeSeats(room).every((seat) => game.players[seat].hand.length === 0);
  const gameComplete = roundComplete && activeSeats(room).some((seat) => game.scores[seat] >= game.targetScore);
  return {
    status: gameComplete ? 'gameEnd' : roundComplete ? 'roundEnd' : 'playing',
    round: { deckCount: game.round.deck.length, table: game.round.table, currentPlayer: game.round.currentPlayer, dealer: game.round.dealer, lastCapture: game.round.lastCapture },
    self: { id: viewer, hand: game.players[viewer].hand, captured: game.players[viewer].captured, capturedCount: game.players[viewer].captured.length, scopaCount: game.players[viewer].scopaCount },
    players: room.players.map((player) => ({ id: player.id, nickname: player.nickname, connected: player.ws !== null, isSelf: player.id === viewer, handCount: game.players[player.id].hand.length, capturedCount: game.players[player.id].captured.length, captured: game.players[player.id].captured, scopaCount: game.players[player.id].scopaCount, score: game.scores[player.id] ?? 0 })),
    scores: game.scores,
    roundNumber: game.roundNumber,
    targetScore: game.targetScore,
    pileViewEnabled: room.pileViewEnabled,
    pileStatsEnabled: room.pileStatsEnabled,
    continueRequests: [...room.continueRequests],
    restartRequests: [...room.restartRequests],
    rematchRequests: [...room.rematchRequests],
  };
}

function broadcastState(room: FamilyRoom, type: 'GAME_START6' | 'GAME_STATE6' | 'MOVE_PLAYED6', move?: { player: MultiplayerSeatId; cardPlayed: Card; capturedCards: Card[]; isScopa: boolean }): void {
  for (const player of room.players) {
    const state = visibleState(room, player.id);
    if (!state) continue;
    send(player.ws, { type, payload: move ? { state, move } : { state } });
  }
}

function roomSnapshot(room: FamilyRoom, seat: MultiplayerSeatId): void {
  send(findPlayer(room, seat)?.ws ?? null, { type: 'ROOM_SNAPSHOT6', payload: { roomCode: room.code, playerId: seat, maxPlayers: room.maxPlayers, targetScore: room.targetScore, turnTimerEnabled: room.turnTimerEnabled, players: room.players.map((player) => ({ id: player.id, nickname: player.nickname, connected: player.ws !== null, isSelf: player.id === seat })) } });
}

function startGame(room: FamilyRoom): void {
  const seats = activeSeats(room);
  room.game = createMultiplayerGame(seats, room.targetScore, seats[0]);
  broadcastState(room, 'GAME_START6');
  startTurnTimer(room);
}

function clearTurnTimer(room: FamilyRoom): void {
  const timer = turnTimers.get(room.code);
  if (timer) clearTimeout(timer);
  turnTimers.delete(room.code);
  room.turnStartedAt = null;
}

function startTurnTimer(room: FamilyRoom): void {
  clearTurnTimer(room);
  if (!room.turnTimerEnabled || !room.game || room.game.round.deck.length === 0 && activeSeats(room).every((seat) => room.game!.players[seat].hand.length === 0)) return;
  room.turnStartedAt = Date.now();
  const player = room.game.round.currentPlayer;
  for (const member of room.players) send(member.ws, { type: 'TIMER_START', payload: { seconds: TURN_SECONDS, player } });
  turnTimers.set(room.code, setTimeout(() => {
    if (!room.game) return;
    for (const member of room.players) send(member.ws, { type: 'TIMER_EXPIRED', payload: { player: room.game.round.currentPlayer } });
  }, TURN_SECONDS * 1000));
}

function handleCreate(ws: FamilySocket, payload: Extract<FamilyMessage, { type: 'CREATE_ROOM' }>['payload']): void {
  if (!SUPPORTED_PLAYER_COUNTS.includes(payload.maxPlayers) || payload.maxPlayers > MULTIPLAYER_SEATS.length) {
    send(ws, { type: 'ERROR', payload: { code: 'INVALID_PLAYER_COUNT', message: 'Choose 2, 3, 4, 5, or 6 players' } });
    return;
  }
  const player: FamilyPlayer = { id: MULTIPLAYER_SEATS[0], nickname: sanitizeNickname(payload.nickname), sessionToken: sessionToken(), ws, lastSeen: Date.now() };
  const room: FamilyRoom = { code: roomCode(), createdAt: Date.now(), lastActivity: Date.now(), maxPlayers: payload.maxPlayers, targetScore: payload.targetScore, turnTimerEnabled: payload.turnTimerEnabled, pileViewEnabled: payload.pileViewEnabled, pileStatsEnabled: payload.pileStatsEnabled, players: [player], game: null, continueRequests: new Set(), restartRequests: new Set(), rematchRequests: new Set(), turnStartedAt: null };
  rooms.set(room.code, room);
  ws.familyRoomCode = room.code;
  ws.familySeat = player.id;
  ws.familySessionToken = player.sessionToken;
  send(ws, { type: 'ROOM_CREATED6', payload: { roomCode: room.code, sessionToken: player.sessionToken, playerId: player.id, maxPlayers: room.maxPlayers } });
  roomSnapshot(room, player.id);
}

function handleJoin(ws: FamilySocket, payload: Extract<FamilyMessage, { type: 'JOIN_ROOM' }>['payload']): void {
  const room = rooms.get(payload.roomCode.toUpperCase());
  if (!room) { send(ws, { type: 'ERROR', payload: { code: 'ROOM_NOT_FOUND', message: 'Room not found' } }); return; }
  if (room.players.length >= room.maxPlayers || room.game) { send(ws, { type: 'ERROR', payload: { code: 'ROOM_FULL', message: 'Room is full or already started' } }); return; }
  const playerId = MULTIPLAYER_SEATS.find((seat) => !room.players.some((player) => player.id === seat));
  if (!playerId) { send(ws, { type: 'ERROR', payload: { code: 'ROOM_FULL', message: 'Room is already full' } }); return; }
  const player: FamilyPlayer = { id: playerId, nickname: sanitizeNickname(payload.nickname), sessionToken: sessionToken(), ws, lastSeen: Date.now() };
  room.players.push(player);
  room.lastActivity = Date.now();
  clearTurnTimer(room);
  ws.familyRoomCode = room.code;
  ws.familySeat = player.id;
  ws.familySessionToken = player.sessionToken;
  send(ws, { type: 'ROOM_JOINED6', payload: { roomCode: room.code, sessionToken: player.sessionToken, playerId: player.id, maxPlayers: room.maxPlayers, targetScore: room.targetScore, turnTimerEnabled: room.turnTimerEnabled } });
  for (const member of room.players) roomSnapshot(room, member.id);
  if (room.players.length === room.maxPlayers) startGame(room);
}

function handleMove(ws: FamilySocket, payload: Extract<FamilyMessage, { type: 'PLAY_MOVE' }>['payload']): void {
  const room = rooms.get(ws.familyRoomCode ?? '');
  if (!room?.game || !ws.familySeat) return;
  const game = room.game;
  if (game.round.currentPlayer !== ws.familySeat) { send(ws, { type: 'ERROR', payload: { code: 'NOT_YOUR_TURN', message: 'It is not your turn' } }); return; }
  try {
    room.game = applyMultiplayerMove(game, activeSeats(room), { player: ws.familySeat, cardPlayed: payload.move.cardPlayed, capturedCards: payload.move.capturedCards });
  } catch (error) {
    send(ws, { type: 'ERROR', payload: { code: 'INVALID_MOVE', message: error instanceof Error ? error.message : 'Invalid move' } });
    return;
  }
  room.lastActivity = Date.now();
  if (room.game.round.deck.length === 0 && activeSeats(room).every((seat) => room.game!.players[seat].hand.length === 0)) {
    clearTurnTimer(room);
    if (room.game.round.table.length > 0 && room.game.round.lastCapture) room.game.players[room.game.round.lastCapture].captured.push(...room.game.round.table);
    const scores = scoreRound(room.game);
    for (const seat of activeSeats(room)) room.game.scores[seat] += scores[seat].total;
    for (const player of room.players) {
      send(player.ws, { type: 'ROUND_END6', payload: { scores, state: visibleState(room, player.id) } });
    }
  } else {
    broadcastState(room, 'MOVE_PLAYED6', { player: ws.familySeat, cardPlayed: payload.move.cardPlayed, capturedCards: payload.move.capturedCards, isScopa: payload.move.capturedCards.length > 0 && room.game.round.table.length === 0, });
    startTurnTimer(room);
  }
}

function handleContinueRound(ws: FamilySocket): void {
  const room = rooms.get(ws.familyRoomCode ?? '');
  if (!room?.game || room.game.round.deck.length > 0 || activeSeats(room).some((seat) => room.game!.players[seat].hand.length > 0)) return;
  if (!ws.familySeat) return;
  room.continueRequests.add(ws.familySeat);
  if (room.continueRequests.size < room.players.length) { broadcastState(room, 'GAME_STATE6'); return; }
  room.continueRequests.clear();
  room.game = startNextMultiplayerRound(room.game, activeSeats(room));
  broadcastState(room, 'GAME_START6');
  startTurnTimer(room);
}

function resetFamilyGame(room: FamilyRoom): void {
  room.continueRequests.clear();
  room.restartRequests.clear();
  room.rematchRequests.clear();
  room.game = createMultiplayerGame(activeSeats(room), room.targetScore, activeSeats(room)[0]);
  broadcastState(room, 'GAME_START6');
  startTurnTimer(room);
}

function handleRestart(ws: FamilySocket): void {
  const room = rooms.get(ws.familyRoomCode ?? '');
  if (!room?.game || !ws.familySeat || room.game.round.deck.length === 0 && activeSeats(room).every((seat) => room.game!.players[seat].hand.length === 0)) return;
  if (room.restartRequests.has(ws.familySeat)) room.restartRequests.delete(ws.familySeat);
  else room.restartRequests.add(ws.familySeat);
  if (room.restartRequests.size === room.players.length) resetFamilyGame(room);
  else broadcastState(room, 'GAME_STATE6');
}

function handleRematch(ws: FamilySocket): void {
  const room = rooms.get(ws.familyRoomCode ?? '');
  if (!room?.game || !ws.familySeat || !activeSeats(room).some((seat) => room.game!.scores[seat] >= room.targetScore)) return;
  room.rematchRequests.add(ws.familySeat);
  if (room.rematchRequests.size === room.players.length) resetFamilyGame(room);
  else broadcastState(room, 'GAME_STATE6');
}

function handleForceMove(ws: FamilySocket): void {
  const room = rooms.get(ws.familyRoomCode ?? '');
  if (!room?.game || !ws.familySeat || !room.turnTimerEnabled || !room.turnStartedAt || room.game.round.currentPlayer === ws.familySeat) return;
  if (Date.now() - room.turnStartedAt < TURN_SECONDS * 1000) return;
  forceSeatMove(room, room.game.round.currentPlayer);
}

function forceSeatMove(room: FamilyRoom, seat: MultiplayerSeatId): void {
  if (!room.game || room.game.round.currentPlayer !== seat) return;
  const player = room.game.players[seat];
  const card = player.hand[Math.floor(Math.random() * player.hand.length)];
  if (!card) return;
  const moves = getValidMoves(card, room.game.round.table, 'player1');
  const move = moves[Math.floor(Math.random() * moves.length)];
  const detachedSocket = { familyRoomCode: room.code, familySeat: seat } as FamilySocket;
  handleMove(detachedSocket, { move: { cardPlayed: move.cardPlayed, capturedCards: move.capturedCards } });
}

export function isFamilyCreateMessage(message: unknown): message is Extract<FamilyMessage, { type: 'CREATE_ROOM' }> {
  return typeof message === 'object' && message !== null && (message as { type?: string }).type === 'CREATE_ROOM' && typeof (message as { payload?: { maxPlayers?: unknown } }).payload?.maxPlayers === 'number' && (message as { payload: { maxPlayers: number } }).payload.maxPlayers > 2;
}

export function handleFamilyConnection(ws: FamilySocket, firstMessage?: FamilyMessage): void {
  const handle = (message: FamilyMessage) => {
    switch (message.type) {
      case 'CREATE_ROOM': handleCreate(ws, message.payload); break;
      case 'JOIN_ROOM': handleJoin(ws, message.payload); break;
      case 'PLAY_MOVE': handleMove(ws, message.payload); break;
      case 'CONTINUE_ROUND': handleContinueRound(ws); break;
      case 'RESTART_GAME': handleRestart(ws); break;
      case 'START_NEW_GAME': handleRematch(ws); break;
      case 'FORCE_MOVE': handleForceMove(ws); break;
      case 'UPDATE_NICKNAME': { const room = rooms.get(ws.familyRoomCode ?? ''); const player = room && ws.familySeat && findPlayer(room, ws.familySeat); if (player) { player.nickname = sanitizeNickname(message.payload.nickname); for (const member of room.players) roomSnapshot(room, member.id); } break; }
      case 'LEAVE_ROOM': { const room = rooms.get(ws.familyRoomCode ?? ''); if (room && ws.familySeat) { if (room.game) { clearTurnTimer(room); for (const member of room.players) send(member.ws, { type: 'GAME_ABORTED6', payload: { reason: 'A player left the game' } }); rooms.delete(room.code); } else { room.players = room.players.filter((player) => player.id !== ws.familySeat); if (room.players.length === 0) rooms.delete(room.code); else for (const member of room.players) roomSnapshot(room, member.id); } } break; }
      case 'PING': send(ws, { type: 'PONG' }); break;
      case 'RECONNECT': {
        const room = rooms.get(message.payload.roomCode.toUpperCase());
        const player = room?.players.find((candidate) => candidate.sessionToken === message.payload.sessionToken);
        if (room && player) {
          player.ws = ws;
          ws.familyRoomCode = room.code;
          ws.familySeat = player.id;
          ws.familySessionToken = player.sessionToken;
          for (const member of room.players) roomSnapshot(room, member.id);
          if (room.game) {
            broadcastState(room, 'GAME_STATE6');
            if (room.turnTimerEnabled && room.turnStartedAt) {
              const elapsed = Math.floor((Date.now() - room.turnStartedAt) / 1000);
              const seconds = Math.max(0, TURN_SECONDS - elapsed);
              send(ws, { type: seconds > 0 ? 'TIMER_START' : 'TIMER_EXPIRED', payload: seconds > 0 ? { seconds, player: room.game.round.currentPlayer } : { player: room.game.round.currentPlayer } });
            }
          }
        } else send(ws, { type: 'ERROR', payload: { code: 'INVALID_SESSION', message: 'Invalid session' } });
        break;
      }
    }
  };
  if (firstMessage) handle(firstMessage);
  ws.on('message', (data: Buffer) => { try { handle(JSON.parse(data.toString()) as FamilyMessage); } catch { send(ws, { type: 'ERROR', payload: { code: 'INVALID_SESSION', message: 'Invalid message' } }); } });
  ws.on('close', () => {
    const room = rooms.get(ws.familyRoomCode ?? '');
    const player = room && ws.familySeat && findPlayer(room, ws.familySeat);
    if (player?.ws === ws) {
      player.ws = null;
      player.lastSeen = Date.now();
      for (const member of room!.players) roomSnapshot(room!, member.id);
      if (room!.game) broadcastState(room!, 'GAME_STATE6');
    }
  });
}