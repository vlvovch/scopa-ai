// useMultiplayer Hook - WebSocket connection management for multiplayer

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Card } from '../games/scopa/types';
import type {
  ClientMessage,
  ServerMessage,
  MultiplayerPlayerId,
  MultiplayerMove,
  PlayerVisibleGameState,
  MultiplayerSession,
  ConnectionStatus,
  RoundScore,
  FamilyVisibleGameState,
  FamilyRoomPlayer,
  FamilyPlayerId,
} from '../games/scopa/multiplayer/types';

// A relative /ws URL keeps local Docker tunnels portable: the browser uses
// the same public origin for HTTPS and WebSocket traffic.
function getWebSocketUrl(): string {
  const configuredUrl = import.meta.env.VITE_WS_URL;
  if (configuredUrl && configuredUrl !== '/ws') return configuredUrl;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}
const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_ATTEMPTS = 5;
const PING_INTERVAL_MS = 30000;
const SESSION_STORAGE_KEY = 'scopa-mp-session';

export interface UseMultiplayerReturn {
  // Connection state
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  /** True from when a RECONNECT is sent until RECONNECT_SUCCESS or a
   *  terminal failure. connectionStatus flips to 'connected' as soon as
   *  the WS handshake completes (before the room is restored), so this is
   *  the reliable "still restoring the game" signal for the UI. */
  isReconnecting: boolean;

  // Room state
  roomCode: string | null;
  playerId: MultiplayerPlayerId | null;
  nickname: string;
  opponentNickname: string | null;
  isOpponentConnected: boolean;

  // Game settings
  targetScore: number;
  turnTimerEnabled: boolean;
  pileViewEnabled: boolean;
  pileStatsEnabled: boolean;

  // Game state
  gameState: PlayerVisibleGameState | null;

  // Timer state
  turnTimerSeconds: number | null;
  canForceMove: boolean;

  // Round/Game end
  roundEndData: {
    scores: Record<MultiplayerPlayerId, RoundScore>;
    cumulativeScores: Record<MultiplayerPlayerId, number>;
    capturedCards: Record<MultiplayerPlayerId, Card[]>;
    /** Cards captured during each scopa (for highlighting in round summary) */
    scopaCaptures: Record<MultiplayerPlayerId, Card[][]>;
    lastCapture: MultiplayerPlayerId;
    /** Cards remaining on table that go to lastCapture player (for animation) */
    remainingTableCards: Card[];
  } | null;
  gameEndData: {
    winner: MultiplayerPlayerId | 'tie';
    finalScores: Record<MultiplayerPlayerId, number>;
    roundScores: Record<MultiplayerPlayerId, RoundScore>;
    capturedCards: Record<MultiplayerPlayerId, Card[]>;
  } | null;

  // Rematch
  newGameRequestedBy: MultiplayerPlayerId | null;

  // Mid-game restart
  restartRequestedBy: MultiplayerPlayerId | null;

  // Next round
  nextRoundRequests: Set<MultiplayerPlayerId>;

  // Last move (for animations/sounds)
  lastMove: {
    move: MultiplayerMove;
    byPlayer: MultiplayerPlayerId;
    pendingState: PlayerVisibleGameState; // State to apply after animation
  } | null;
  clearLastMove: () => void;
  applyPendingState: () => void;

