// Daily quotas for the free-AI proxy, counted in distinct games per UTC
// day: an allowance per player (fingerprint) and a shared cap on the total,
// so a busy day cannot run the Gemini bill open-ended. Everything is in
// memory: a restart forgets the counts, which errs on the generous side.

export type QuotaScope = 'user' | 'global';

export interface QuotaDecision {
  ok: boolean;
  /** Which allowance refused a new game (absent when ok). */
  scope?: QuotaScope;
  /** This player's games today, the per-player allowance. */
  gamesUsed: number;
  gamesLimit: number;
  /** Everyone's games today, the shared cap. */
  globalUsed: number;
  globalLimit: number;
}

interface PlayerEntry {
  gameIds: string[];
  expires: number;
}

/** Expiry for a day's entries: the next UTC midnight plus an hour of slack. */
export function expiryFor(dateKey: string): number {
  const next = new Date(`${dateKey}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(1, 0, 0, 0);
  return next.getTime();
}

export class GameQuota {
  private readonly players = new Map<string, PlayerEntry>();
  private day = { dateKey: '', gameIds: new Set<string>() };

  constructor(readonly perPlayer: number, readonly total: number) {}

  /**
   * Count a request for `gameId` from `fingerprint` on `dateKey`. A game
   * already counted passes; a new one is admitted only while both the
   * player's allowance and the shared cap have room, and is then counted
   * against both.
   */
  admit(fingerprint: string, gameId: string, dateKey: string): QuotaDecision {
    if (this.day.dateKey !== dateKey) this.day = { dateKey, gameIds: new Set() };
    const key = `${fingerprint}:${dateKey}`;
    const entry = this.players.get(key);
    const gameIds = entry ? entry.gameIds : [];
    const newForPlayer = !gameIds.includes(gameId);
    const newForAll = !this.day.gameIds.has(gameId);
    const state = {
      gamesUsed: gameIds.length,
      gamesLimit: this.perPlayer,
      globalUsed: this.day.gameIds.size,
      globalLimit: this.total,
    };
    if (newForPlayer && gameIds.length >= this.perPlayer) return { ok: false, scope: 'user', ...state };
    if (newForAll && this.day.gameIds.size >= this.total) return { ok: false, scope: 'global', ...state };
    if (newForPlayer) {
      gameIds.push(gameId);
      this.players.set(key, { gameIds, expires: expiryFor(dateKey) });
    }
    if (newForAll) this.day.gameIds.add(gameId);
    return { ok: true, ...state, gamesUsed: gameIds.length, globalUsed: this.day.gameIds.size };
  }

  /** Drop the player entries of past days; returns how many were dropped. */
  cleanup(now: number = Date.now()): number {
    let dropped = 0;
    for (const [key, entry] of this.players) {
      if (entry.expires <= now) {
        this.players.delete(key);
        dropped += 1;
      }
    }
    return dropped;
  }

  get activePlayers(): number {
    return this.players.size;
  }
}
