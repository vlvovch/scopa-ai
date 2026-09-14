// Tests run in the default node environment: `window` is stubbed onto
// globalThis, matching how src/analytics.ts reads it at call time.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { trackGameStarted, trackGameCompleted, trackGameSwitched, trackGameChosen } from './analytics';

type StubWindow = { swetrix?: { track: ReturnType<typeof vi.fn> }; __swetrixReady?: boolean };
const g = globalThis as unknown as { window?: StubWindow };

afterEach(() => {
  delete g.window;
});

describe('analytics', () => {
  it('sends GAME_STARTED with game/mode/opponent meta and no unique flag', () => {
    const track = vi.fn();
    g.window = { swetrix: { track }, __swetrixReady: true };

    trackGameStarted({ game: 'scopa', mode: 'solo', opponent: 'cpu' });

    expect(track).toHaveBeenCalledTimes(1);
    const payload = track.mock.calls[0][0];
    expect(payload).toEqual({
      ev: 'GAME_STARTED',
      meta: { game: 'scopa', mode: 'solo', opponent: 'cpu' },
    });
    expect('unique' in payload).toBe(false);
  });

  it('sends GAME_COMPLETED with the given meta', () => {
    const track = vi.fn();
    g.window = { swetrix: { track }, __swetrixReady: true };

    trackGameCompleted({ game: 'briscola', mode: 'multiplayer', opponent: 'human' });

    expect(track).toHaveBeenCalledWith({
      ev: 'GAME_COMPLETED',
      meta: { game: 'briscola', mode: 'multiplayer', opponent: 'human' },
    });
  });

  it('sends GAME_SWITCHED with only the two game names', () => {
    const track = vi.fn();
    g.window = { swetrix: { track }, __swetrixReady: true };

    trackGameSwitched({ from: 'scopa', to: 'briscola' });

    expect(track).toHaveBeenCalledWith({
      ev: 'GAME_SWITCHED',
      meta: { from: 'scopa', to: 'briscola' },
    });
  });

  it('sends GAME_CHOSEN with the picked game', () => {
    const track = vi.fn();
    g.window = { swetrix: { track }, __swetrixReady: true };

    trackGameChosen({ game: 'briscola' });

    expect(track).toHaveBeenCalledWith({ ev: 'GAME_CHOSEN', meta: { game: 'briscola' } });
  });

  it('no-ops when swetrix was never initialized (dev host, DNT, blocked)', () => {
    const track = vi.fn();
    g.window = { swetrix: { track }, __swetrixReady: false };

    trackGameStarted({ game: 'scopa', mode: 'solo', opponent: 'ai' });
    trackGameSwitched({ from: 'scopa', to: 'briscola' });

    expect(track).not.toHaveBeenCalled();
  });

  it('no-ops without throwing when the CDN script is absent (offline)', () => {
    g.window = { __swetrixReady: true };

    expect(() => trackGameStarted({ game: 'scopa', mode: 'solo', opponent: 'cpu' })).not.toThrow();
    expect(() => trackGameSwitched({ from: 'briscola', to: 'scopa' })).not.toThrow();
  });

  it('swallows tracker exceptions so analytics can never break gameplay', () => {
    g.window = {
      swetrix: { track: vi.fn(() => { throw new Error('network'); }) },
      __swetrixReady: true,
    };

    expect(() => trackGameCompleted({ game: 'scopa', mode: 'solo', opponent: 'cpu' })).not.toThrow();
    expect(() => trackGameSwitched({ from: 'scopa', to: 'briscola' })).not.toThrow();
  });
});
