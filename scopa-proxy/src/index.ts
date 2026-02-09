// Node.js HTTP server: Gemini API proxy with rate limiting for free AI games

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

// Configuration
const PORT = parseInt(process.env.PORT || '3101', 10);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

const GAMES_PER_DAY = 3;
const MODEL = 'gemini-3-flash-preview';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute

// In-memory rate limit storage (replaces Cloudflare KV)
interface RateLimitEntry {
  gameIds: string[];
  expires: number; // timestamp in ms
}
const rateLimits = new Map<string, RateLimitEntry>();

// Periodic cleanup of expired entries
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, entry] of rateLimits) {
    if (entry.expires <= now) {
      rateLimits.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`[cleanup] Removed ${cleaned} expired rate limit entries. Active: ${rateLimits.size}`);
  }
}, CLEANUP_INTERVAL_MS);

interface ContentPart {
  text: string;
}

interface Content {
  role: 'user' | 'model';
  parts: ContentPart[];
}

interface MoveRequest {
  systemInstruction: string;
  contents: Content[];
  responseJsonSchema: Record<string, unknown>;
  gameId: string;
  useThinking?: boolean;
}

function corsHeaders(origin: string | undefined): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin && (ALLOWED_ORIGIN === '*' || origin === ALLOWED_ORIGIN) ? origin : ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function getFingerprint(req: IncomingMessage): string {
  // Use X-Forwarded-For (set by Caddy) for real client IP
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : null)
    || req.socket.remoteAddress
    || 'unknown';
  const ua = req.headers['user-agent'] || 'unknown';
  const raw = `${ip}:${ua}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function getDateKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown, extraHeaders: Record<string, string> = {}): void {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json', ...extraHeaders });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  const cors = corsHeaders(origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    res.end();
    return;
  }

  // Parse URL path
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  // Only accept POST to /api/move
  if (req.method !== 'POST' || url.pathname !== '/api/move') {
    sendJson(res, 404, { error: 'not_found' }, cors);
    return;
  }

  try {
    const rawBody = await readBody(req);
    const body: MoveRequest = JSON.parse(rawBody);
    const { systemInstruction, contents, responseJsonSchema, gameId, useThinking } = body;

    if (!systemInstruction || !contents || !responseJsonSchema || !gameId) {
      sendJson(res, 400, { error: 'bad_request', message: 'Missing required fields' }, cors);
      return;
    }

    // Rate limiting (in-memory)
    const fingerprint = getFingerprint(req);
    const dateKey = getDateKey();
    const rlKey = `${fingerprint}:${dateKey}`;

    const existing = rateLimits.get(rlKey);
    const gameIds: string[] = existing ? existing.gameIds : [];
    const isNewGame = !gameIds.includes(gameId);

    if (isNewGame && gameIds.length >= GAMES_PER_DAY) {
      sendJson(res, 429, {
        error: 'rate_limit',
        gamesUsed: gameIds.length,
        gamesLimit: GAMES_PER_DAY,
      }, cors);
      return;
    }

    // Register new game
    if (isNewGame) {
      gameIds.push(gameId);
      // Expire at end of current UTC day + 1 hour buffer
      const tomorrow = new Date(dateKey + 'T00:00:00Z');
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      tomorrow.setUTCHours(1, 0, 0, 0);
      rateLimits.set(rlKey, { gameIds, expires: tomorrow.getTime() });
    }

    // Call Gemini API
    const thinkingBudget = useThinking ? -1 : 0;

    const geminiResponse = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents,
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: responseJsonSchema,
          thinkingConfig: { thinkingBudget },
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini API error:', geminiResponse.status, errorText);
      sendJson(res, 502, {
        error: 'api_error',
        message: `Gemini API returned ${geminiResponse.status}`,
      }, cors);
      return;
    }

    const geminiResult = await geminiResponse.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: Record<string, unknown>;
    };

    const text = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const usageMetadata = geminiResult.usageMetadata || {};

    sendJson(res, 200, {
      text,
      usageMetadata,
      gamesUsed: gameIds.length,
      gamesLimit: GAMES_PER_DAY,
    }, cors);

  } catch (error) {
    console.error('Server error:', error);
    sendJson(res, 500, {
      error: 'internal_error',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, cors);
  }
});

if (!GEMINI_API_KEY) {
  console.warn('WARNING: GEMINI_API_KEY not set. API calls will fail.');
}

server.listen(PORT, () => {
  console.log(`Scopa AI Proxy running on port ${PORT}`);
  console.log(`Rate limit: ${GAMES_PER_DAY} games/day per user`);
  console.log(`CORS origin: ${ALLOWED_ORIGIN}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
  console.log('Shutting down...');
  server.close(() => process.exit(0));
});
