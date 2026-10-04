// Node.js HTTP server: Gemini API proxy with rate limiting for free AI games

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { GameQuota } from './limits.js';

// Configuration
const PORT = parseInt(process.env.PORT || '3101', 10);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGIN || '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const GAMES_PER_DAY = 3;
// Shared cap on everyone's games per UTC day: the Gemini bill has a ceiling
// no matter how many players show up (each game is a few tens of cents).
// (a malformed value falls back to 60: NaN would never trip the cap)
const GLOBAL_GAMES_PER_DAY = parseInt(process.env.GLOBAL_GAMES_PER_DAY || '60', 10) || 60;
const MODEL = 'gemini-3-flash-preview';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute

// In-memory quotas (per player and shared), see limits.ts
const quota = new GameQuota(GAMES_PER_DAY, GLOBAL_GAMES_PER_DAY);

// Periodic cleanup of expired entries
setInterval(() => {
  const cleaned = quota.cleanup();
  if (cleaned > 0) {
    console.log(`[cleanup] Removed ${cleaned} expired rate limit entries. Active: ${quota.activePlayers}`);
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
  const allowAnyOrigin = ALLOWED_ORIGINS.includes('*');
  const allowedOrigin = allowAnyOrigin
    ? '*'
    : origin && ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0] || 'null';

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
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

    // Quotas: the player's daily allowance, then the shared daily cap. The
    // client tells them apart by `scope` and shows the matching message.
    const decision = quota.admit(getFingerprint(req), gameId, getDateKey());
    if (!decision.ok) {
      if (decision.scope === 'global') {
        console.warn(`[quota] shared daily cap reached (${decision.globalUsed}/${decision.globalLimit} games)`);
      }
      sendJson(res, 429, {
        error: 'rate_limit',
        scope: decision.scope,
        gamesUsed: decision.gamesUsed,
        gamesLimit: decision.gamesLimit,
        globalGamesUsed: decision.globalUsed,
        globalGamesLimit: decision.globalLimit,
      }, cors);
      return;
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
      gamesUsed: decision.gamesUsed,
      gamesLimit: decision.gamesLimit,
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
  console.log(`Rate limit: ${GAMES_PER_DAY} games/day per user, ${GLOBAL_GAMES_PER_DAY} games/day shared`);
  console.log(`CORS origins: ${ALLOWED_ORIGINS.join(', ')}`);
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
