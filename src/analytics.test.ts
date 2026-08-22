// Tests run in the default node environment: `window` is stubbed onto
// globalThis, matching how src/analytics.ts reads it at call time.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { trackGameStarted, trackGameCompleted } from './analytics';

type StubWindow = { swetrix?: { track: ReturnType<typeof vi.fn> }; __swetrixReady?: boolean };
const g = globalThis as unknown as { window?: StubWindow };

afterEach(() => {
  delete g.window;
});

describe('analytics', () => {
  it('sends GAME_STARTED with mode/opponent meta and no unique flag', () => {
    const track = vi.fn();
    g.window = { swetrix: { track }, __swetrixReady: true };

    trackGameStarted({ mode: 'solo', opponent: 'cpu' });

    expect(track).toHaveBeenCalledTimes(1);
    const payload = track.mock.calls[0][0];
    expect(payload).toEqual({ ev: 'GAME_STARTED', meta: { mode: 'solo', opponent: 'cpu' } });
    expect('unique' in payload).toBe(false);
  });

  it('sends GAME_COMPLETED with the given meta', () => {
    const track = vi.fn();
    g.window = { swetrix: { track }, __swetrixReady: true };

    trackGameCompleted({ mode: 'multiplayer', opponent: 'human' });

    expect(track).toHaveBeenCalledWith({
      ev: 'GAME_COMPLETED',
      meta: { mode: 'multiplayer', opponent: 'human' },
    });
  });

  it('no-ops when swetrix was never initialized (dev host, DNT, blocked)', () => {
    const track = vi.fn();
    g.window = { swetrix: { track }, __swetrixReady: false };

    trackGameStarted({ mode: 'solo', opponent: 'ai' });

    expect(track).not.toHaveBeenCalled();
  });

  it('no-ops without throwing when the CDN script is absent (offline)', () => {
    g.window = { __swetrixReady: true };

    expect(() => trackGameStarted({ mode: 'solo', opponent: 'cpu' })).not.toThrow();
  });

  it('swallows tracker exceptions so analytics can never break gameplay', () => {
    g.window = {
      swetrix: { track: vi.fn(() => { throw new Error('network'); }) },
      __swetrixReady: true,
    };

    expect(() => trackGameCompleted({ mode: 'solo', opponent: 'cpu' })).not.toThrow();
  });
});