  // Actions
  createRoom: (
    nickname: string,
    targetScore: number,
    turnTimerEnabled: boolean,
    roomOptions: Record<string, boolean | number>
  ) => void;
  joinRoom: (code: string, nickname: string) => void;
  playMove: (move: MultiplayerMove) => void;
  forceMove: () => void;
  requestNewGame: () => void;
  requestRestart: () => void;
  continueToNextRound: () => void;
  updateNickname: (nickname: string) => void;
  leaveRoom: () => void;
  clearRoundEnd: () => void;
  clearGameEnd: () => void;
  playFamilyMove: (card: Card, capturedCards: Card[]) => void;
  continueFamilyRound: () => void;
  familyState: FamilyVisibleGameState | null;
  familyPlayers: FamilyRoomPlayer[];
  familyMaxPlayers: number;
  familyLastMove: { move: import('../games/scopa/multiplayer/types').FamilyMove; state: FamilyVisibleGameState } | null;
  requestFamilyRestart: () => void;
  requestFamilyRematch: () => void;
  forceFamilyMove: () => void;
  familyRoundEndData: { scores: Record<FamilyPlayerId, RoundScore>; gameOver: boolean } | null;
  clearFamilyRoundEnd: () => void;
}

export function useMultiplayer(): UseMultiplayerReturn {
  // WebSocket ref
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const pingIntervalRef = useRef<number | null>(null);

  // Connection state
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  // True between sending RECONNECT and its resolution. Lets the ERROR
  // handler tell a reconnect-rejection (stale room) apart from an
  // in-game error so only the former tears down the session and falls
  // back to the lobby.
  const reconnectPendingRef = useRef(false);

  // Room state
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<MultiplayerPlayerId | null>(null);
  const [nickname, setNickname] = useState('');
  const [opponentNickname, setOpponentNickname] = useState<string | null>(null);
  const [isOpponentConnected, setIsOpponentConnected] = useState(false);

  // Game settings
  const [targetScore, setTargetScore] = useState(11);
  const [turnTimerEnabled, setTurnTimerEnabled] = useState(false);
  // Host option: whether the captured-pile review modal is available.
  // Default OFF — between two humans piles are public info but you play
  // from memory; hosts opt in.
  const [pileViewEnabled, setPileViewEnabled] = useState(false);
  // Host option: whether the mid-game captured-pile stats badge is shown.
  // Default OFF — stats are revealed at the round-end summary instead.
  const [pileStatsEnabled, setPileStatsEnabled] = useState(false);

  // Game state
  const [gameState, setGameState] = useState<PlayerVisibleGameState | null>(null);
  const [familyState, setFamilyState] = useState<FamilyVisibleGameState | null>(null);
  const [familyPlayers, setFamilyPlayers] = useState<FamilyRoomPlayer[]>([]);
  const [familyMaxPlayers, setFamilyMaxPlayers] = useState(2);
  const [familyLastMove, setFamilyLastMove] = useState<UseMultiplayerReturn['familyLastMove']>(null);
  const [familyRoundEndData, setFamilyRoundEndData] = useState<UseMultiplayerReturn['familyRoundEndData']>(null);

  // Timer state
  const [turnTimerSeconds, setTurnTimerSeconds] = useState<number | null>(null);
  const [canForceMove, setCanForceMove] = useState(false);
  const timerIntervalRef = useRef<number | null>(null);

  // Round/Game end
  const [roundEndData, setRoundEndData] = useState<UseMultiplayerReturn['roundEndData']>(null);
  const [gameEndData, setGameEndData] = useState<UseMultiplayerReturn['gameEndData']>(null);

  // Rematch
  const [newGameRequestedBy, setNewGameRequestedBy] = useState<MultiplayerPlayerId | null>(null);

  // Mid-game restart
  const [restartRequestedBy, setRestartRequestedBy] = useState<MultiplayerPlayerId | null>(null);

  // Next round
  const [nextRoundRequests, setNextRoundRequests] = useState<Set<MultiplayerPlayerId>>(new Set());

  // Last move (for animations/sounds)
  const [lastMove, setLastMove] = useState<UseMultiplayerReturn['lastMove']>(null);

  // Session ref for reconnection
  const sessionRef = useRef<MultiplayerSession | null>(null);

  // Ref to always have the latest handleServerMessage (avoids stale closure in WebSocket onmessage)
  const handleServerMessageRef = useRef<(message: ServerMessage) => void>(() => {});

  // ============================================================================
  // Session Persistence
  // ============================================================================

  const saveSession = useCallback((session: MultiplayerSession) => {
    sessionRef.current = session;
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // localStorage not available
    }
  }, []);

  const loadSession = useCallback((): MultiplayerSession | null => {
    try {
      const stored = localStorage.getItem(SESSION_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // localStorage not available or invalid data
    }
    return null;
  }, []);

  const clearSession = useCallback(() => {
    sessionRef.current = null;
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // localStorage not available
    }
  }, []);

  // ============================================================================
  // WebSocket Message Handling
  // ============================================================================

  const handleServerMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case 'ROOM_CREATED6':
        setRoomCode(message.payload.roomCode);
        setPlayerId(message.payload.playerId as MultiplayerPlayerId);
        setFamilyMaxPlayers(message.payload.maxPlayers);
        saveSession({ sessionToken: message.payload.sessionToken, roomCode: message.payload.roomCode, playerId: message.payload.playerId, nickname });
        break;
      case 'ROOM_JOINED6':
        setRoomCode(message.payload.roomCode);
        setPlayerId(message.payload.playerId as MultiplayerPlayerId);
        setFamilyMaxPlayers(message.payload.maxPlayers);
        setTargetScore(message.payload.targetScore);
        setTurnTimerEnabled(message.payload.turnTimerEnabled);
        saveSession({ sessionToken: message.payload.sessionToken, roomCode: message.payload.roomCode, playerId: message.payload.playerId, nickname });
        break;
      case 'ROOM_SNAPSHOT6':
        setRoomCode(message.payload.roomCode);
        setPlayerId(message.payload.playerId as MultiplayerPlayerId);
        reconnectPendingRef.current = false;
        setIsReconnecting(false);
        setFamilyMaxPlayers(message.payload.maxPlayers);
        setTargetScore(message.payload.targetScore);
        setTurnTimerEnabled(message.payload.turnTimerEnabled);
        setFamilyPlayers(message.payload.players);
        break;
      case 'GAME_START6':
        setFamilyRoundEndData(null);
        setFamilyState(message.payload.state);
        setFamilyPlayers(message.payload.state.players);
        setRestartRequestedBy((message.payload.state.restartRequests[0] as MultiplayerPlayerId | undefined) ?? null);
        break;
      case 'GAME_STATE6':
        setFamilyState(message.payload.state);
        setFamilyPlayers(message.payload.state.players);
        setFamilyRoundEndData(message.payload.state.lastRoundScores ? { scores: message.payload.state.lastRoundScores, gameOver: message.payload.state.lastRoundGameOver } : null);
        setPileViewEnabled(message.payload.state.pileViewEnabled);
        setPileStatsEnabled(message.payload.state.pileStatsEnabled);
        setRestartRequestedBy((message.payload.state.restartRequests[0] as MultiplayerPlayerId | undefined) ?? null);
        break;
      case 'MOVE_PLAYED6':
        setFamilyState(message.payload.state);
        setFamilyPlayers(message.payload.state.players);
        setFamilyLastMove({ move: message.payload.move, state: message.payload.state });
        break;
      case 'ROUND_END6':
        setFamilyState(message.payload.state);
        setFamilyPlayers(message.payload.state.players);
        setFamilyRoundEndData({ scores: message.payload.scores, gameOver: message.payload.state.status === 'gameEnd' });
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
        setTurnTimerSeconds(null);
        break;
      case 'GAME_ABORTED6':
        clearSession();
        setRoomCode(null);
        setFamilyState(null);
        setFamilyPlayers([]);
        setConnectionError(message.payload.reason);
        break;
      case 'ROOM_CREATED':
        setRoomCode(message.payload.roomCode);
        setPlayerId(message.payload.playerId);
        saveSession({
          sessionToken: message.payload.sessionToken,
          roomCode: message.payload.roomCode,
          playerId: message.payload.playerId,
          nickname,
        });
        break;

      case 'ROOM_JOINED':
        setRoomCode(message.payload.roomCode);
        setPlayerId(message.payload.playerId);
        setOpponentNickname(message.payload.opponentNickname);
        setIsOpponentConnected(true);
        setTargetScore(message.payload.targetScore);
        setTurnTimerEnabled(message.payload.turnTimerEnabled);
        setPileViewEnabled(message.payload.pileViewEnabled);
        setPileStatsEnabled(message.payload.pileStatsEnabled);
        saveSession({
          sessionToken: message.payload.sessionToken,
          roomCode: message.payload.roomCode,
          playerId: message.payload.playerId,
          nickname,
        });
        break;

      case 'OPPONENT_JOINED':
        setOpponentNickname(message.payload.opponentNickname);
        setIsOpponentConnected(true);
        break;

      case 'GAME_START':
        setGameState(message.payload.state);
        setRoundEndData(null);
        setGameEndData(null);
        setNewGameRequestedBy(null);
        break;

      case 'GAME_STATE':
        setGameState(message.payload.state);
        break;

      case 'MOVE_PLAYED':
        // Don't update game state immediately - store it for after animation
        // The animation effect in App.tsx will apply the pending state after animation completes
        // Stop local timer countdown (server will send TIMER_START for next turn)
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
        setCanForceMove(false);
        setTurnTimerSeconds(null);
        // Track last move with pending state for animations
        setLastMove({
          move: message.payload.move,
          byPlayer: message.payload.move.player,
          pendingState: message.payload.state,
        });
        break;

      case 'ROUND_END':
        setRoundEndData({
          scores: message.payload.scores,
          cumulativeScores: message.payload.cumulativeScores,
          capturedCards: message.payload.capturedCards,
          scopaCaptures: message.payload.scopaCaptures,
          lastCapture: message.payload.lastCapture,
          remainingTableCards: message.payload.remainingTableCards,
        });
        break;

      case 'GAME_END':
        setGameEndData({
          winner: message.payload.winner,
          finalScores: message.payload.finalScores,
          roundScores: message.payload.roundScores,
          capturedCards: message.payload.capturedCards,
        });
        break;

      case 'OPPONENT_DISCONNECTED':
        setIsOpponentConnected(false);
        break;

      case 'OPPONENT_RECONNECTED':
        setIsOpponentConnected(true);
        break;

      case 'RECONNECT_SUCCESS':
        // Restore all state after successful reconnection
        reconnectPendingRef.current = false;
        setIsReconnecting(false);
        setPlayerId(message.payload.playerId);
        setOpponentNickname(message.payload.opponentNickname);
        setIsOpponentConnected(message.payload.opponentConnected);
        setTargetScore(message.payload.targetScore);
        setTurnTimerEnabled(message.payload.turnTimerEnabled);
        setPileViewEnabled(message.payload.pileViewEnabled);
        setPileStatsEnabled(message.payload.pileStatsEnabled);
        if (message.payload.state) {
          setGameState(message.payload.state);
        }
        break;

      case 'TIMER_START':
        // Clear any existing timer interval
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
        }
        setCanForceMove(false);
        setTurnTimerSeconds(message.payload.seconds);
        // Start local countdown
        timerIntervalRef.current = window.setInterval(() => {
          setTurnTimerSeconds(prev => {
            if (prev === null || prev <= 1) {
              if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
              }
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
        break;

      case 'TIMER_EXPIRED':
        // Stop local countdown
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
        setTurnTimerSeconds(0);
        if (playerId && message.payload.player !== playerId) {
          setCanForceMove(true);
        }
        break;

      case 'NEW_GAME_REQUESTED':
        setNewGameRequestedBy(message.payload.by);
        break;

      case 'NEW_GAME_STARTED':
        setGameState(message.payload.state);
        setRoundEndData(null);
        setGameEndData(null);
        setNewGameRequestedBy(null);
        setRestartRequestedBy(null);
        break;

      case 'RESTART_REQUESTED':
        setRestartRequestedBy(message.payload.by);
        break;

      case 'RESTART_CANCELLED':
        setRestartRequestedBy(null);
        break;

      case 'NEXT_ROUND_REQUESTED':
        setNextRoundRequests(prev => new Set([...prev, message.payload.by]));
        break;

      case 'NEXT_ROUND_STARTED':
        setGameState(message.payload.state);
        setRoundEndData(null);
        setNextRoundRequests(new Set());
        break;

      case 'NICKNAME_UPDATED':
        if (playerId && message.payload.playerId !== playerId) {
          setOpponentNickname(message.payload.nickname);
        }
        break;

      case 'ERROR': {
        const code = message.payload.code;
        const isReconnectRejection =
          reconnectPendingRef.current &&
          (code === 'ROOM_NOT_FOUND' || code === 'INVALID_SESSION');

        if (isReconnectRejection) {
          // The room is gone (server restarted, or it expired). Tear the
          // stale session down and fall back to the lobby with a clear,
          // persistent message instead of hanging on a "Reconnecting…"
          // screen forever. clearSession() makes the ws.onclose handler's
          // loadSession() return null, so it won't loop-retry either.
          reconnectPendingRef.current = false;
          setIsReconnecting(false);
          clearSession();
          setRoomCode(null);
          setPlayerId(null);
          setGameState(null);
          setFamilyState(null);
          setFamilyPlayers([]);
          setFamilyLastMove(null);
          setFamilyRoundEndData(null);
          setRoundEndData(null);
          setGameEndData(null);
          setConnectionStatus('disconnected');
          setConnectionError(
            'Your previous game is no longer available — it may have ended or the server restarted.'
          );
          // Persistent: no auto-clear, the lobby keeps showing it.
          break;
        }

        setConnectionError(message.payload.message);
        // Transient in-game error (e.g. rejected move) — clear after 5s.
        setTimeout(() => setConnectionError(null), 5000);
        break;
      }

      case 'PONG':
        // Keep-alive response, nothing to do
        break;
    }
  }, [nickname, playerId, saveSession, clearSession]);

  // Keep the ref updated with the latest callback
  handleServerMessageRef.current = handleServerMessage;

  // ============================================================================
  // WebSocket Connection
  // ============================================================================

  const sendMessage = useCallback((message: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const connect = useCallback((attemptReconnect = false) => {
    // Don't create new connection if already connected/connecting
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }
    if (wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    setConnectionStatus(attemptReconnect ? 'reconnecting' : 'connecting');
    setConnectionError(null);

    const ws = new WebSocket(getWebSocketUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus('connected');
      reconnectAttemptsRef.current = 0;

      // Start ping interval
      pingIntervalRef.current = window.setInterval(() => {
        sendMessage({ type: 'PING' });
      }, PING_INTERVAL_MS);

      // If we have a stored session and this is a reconnection, try to restore it
      const session = loadSession();
      if (attemptReconnect && session) {
        reconnectPendingRef.current = true;
        setIsReconnecting(true);
        sendMessage({
          type: 'RECONNECT',
          payload: {
            sessionToken: session.sessionToken,
            roomCode: session.roomCode,
          },
        });
        setNickname(session.nickname);
        setRoomCode(session.roomCode);
        setPlayerId(session.playerId as MultiplayerPlayerId);
      }
    };

    ws.onmessage = (event) => {
      try {
        const message: ServerMessage = JSON.parse(event.data);
        // Use ref to always call the latest callback (avoids stale closure)
        handleServerMessageRef.current(message);
      } catch {
        console.error('Failed to parse server message');
      }
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');

      // Clear ping interval
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }

      // Attempt reconnection if we have a session
      const session = loadSession();
      if (session && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current++;
        reconnectTimeoutRef.current = window.setTimeout(() => {
          connect(true);
        }, RECONNECT_DELAY_MS);
      } else if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        setConnectionError('Connection lost. Please refresh the page.');
        clearSession();
      }
    };

    ws.onerror = () => {
      setConnectionError('Failed to connect to server');
    };
  }, [sendMessage, loadSession, clearSession]);

  const disconnect = useCallback(() => {
    // Clear reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Clear ping interval
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Reset state
    setConnectionStatus('disconnected');
    reconnectAttemptsRef.current = 0;
  }, []);

  // ============================================================================
  // Actions
  // ============================================================================

  const createRoom = useCallback((
    playerNickname: string,
    score: number,
    timerEnabled: boolean,
    roomOptions: Record<string, boolean | number>
  ) => {
    const pileView = roomOptions.pileView === true;
    const pileStats = roomOptions.pileStats === true;

    // Clear any existing session when creating a new game
    clearSession();

    setNickname(playerNickname);
    setTargetScore(score);
    setTurnTimerEnabled(timerEnabled);
    setPileViewEnabled(pileView);
    setPileStatsEnabled(pileStats);
    connect();

    // Wait for connection then send create room message
    const checkConnection = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        clearInterval(checkConnection);
        sendMessage({
          type: 'CREATE_ROOM',
          payload: {
            nickname: playerNickname,
            targetScore: score,
            turnTimerEnabled: timerEnabled,
            pileViewEnabled: pileView,
            pileStatsEnabled: pileStats,
            ...(typeof roomOptions.maxPlayers === 'number' && roomOptions.maxPlayers > 2
              ? { maxPlayers: roomOptions.maxPlayers }
              : {}),
          },
        });
      }
    }, 100);

    // Timeout after 10 seconds
    setTimeout(() => clearInterval(checkConnection), 10000);
  }, [clearSession, connect, sendMessage]);

  const joinRoom = useCallback((code: string, playerNickname: string) => {
    // Clear any existing session when joining a game
    clearSession();

    setNickname(playerNickname);
    connect();

    // Wait for connection then send join room message
    const checkConnection = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        clearInterval(checkConnection);
        sendMessage({
          type: 'JOIN_ROOM',
          payload: {
            roomCode: code.toUpperCase(),
            nickname: playerNickname,
          },
        });
      }
    }, 100);

    setTimeout(() => clearInterval(checkConnection), 10000);
  }, [clearSession, connect, sendMessage]);

  const playMove = useCallback((move: MultiplayerMove) => {
    sendMessage({
      type: 'PLAY_MOVE',
      payload: { move },
    });
  }, [sendMessage]);

  const playFamilyMove = useCallback((card: Card, capturedCards: Card[]) => {
    sendMessage({ type: 'PLAY_MOVE', payload: { move: { player: 'player1', cardPlayed: card, capturedCards, isScopa: false } } });
  }, [sendMessage]);

  const continueFamilyRound = useCallback(() => {
    sendMessage({ type: 'CONTINUE_ROUND' });
  }, [sendMessage]);

  const requestFamilyRestart = useCallback(() => {
    sendMessage({ type: 'RESTART_GAME' });
  }, [sendMessage]);

  const requestFamilyRematch = useCallback(() => {
    sendMessage({ type: 'START_NEW_GAME' });
  }, [sendMessage]);

  const forceFamilyMove = useCallback(() => {
    sendMessage({ type: 'FORCE_MOVE' });
  }, [sendMessage]);

  const forceMove = useCallback(() => {
    sendMessage({ type: 'FORCE_MOVE' });
  }, [sendMessage]);

  const requestNewGame = useCallback(() => {
    sendMessage({ type: 'START_NEW_GAME' });
  }, [sendMessage]);

  const requestRestart = useCallback(() => {
    sendMessage({ type: 'RESTART_GAME' });
    // Optimistically set ourselves as requester (UI feedback)
    // If already requested, this will cancel (server handles toggle)
    if (playerId) {
      setRestartRequestedBy(prev => prev === playerId ? null : playerId);
    }
  }, [sendMessage, playerId]);

  const continueToNextRound = useCallback(() => {
    sendMessage({ type: 'CONTINUE_ROUND' });
    // Optimistically add ourselves to the set (UI feedback while waiting for opponent)
    if (playerId) {
      setNextRoundRequests(prev => new Set([...prev, playerId]));
    }
  }, [sendMessage, playerId]);

  const updateNickname = useCallback((newNickname: string) => {
    setNickname(newNickname);
    sendMessage({
      type: 'UPDATE_NICKNAME',
      payload: { nickname: newNickname },
    });
  }, [sendMessage]);

  const leaveRoom = useCallback(() => {
    // Try to notify server, but don't block on it
    try {
      sendMessage({ type: 'LEAVE_ROOM' });
    } catch {
      // Ignore errors - we're leaving anyway
    }
    disconnect();
    clearSession();

    // Clear timer interval
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    // Reset all state
    setRoomCode(null);
    setPlayerId(null);
    setOpponentNickname(null);
    setIsOpponentConnected(false);
    setGameState(null);
    setFamilyState(null);
    setFamilyPlayers([]);
    setFamilyLastMove(null);
    setFamilyRoundEndData(null);
    setRoundEndData(null);
    setGameEndData(null);
    setNewGameRequestedBy(null);
    setRestartRequestedBy(null);
    setTurnTimerSeconds(null);
    setCanForceMove(false);
    setLastMove(null);
    setConnectionError(null);
  }, [sendMessage, disconnect, clearSession]);

  const clearRoundEnd = useCallback(() => {
    setRoundEndData(null);
  }, []);

  const clearGameEnd = useCallback(() => {
    setGameEndData(null);
  }, []);

  const clearFamilyRoundEnd = useCallback(() => setFamilyRoundEndData(null), []);

  const clearLastMove = useCallback(() => {
    setLastMove(null);
  }, []);

  const applyPendingState = useCallback(() => {
    // Apply the pending state from lastMove and clear lastMove
    setLastMove(prev => {
      if (prev?.pendingState) {
        setGameState(prev.pendingState);
      }
      return null;
    });
  }, []);

  // ============================================================================
  // Cleanup on unmount
  // ============================================================================

  useEffect(() => {
    return () => {
      disconnect();
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [disconnect]);

  // ============================================================================
  // Auto-reconnect on mount if session exists
  // ============================================================================

  useEffect(() => {
    const session = loadSession();
    if (session) {
      connect(true);
    }
  }, [connect, loadSession]);

  return {
    // Connection state
    connectionStatus,
    connectionError,
    isReconnecting,

    // Room state
    roomCode,
    playerId,
    nickname,
    opponentNickname,
    isOpponentConnected,

    // Game settings
    targetScore,
    turnTimerEnabled,
    pileViewEnabled,
    pileStatsEnabled,

    // Game state
    gameState,
    familyState,
    familyPlayers,
    familyMaxPlayers,
    familyLastMove,
    familyRoundEndData,
    clearFamilyRoundEnd,
    requestFamilyRestart,
    requestFamilyRematch,
    forceFamilyMove,

    // Timer state
    turnTimerSeconds,
    canForceMove,

    // Round/Game end
    roundEndData,
    gameEndData,

    // Rematch
    newGameRequestedBy,

    // Mid-game restart
    restartRequestedBy,

    // Next round
    nextRoundRequests,

    // Last move (for animations/sounds)
    lastMove,
    clearLastMove,
    applyPendingState,

    // Actions
    createRoom,
    joinRoom,
    playMove,
    forceMove,
    requestNewGame,
    requestRestart,
    continueToNextRound,
    updateNickname,
    leaveRoom,
    clearRoundEnd,
    clearGameEnd,
    playFamilyMove,
    continueFamilyRound,
  };
}
