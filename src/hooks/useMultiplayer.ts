// useMultiplayer Hook - WebSocket connection management for multiplayer

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Card } from '../game/types';
import type {
  ClientMessage,
  ServerMessage,
  MultiplayerPlayerId,
  MultiplayerMove,
  PlayerVisibleGameState,
  MultiplayerSession,
  ConnectionStatus,
  RoundScore,
} from '../multiplayer/types';

// Configuration
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080';
const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_ATTEMPTS = 5;
const PING_INTERVAL_MS = 30000;
const SESSION_STORAGE_KEY = 'scopa-mp-session';

export interface UseMultiplayerReturn {
  // Connection state
  connectionStatus: ConnectionStatus;
  connectionError: string | null;

  // Room state
  roomCode: string | null;
  playerId: MultiplayerPlayerId | null;
  nickname: string;
  opponentNickname: string | null;
  isOpponentConnected: boolean;

  // Game settings
  targetScore: number;
  turnTimerEnabled: boolean;

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
  } | null;
  gameEndData: {
    winner: MultiplayerPlayerId | 'tie';
    finalScores: Record<MultiplayerPlayerId, number>;
    roundScores: Record<MultiplayerPlayerId, RoundScore>;
    capturedCards: Record<MultiplayerPlayerId, Card[]>;
  } | null;

  // Rematch
  newGameRequestedBy: MultiplayerPlayerId | null;

  // Last move (for animations/sounds)
  lastMove: {
    move: MultiplayerMove;
    byPlayer: MultiplayerPlayerId;
    pendingState: PlayerVisibleGameState; // State to apply after animation
  } | null;
  clearLastMove: () => void;
  applyPendingState: () => void;

  // Actions
  createRoom: (nickname: string, targetScore: number, turnTimerEnabled: boolean) => void;
  joinRoom: (code: string, nickname: string) => void;
  playMove: (move: MultiplayerMove) => void;
  forceMove: () => void;
  requestNewGame: () => void;
  updateNickname: (nickname: string) => void;
  leaveRoom: () => void;
  clearRoundEnd: () => void;
  clearGameEnd: () => void;
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

  // Room state
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<MultiplayerPlayerId | null>(null);
  const [nickname, setNickname] = useState('');
  const [opponentNickname, setOpponentNickname] = useState<string | null>(null);
  const [isOpponentConnected, setIsOpponentConnected] = useState(false);

  // Game settings
  const [targetScore, setTargetScore] = useState(11);
  const [turnTimerEnabled, setTurnTimerEnabled] = useState(false);

  // Game state
  const [gameState, setGameState] = useState<PlayerVisibleGameState | null>(null);

  // Timer state
  const [turnTimerSeconds, setTurnTimerSeconds] = useState<number | null>(null);
  const [canForceMove, setCanForceMove] = useState(false);

  // Round/Game end
  const [roundEndData, setRoundEndData] = useState<UseMultiplayerReturn['roundEndData']>(null);
  const [gameEndData, setGameEndData] = useState<UseMultiplayerReturn['gameEndData']>(null);

  // Rematch
  const [newGameRequestedBy, setNewGameRequestedBy] = useState<MultiplayerPlayerId | null>(null);

  // Last move (for animations/sounds)
  const [lastMove, setLastMove] = useState<UseMultiplayerReturn['lastMove']>(null);

  // Session ref for reconnection
  const sessionRef = useRef<MultiplayerSession | null>(null);

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
        setPlayerId(message.payload.playerId);
        setOpponentNickname(message.payload.opponentNickname);
        setIsOpponentConnected(message.payload.opponentConnected);
        setTargetScore(message.payload.targetScore);
        setTurnTimerEnabled(message.payload.turnTimerEnabled);
        if (message.payload.state) {
          setGameState(message.payload.state);
        }
        break;

      case 'TIMER_UPDATE':
        setTurnTimerSeconds(message.payload.secondsRemaining);
        break;

      case 'TIMER_EXPIRED':
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
        break;

      case 'NICKNAME_UPDATED':
        if (playerId && message.payload.playerId !== playerId) {
          setOpponentNickname(message.payload.nickname);
        }
        break;

      case 'ERROR':
        setConnectionError(message.payload.message);
        // Clear error after 5 seconds
        setTimeout(() => setConnectionError(null), 5000);
        break;

      case 'PONG':
        // Keep-alive response, nothing to do
        break;
    }
  }, [nickname, playerId, saveSession]);

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

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus('connected');
      reconnectAttemptsRef.current = 0;

      // Start ping interval
      pingIntervalRef.current = setInterval(() => {
        sendMessage({ type: 'PING' });
      }, PING_INTERVAL_MS);

      // If we have a stored session and this is a reconnection, try to restore it
      const session = loadSession();
      if (attemptReconnect && session) {
        sendMessage({
          type: 'RECONNECT',
          payload: {
            sessionToken: session.sessionToken,
            roomCode: session.roomCode,
          },
        });
        setNickname(session.nickname);
        setRoomCode(session.roomCode);
        setPlayerId(session.playerId);
      }
    };

    ws.onmessage = (event) => {
      try {
        const message: ServerMessage = JSON.parse(event.data);
        handleServerMessage(message);
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
        reconnectTimeoutRef.current = setTimeout(() => {
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
  }, [handleServerMessage, sendMessage, loadSession, clearSession]);

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
    timerEnabled: boolean
  ) => {
    setNickname(playerNickname);
    setTargetScore(score);
    setTurnTimerEnabled(timerEnabled);
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
          },
        });
      }
    }, 100);

    // Timeout after 10 seconds
    setTimeout(() => clearInterval(checkConnection), 10000);
  }, [connect, sendMessage]);

  const joinRoom = useCallback((code: string, playerNickname: string) => {
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
  }, [connect, sendMessage]);

  const playMove = useCallback((move: MultiplayerMove) => {
    sendMessage({
      type: 'PLAY_MOVE',
      payload: { move },
    });
  }, [sendMessage]);

  const forceMove = useCallback(() => {
    sendMessage({ type: 'FORCE_MOVE' });
  }, [sendMessage]);

  const requestNewGame = useCallback(() => {
    sendMessage({ type: 'START_NEW_GAME' });
  }, [sendMessage]);

  const updateNickname = useCallback((newNickname: string) => {
    setNickname(newNickname);
    sendMessage({
      type: 'UPDATE_NICKNAME',
      payload: { nickname: newNickname },
    });
  }, [sendMessage]);

  const leaveRoom = useCallback(() => {
    sendMessage({ type: 'LEAVE_ROOM' });
    disconnect();
    clearSession();

    // Reset all state
    setRoomCode(null);
    setPlayerId(null);
    setOpponentNickname(null);
    setIsOpponentConnected(false);
    setGameState(null);
    setRoundEndData(null);
    setGameEndData(null);
    setNewGameRequestedBy(null);
    setTurnTimerSeconds(null);
    setCanForceMove(false);
  }, [sendMessage, disconnect, clearSession]);

  const clearRoundEnd = useCallback(() => {
    setRoundEndData(null);
  }, []);

  const clearGameEnd = useCallback(() => {
    setGameEndData(null);
  }, []);

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

    // Room state
    roomCode,
    playerId,
    nickname,
    opponentNickname,
    isOpponentConnected,

    // Game settings
    targetScore,
    turnTimerEnabled,

    // Game state
    gameState,

    // Timer state
    turnTimerSeconds,
    canForceMove,

    // Round/Game end
    roundEndData,
    gameEndData,

    // Rematch
    newGameRequestedBy,

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
    updateNickname,
    leaveRoom,
    clearRoundEnd,
    clearGameEnd,
  };
}
