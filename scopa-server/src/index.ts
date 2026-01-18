// Scopa Multiplayer WebSocket Server

import { WebSocketServer } from 'ws';
import { handleConnection } from './handlers/connection.js';
import { cleanupExpiredRooms, getRoomStats } from './room.js';
import type { AuthenticatedWebSocket } from './types.js';

// Configuration
const PORT = parseInt(process.env.PORT || '8080', 10);
const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute
const STATS_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Create WebSocket server
const wss = new WebSocketServer({ port: PORT });

console.log(`Scopa Multiplayer Server starting on port ${PORT}...`);

// Handle new connections
wss.on('connection', (ws: AuthenticatedWebSocket) => {
  handleConnection(ws);
});

// Handle server errors
wss.on('error', (error) => {
  console.error('WebSocket server error:', error);
});

// Periodic cleanup of expired rooms
setInterval(() => {
  const cleaned = cleanupExpiredRooms();
  if (cleaned > 0) {
    console.log(`Cleaned up ${cleaned} expired room(s)`);
  }
}, CLEANUP_INTERVAL_MS);

// Periodic stats logging
setInterval(() => {
  const stats = getRoomStats();
  console.log(
    `Server stats: ${stats.totalRooms} rooms (${stats.waitingRooms} waiting, ${stats.activeGames} active)`
  );
}, STATS_INTERVAL_MS);

// Graceful shutdown
let isShuttingDown = false;

function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n${signal} received, shutting down server...`);
  wss.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

console.log(`Scopa Multiplayer Server running on ws://localhost:${PORT}`);
