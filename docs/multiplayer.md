# Multiplayer Implementation

This document describes the multiplayer functionality added to the Scopa game.

## Overview

The multiplayer mode allows two players to play Scopa against each other over the internet using WebSocket connections. The implementation consists of:

1. **Client-side** (React frontend in `src/`)
2. **Server-side** (Node.js WebSocket server in `scopa-server/`)

## Architecture

### Client Components

#### `src/hooks/useMultiplayer.ts`
The main hook that manages WebSocket connection and multiplayer state:
- Connection management (connect, disconnect, reconnect)
- Session persistence via localStorage
- Message handling for all server events
- Room creation and joining
- Move submission
- Turn timer handling
- Automatic reconnection on page refresh

#### `src/multiplayer/types.ts`
TypeScript type definitions for:
- `MultiplayerPlayerId` - Player identifiers ('player1' | 'player2')
- `PlayerVisibleGameState` - Game state visible to a player (opponent's hand is hidden)
- `ClientMessage` / `ServerMessage` - WebSocket message types
- `MultiplayerSession` - Session data for reconnection
- `ConnectionStatus` - Connection state tracking

#### UI Components

- **`MultiplayerLobby.tsx`** - Create/join game interface
  - Nickname input with localStorage persistence
  - Room creation with target score and turn timer options
  - Room joining with game code entry
  - Connection status and error display

- **`WaitingForOpponent.tsx`** - Waiting room after creating a game
  - Displays shareable room code
  - Copy-to-clipboard functionality
  - Shareable link generation

- **`OpponentDisconnected.tsx`** - Overlay shown when opponent disconnects
  - Reconnection waiting state
  - Option to leave game

- **`TurnTimer.tsx`** - Visual turn timer countdown
  - Circular progress indicator
  - Force move button when opponent's time expires

### Server Components (`scopa-server/`)

#### `src/index.ts`
Main server entry point:
- WebSocket server setup
- Periodic room cleanup
- Stats logging

#### `src/handlers/connection.ts`
Connection lifecycle management:
- `handleConnection` - New WebSocket connections
- `handleCreateRoom` - Room creation
- `handleJoinRoom` - Room joining
- `handleReconnect` - Session restoration
- `handleDisconnect` - Player disconnection

#### `src/handlers/game.ts`
Game logic handling:
- `handlePlayMove` - Move validation and execution
- `handleForceMove` - Random move when timer expires
- `handleStartNewGame` - Rematch handling
- `handleLeaveRoom` - Player leaving

#### `src/room.ts`
Room state management:
- Room creation and deletion
- Player session management
- Game state initialization
- Turn timer management
- Score calculation

#### `src/game/`
Game logic (mirrors client-side):
- `deck.ts` - Deck creation and shuffling
- `rules.ts` - Move validation and execution
- `scoring.ts` - Round score calculation

## Message Protocol

### Client → Server

| Message Type | Description |
|-------------|-------------|
| `CREATE_ROOM` | Create a new game room |
| `JOIN_ROOM` | Join an existing room by code |
| `RECONNECT` | Restore session after disconnect |
| `PLAY_MOVE` | Submit a move |
| `FORCE_MOVE` | Force random move (timer expired) |
| `START_NEW_GAME` | Request rematch |
| `UPDATE_NICKNAME` | Change display name |
| `LEAVE_ROOM` | Leave the game |
| `PING` | Keep-alive |

### Server → Client

| Message Type | Description |
|-------------|-------------|
| `ROOM_CREATED` | Room created, includes code and session token |
| `ROOM_JOINED` | Successfully joined room |
| `OPPONENT_JOINED` | Opponent has joined |
| `GAME_START` | Game is starting, includes initial state |
| `GAME_STATE` | Updated game state |
| `MOVE_PLAYED` | A move was made, includes new state |
| `ROUND_END` | Round complete, includes scores |
| `GAME_END` | Game complete, includes winner |
| `OPPONENT_DISCONNECTED` | Opponent lost connection |
| `OPPONENT_RECONNECTED` | Opponent reconnected |
| `RECONNECT_SUCCESS` | Session restored successfully |
| `TIMER_UPDATE` | Turn timer countdown |
| `TIMER_EXPIRED` | Turn timer ran out |
| `NEW_GAME_REQUESTED` | Opponent wants rematch |
| `NEW_GAME_STARTED` | Rematch beginning |
| `NICKNAME_UPDATED` | Player changed name |
| `ERROR` | Error occurred |
| `PONG` | Keep-alive response |

## Animation System

Multiplayer animations match single-player behavior:

### Own Moves
- **Place moves**: Instant, no animation
- **Capture moves**: Brief 400ms delay, then capture animation

### Opponent Moves
- **Reveal phase**: 600ms card flip animation
- **Moving phase**: 500ms card moves to table
- **Capture phase**: 900ms captured cards fly to pile
- **Place moves**: State updates when animation card disappears

### Key Implementation Details

1. **Move tracking**: Uses `lastProcessedMoveRef` to prevent re-processing the same move
2. **No cleanup functions**: Timeouts run to completion to avoid race conditions
3. **State synchronization**: `applyPendingState()` updates game state at precise animation moments

## Session Management

### Persistence
- Session token stored in localStorage
- Auto-reconnect on page refresh
- Session includes: token, room code, player ID, nickname

### Reconnection Flow
1. Page loads, checks for stored session
2. Connects to WebSocket server
3. Sends `RECONNECT` with session token
4. Server validates and restores session
5. Server sends `RECONNECT_SUCCESS` with full state
6. Client restores UI state

## Configuration

### Client (`src/hooks/useMultiplayer.ts`)
```typescript
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080';
const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_ATTEMPTS = 5;
const PING_INTERVAL_MS = 30000;
```

### Server (`scopa-server/src/`)
```typescript
const PORT = parseInt(process.env.PORT || '8080', 10);
const ROOM_EXPIRY_MS = 5 * 60 * 60 * 1000; // 5 hours
const DEFAULT_TURN_TIMER_SECONDS = 60;
```

## Running the Server

```bash
cd scopa-server
npm install
npm run build
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_WS_URL` | Scopa WebSocket server URL (client) | `ws://localhost:8080` |
| `VITE_BRISCOLA_WS_URL` | Briscola WebSocket server URL (client; separate build) | `ws://localhost:8081` |
| `PORT` | Server port | `8080` |

## Known Limitations

1. No spectator mode for multiplayer games
2. No chat functionality
3. Room codes are randomly generated (no custom codes)
4. No player authentication (session-based only)
5. Rooms expire after 5 hours of inactivity
