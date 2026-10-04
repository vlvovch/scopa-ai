// The free-AI proxy's daily quotas: the per-player allowance, the shared
// cap, games already counted, the day roll-over and the cleanup.
import { describe, it, expect } from 'vitest';
import { GameQuota, expiryFor } from './limits.js';

const DAY = '2026-09-19';

describe('GameQuota', () => {
  it('admits a player up to the allowance and then refuses a new game for that player', () => {
    const q = new GameQuota(3, 60);
    expect(q.admit('a', 'g1', DAY)).toMatchObject({ ok: true, gamesUsed: 1, gamesLimit: 3, globalUsed: 1, globalLimit: 60 });
    expect(q.admit('a', 'g2', DAY).ok).toBe(true);
    expect(q.admit('a', 'g3', DAY)).toMatchObject({ ok: true, gamesUsed: 3 });
    expect(q.admit('a', 'g4', DAY)).toMatchObject({ ok: false, scope: 'user', gamesUsed: 3, gamesLimit: 3 });
    // another player is unaffected
    expect(q.admit('b', 'g5', DAY)).toMatchObject({ ok: true, gamesUsed: 1, globalUsed: 4 });
  });

  it('keeps serving a game already counted, for the player and for the day', () => {
    const q = new GameQuota(1, 1);
    expect(q.admit('a', 'g1', DAY).ok).toBe(true);
    expect(q.admit('a', 'g1', DAY)).toMatchObject({ ok: true, gamesUsed: 1, globalUsed: 1 });
  });

  it('refuses a new game for everyone once the shared cap is reached, even with player allowance left', () => {
    const q = new GameQuota(3, 2);
    expect(q.admit('a', 'g1', DAY).ok).toBe(true);
    expect(q.admit('b', 'g2', DAY).ok).toBe(true);
    const refused = q.admit('c', 'g3', DAY);
    expect(refused).toMatchObject({ ok: false, scope: 'global', gamesUsed: 0, gamesLimit: 3, globalUsed: 2, globalLimit: 2 });
    // the refused game was not counted against the player
    expect(q.admit('c', 'g3', DAY).scope).toBe('global');
    // games in progress keep going
    expect(q.admit('a', 'g1', DAY).ok).toBe(true);
  });

  it('reports the player allowance before the shared cap when both are exhausted', () => {
    const q = new GameQuota(1, 1);
    q.admit('a', 'g1', DAY);
    expect(q.admit('a', 'g2', DAY).scope).toBe('user');
  });

  it('starts a new day with empty counts', () => {
    const q = new GameQuota(1, 1);
    q.admit('a', 'g1', DAY);
    expect(q.admit('a', 'g2', DAY).ok).toBe(false);
    expect(q.admit('a', 'g2', '2026-09-20')).toMatchObject({ ok: true, gamesUsed: 1, globalUsed: 1 });
  });

  it('cleans up player entries after their day has expired', () => {
    const q = new GameQuota(3, 60);
    q.admit('a', 'g1', DAY);
    q.admit('b', 'g2', DAY);
    expect(q.activePlayers).toBe(2);
    expect(q.cleanup(expiryFor(DAY) - 1)).toBe(0);
    expect(q.cleanup(expiryFor(DAY))).toBe(2);
    expect(q.activePlayers).toBe(0);
  });

  it('expires entries an hour after the next UTC midnight', () => {
    expect(new Date(expiryFor(DAY)).toISOString()).toBe('2026-09-20T01:00:00.000Z');
  });
});
