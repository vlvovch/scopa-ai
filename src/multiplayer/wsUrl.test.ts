import { describe, it, expect } from 'vitest';
import { resolveWsUrl } from './wsUrl';

describe('resolveWsUrl', () => {
  it('uses the dev fallback when nothing is configured', () => {
    expect(resolveWsUrl(undefined, 'ws://localhost:8080')).toBe('ws://localhost:8080');
    expect(resolveWsUrl('  ', 'ws://localhost:8081')).toBe('ws://localhost:8081');
  });

  it('passes absolute URLs through untouched', () => {
    expect(resolveWsUrl('wss://playbriscola.com/ws', 'ws://localhost:8081')).toBe(
      'wss://playbriscola.com/ws'
    );
  });

  it('resolves a path against the page origin with the matching scheme', () => {
    const https = { protocol: 'https:', host: 'playscopa.net' };
    expect(resolveWsUrl('/ws-briscola', 'ws://localhost:8081', https)).toBe(
      'wss://playscopa.net/ws-briscola'
    );
    const http = { protocol: 'http:', host: 'localhost:5173' };
    expect(resolveWsUrl('/ws', 'ws://localhost:8080', http)).toBe('ws://localhost:5173/ws');
  });

  it('falls back when a path is configured but there is no page location', () => {
    expect(resolveWsUrl('/ws', 'ws://localhost:8080', undefined)).toBe('ws://localhost:8080');
  });
});
