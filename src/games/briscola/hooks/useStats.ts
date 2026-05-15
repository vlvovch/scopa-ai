// Briscola match-statistics hook. Persists every finished match to
// localStorage and exposes per-bot summary queries.

import { useState, useEffect, useCallback } from 'react';
import type { CpuBotName } from '../StartScreen';

/** One finished match (best-of-N round wins ⇒ a single MatchRecord) */
export interface MatchRecord {
  id: string;
  /** Which CPU bot the player faced */
  cpuBot: CpuBotName;
  /** Player's cumulative round wins */
  playerWins: number;
  /** CPU's cumulative round wins */
  cpuWins: number;
  /** 'human' | 'cpu' | 'tie' — the match outcome */
  winner: 'human' | 'cpu' | 'tie';
  /** Per-round 120-point splits, in chronological order. rounds.length is
   *  the number of rounds actually played. */
  rounds: Array<{ playerPoints: number; cpuPoints: number }>;
  /** "Best of N" that was selected for this match */
  bestOf: number;
  /** Wall-clock timestamp the match ended */
  timestamp: number;
}

/** Per-bot summary, computed at ROUND granularity — i.e. each 120-point
 *  round counts as one "game" toward gamesPlayed/wins/losses/ties.
 *  This matches the user-facing model that a "game of Briscola" is one
 *  round, not a best-of-N match. */
export interface BotSummary {
  cpuBot: CpuBotName;
  /** Total rounds played against this bot */
  gamesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  /** Wins / gamesPlayed (0–1), or 0 if no rounds played yet */
  winRate: number;
}

/** A single 120-point round, flattened out of its parent match for the
 *  per-opponent detail view. */
export interface RoundEntry {
  id: string;
  timestamp: number;
  cpuBot: CpuBotName;
  playerPoints: number;
  cpuPoints: number;
  outcome: 'win' | 'loss' | 'tie';
}

interface StatsStore {
  matches: MatchRecord[];
  lastUpdated: number;
}

const STORAGE_KEY = 'briscola-game-stats';

function newId(): string {
  return `match-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function load(): StatsStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        matches: Array.isArray(parsed.matches) ? parsed.matches : [],
        lastUpdated: parsed.lastUpdated ?? Date.now(),
      };
    }
  } catch (e) {
    console.warn('Failed to load Briscola stats:', e);
  }
  return { matches: [], lastUpdated: Date.now() };
}

function save(s: StatsStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch (e) {
    console.warn('Failed to save Briscola stats:', e);
  }
}

export function useBriscolaStats() {
  const [store, setStore] = useState<StatsStore>(load);

  useEffect(() => {
    save(store);
  }, [store]);

  const recordMatch = useCallback(
    (
      cpuBot: CpuBotName,
      playerWins: number,
      cpuWins: number,
      bestOf: number,
      rounds: Array<{ playerPoints: number; cpuPoints: number }>
    ) => {
      const winner: MatchRecord['winner'] =
        playerWins > cpuWins ? 'human' : cpuWins > playerWins ? 'cpu' : 'tie';
      const record: MatchRecord = {
        id: newId(),
        cpuBot,
        playerWins,
        cpuWins,
        winner,
        rounds,
        bestOf,
        timestamp: Date.now(),
      };
      setStore((prev) => ({
        matches: [...prev.matches, record],
        lastUpdated: Date.now(),
      }));
      return record;
    },
    []
  );

  /** Round-level summary for one bot. Each 120-point round counts as a
   *  game; we don't bucket by match here. */
  const getBotSummary = useCallback(
    (cpuBot: CpuBotName): BotSummary => {
      let wins = 0, losses = 0, ties = 0;
      for (const m of store.matches) {
        if (m.cpuBot !== cpuBot) continue;
        for (const r of m.rounds ?? []) {
          if (r.playerPoints > r.cpuPoints) wins++;
          else if (r.cpuPoints > r.playerPoints) losses++;
          else ties++;
        }
      }
      const gamesPlayed = wins + losses + ties;
      return {
        cpuBot,
        gamesPlayed,
        wins,
        losses,
        ties,
        winRate: gamesPlayed > 0 ? wins / gamesPlayed : 0,
      };
    },
    [store.matches]
  );

  /** Flatten matches against `cpuBot` into a list of individual rounds,
   *  sorted by timestamp descending (newest first), then within a match
   *  by round-position descending (last round of a match first). */
  const getRoundsAgainst = useCallback(
    (cpuBot: CpuBotName): RoundEntry[] => {
      const out: RoundEntry[] = [];
      for (const m of store.matches) {
        if (m.cpuBot !== cpuBot) continue;
        const rs = m.rounds ?? [];
        for (let i = 0; i < rs.length; i++) {
          const r = rs[i];
          const outcome: RoundEntry['outcome'] =
            r.playerPoints > r.cpuPoints
              ? 'win'
              : r.cpuPoints > r.playerPoints
                ? 'loss'
                : 'tie';
          out.push({
            id: `${m.id}-r${i}`,
            // Within a match all rounds share a timestamp, so add a tiny
            // per-round offset so they sort in play order.
            timestamp: m.timestamp + i,
            cpuBot,
            playerPoints: r.playerPoints,
            cpuPoints: r.cpuPoints,
            outcome,
          });
        }
      }
      return out.sort((a, b) => b.timestamp - a.timestamp);
    },
    [store.matches]
  );

  const clearStats = useCallback(() => {
    setStore({ matches: [], lastUpdated: Date.now() });
  }, []);

  return {
    matches: store.matches,
    recordMatch,
    getBotSummary,
    getRoundsAgainst,
    clearStats,
  };
}
