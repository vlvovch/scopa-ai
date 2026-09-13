import { describe, it, expect, afterEach } from 'vitest';
import {
  gameFromRoomCode,
  isFirstVisit,
  isGameId,
  shouldAnnounceOtherGame,
  otherGame,
  parseJoinCode,
  resolveGameRoute,
} from './gameSelection';

const base = { pathname: '/', search: '', stored: null, defaultGame: 'scopa' as const };

describe('gameSelection', () => {
  it('validates game ids', () => {
    expect(isGameId('scopa')).toBe(true);
    expect(isGameId('briscola')).toBe(true);
    expect(isGameId('poker')).toBe(false);
    expect(isGameId(null)).toBe(false);
    expect(otherGame('scopa')).toBe('briscola');
    expect(otherGame('briscola')).toBe('scopa');
  });

  it('maps server room-code prefixes to games', () => {
    expect(gameFromRoomCode('SCOPA-AB12')).toBe('scopa');
    expect(gameFromRoomCode('briscola-ab12')).toBe('briscola');
    expect(gameFromRoomCode('AB12')).toBeNull();
  });

  it('reads join codes from the path or the query, uppercased', () => {
    expect(parseJoinCode('/join/scopa-ab12', '')).toBe('SCOPA-AB12');
    expect(parseJoinCode('/', '?join=briscola-zz99')).toBe('BRISCOLA-ZZ99');
    expect(parseJoinCode('/', '')).toBeNull();
    expect(parseJoinCode('/join/', '')).toBeNull();
  });

  describe('resolveGameRoute', () => {
    it('falls back to the deployment default on a first visit', () => {
      expect(resolveGameRoute(base)).toEqual({ game: 'scopa', source: 'default' });
      expect(resolveGameRoute({ ...base, defaultGame: 'briscola' })).toEqual({
        game: 'briscola',
        source: 'default',
      });
    });

    it('remembers a manual selection for ordinary launches', () => {
      expect(resolveGameRoute({ ...base, stored: 'briscola' })).toEqual({
        game: 'briscola',
        source: 'preference',
      });
      expect(
        resolveGameRoute({ ...base, defaultGame: 'briscola', stored: 'scopa' })
      ).toEqual({ game: 'scopa', source: 'preference' });
    });

    it('lets an explicit game URL override the preference', () => {
      expect(resolveGameRoute({ ...base, pathname: '/briscola', stored: 'scopa' })).toEqual({
        game: 'briscola',
        source: 'url',
      });
      expect(resolveGameRoute({ ...base, pathname: '/Scopa/', stored: 'briscola' })).toEqual({
        game: 'scopa',
        source: 'url',
      });
      expect(resolveGameRoute({ ...base, search: '?game=briscola' })).toEqual({
        game: 'briscola',
        source: 'url',
      });
      // Unknown ?game values are ignored.
      expect(resolveGameRoute({ ...base, search: '?game=poker', stored: 'briscola' })).toEqual({
        game: 'briscola',
        source: 'preference',
      });
    });

    it('routes invitations to the game the code belongs to, on either site', () => {
      expect(
        resolveGameRoute({ ...base, pathname: '/join/BRISCOLA-AB12', stored: 'scopa' })
      ).toEqual({ game: 'briscola', source: 'invite' });
      expect(
        resolveGameRoute({
          ...base,
          defaultGame: 'briscola',
          pathname: '/join/SCOPA-AB12',
          stored: 'briscola',
        })
      ).toEqual({ game: 'scopa', source: 'invite' });
      expect(resolveGameRoute({ ...base, search: '?join=scopa-ab12', stored: 'briscola' })).toEqual({
        game: 'scopa',
        source: 'invite',
      });
    });

    it('keeps legacy invitation links on their original (deployment) game', () => {
      // A code without a known prefix behaves exactly as before the switch:
      // it opens the game this site was built for.
      expect(resolveGameRoute({ ...base, pathname: '/join/AB12', stored: 'briscola' })).toEqual({
        game: 'scopa',
        source: 'invite',
      });
      expect(
        resolveGameRoute({ ...base, defaultGame: 'briscola', pathname: '/join/AB12' })
      ).toEqual({ game: 'briscola', source: 'invite' });
    });

    it('prefers the invitation over an explicit game path', () => {
      // A join link is the stronger signal — the code names its game.
      expect(
        resolveGameRoute({ ...base, pathname: '/scopa', search: '?join=BRISCOLA-AB12' })
      ).toEqual({ game: 'briscola', source: 'invite' });
    });
  });
});

describe('isFirstVisit', () => {
  const g = globalThis as unknown as { localStorage?: unknown };
  function fakeStorage(entries: Record<string, string>, throwing = false) {
    const map = new Map(Object.entries(entries));
    g.localStorage = {
      getItem: (k: string) => {
        if (throwing) throw new Error('blocked');
        return map.has(k) ? map.get(k)! : null;
      },
    };
  }
  afterEach(() => {
    delete g.localStorage;
  });

  it('is true for a brand-new visitor', () => {
    fakeStorage({ 'scopa-settings': '{}', 'scopa-language': 'en' }); // written on every load
    expect(isFirstVisit()).toBe(true);
  });

  it('is false once a game was chosen or switched', () => {
    fakeStorage({ 'selected-game': 'briscola' });
    expect(isFirstVisit()).toBe(false);
  });

  it('is false for an existing install with any trace of play', () => {
    for (const key of ['scopa-game-state', 'scopa-game-stats', 'briscola-game-stats', 'scopa-mp-session', 'briscola-mp-session', 'mp-nickname']) {
      fakeStorage({ [key]: '{}' });
      expect(isFirstVisit(), key).toBe(false);
    }
  });

  it('never gates the game when storage is unavailable', () => {
    fakeStorage({}, true);
    expect(isFirstVisit()).toBe(false);
  });
});

describe('shouldAnnounceOtherGame (Scopa build: announces Briscola)', () => {
  const g = globalThis as unknown as { localStorage?: unknown };
  function fakeStorage(entries: Record<string, string>) {
    const map = new Map(Object.entries(entries));
    g.localStorage = { getItem: (k: string) => (map.has(k) ? map.get(k)! : null) };
  }
  afterEach(() => {
    delete g.localStorage;
  });

  it('is true for an existing Scopa player who never met Briscola', () => {
    fakeStorage({ 'scopa-game-stats': '{}' });
    expect(shouldAnnounceOtherGame()).toBe(true);
    fakeStorage({ 'mp-nickname': 'Tester' });
    expect(shouldAnnounceOtherGame()).toBe(true);
  });

  it('is false for a brand-new visitor (the chooser handles them)', () => {
    fakeStorage({});
    expect(shouldAnnounceOtherGame()).toBe(false);
  });

  it('is false once the user chose or switched, or was told already', () => {
    fakeStorage({ 'scopa-game-stats': '{}', 'selected-game': 'scopa' });
    expect(shouldAnnounceOtherGame()).toBe(false);
    fakeStorage({ 'scopa-game-stats': '{}', 'other-game-announced': '1' });
    expect(shouldAnnounceOtherGame()).toBe(false);
  });

  it('is false for someone who already played Briscola here', () => {
    fakeStorage({ 'scopa-game-stats': '{}', 'briscola-game-stats': '{}' });
    expect(shouldAnnounceOtherGame()).toBe(false);
  });
});
