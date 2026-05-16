// Briscola match-statistics hook. Persists every finished match to
// localStorage and exposes per-opponent summary queries.
//
// Schema:
//   - `opponentType`: a wide BriscolaOpponentName covering both sync CPU
//     bots (random/heuristic/expert) and async LLM opponents (gemini /
//     gemini-free / openai / claude).
//   - `opponentModel`: the model id for LLM opponents (e.g.
//     "claude-opus-4-7-20251015"). Empty for CPU bots. Lets the player
//     see "Claude Opus 4.7" stats separately from "Claude Sonnet 4.5".
//   - Legacy records use `cpuBot` (narrow CpuBotName). We migrate them
//     on load so the rest of the code only deals with the new shape.

import { useState, useEffect, useCallback } from 'react';
import type { CpuBotName, BriscolaOpponentName } from '../StartScreen';

/** One finished match (best-of-N round wins ⇒ a single MatchRecord) */
export interface MatchRecord {
  id: string;
  /** Which opponent the player faced — CPU bot or async LLM. */
  opponentType: BriscolaOpponentName;
  /** Specific model id (LLM opponents only; undefined for CPU bots). */
  opponentModel?: string;
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

/** Per-opponent summary at ROUND granularity (each 120-pt round = one game). */
export interface BotSummary {
  opponentType: BriscolaOpponentName;
  opponentModel?: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  winRate: number;
}

/** A single 120-pt round, flattened out of its parent match for the
 *  per-opponent detail view. */
export interface RoundEntry {
  id: string;
  timestamp: number;
  opponentType: BriscolaOpponentName;
  opponentModel?: string;
  playerPoints: number;
  cpuPoints: number;
  outcome: 'win' | 'loss' | 'tie';
}

interface StatsStore {
  matches: MatchRecord[];
  lastUpdated: number;
}

const STORAGE_KEY = 'briscola-game-stats';
const CPU_BOT_NAMES: CpuBotName[] = ['random', 'heuristic', 'expert'];

function newId(): string {
  return `match-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Migrate legacy records (with `cpuBot` instead of `opponentType`) so the
 * rest of the code only deals with the new shape. Idempotent.
 */
function migrate(raw: unknown): MatchRecord[] {
  if (!raw || typeof raw !== 'object') return [];
  const arr = (raw as { matches?: unknown }).matches;
  if (!Array.isArray(arr)) return [];
  return arr.map((m: Record<string, unknown>) => {
    const opponentType = (m.opponentType ?? m.cpuBot) as BriscolaOpponentName;
    const opponentModel = m.opponentModel as string | undefined;
    return {
      id: (m.id as string) ?? newId(),
      opponentType,
      opponentModel,
      playerWins: (m.playerWins as number) ?? 0,
      cpuWins: (m.cpuWins as number) ?? 0,
      winner: (m.winner as MatchRecord['winner']) ?? 'tie',
      rounds: Array.isArray(m.rounds) ? (m.rounds as MatchRecord['rounds']) : [],
      bestOf: (m.bestOf as number) ?? 1,
      timestamp: (m.timestamp as number) ?? Date.now(),
    } satisfies MatchRecord;
  });
}

function load(): StatsStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        matches: migrate(parsed),
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

/** Records key on (type, model). model is treated as part of identity for
 *  LLMs but ignored for CPU bots (they have no model). */
function recordMatches(
  m: MatchRecord,
  type: BriscolaOpponentName,
  model?: string
): boolean {
  if (m.opponentType !== type) return false;
  if (model !== undefined && m.opponentModel !== model) return false;
  return true;
}

export function useBriscolaStats() {
  const [store, setStore] = useState<StatsStore>(load);

  useEffect(() => {
    save(store);
  }, [store]);

  const recordMatch = useCallback(
    (
      opponentType: BriscolaOpponentName,
      opponentModel: string | undefined,
      playerWins: number,
      cpuWins: number,
      bestOf: number,
      rounds: Array<{ playerPoints: number; cpuPoints: number }>
    ) => {
      const winner: MatchRecord['winner'] =
        playerWins > cpuWins ? 'human' : cpuWins > playerWins ? 'cpu' : 'tie';
      const record: MatchRecord = {
        id: newId(),
        opponentType,
        opponentModel,
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

  /** Round-level summary for one opponent (type + optional model). */
  const getBotSummary = useCallback(
    (opponentType: BriscolaOpponentName, opponentModel?: string): BotSummary => {
      let wins = 0,
        losses = 0,
        ties = 0;
      for (const m of store.matches) {
        if (!recordMatches(m, opponentType, opponentModel)) continue;
        for (const r of m.rounds ?? []) {
          if (r.playerPoints > r.cpuPoints) wins++;
          else if (r.cpuPoints > r.playerPoints) losses++;
          else ties++;
        }
      }
      const gamesPlayed = wins + losses + ties;
      return {
        opponentType,
        opponentModel,
        gamesPlayed,
        wins,
        losses,
        ties,
        winRate: gamesPlayed > 0 ? wins / gamesPlayed : 0,
      };
    },
    [store.matches]
  );

  /** Flatten matches against an opponent into a list of individual rounds,
   *  newest first. */
  const getRoundsAgainst = useCallback(
    (
      opponentType: BriscolaOpponentName,
      opponentModel?: string
    ): RoundEntry[] => {
      const out: RoundEntry[] = [];
      for (const m of store.matches) {
        if (!recordMatches(m, opponentType, opponentModel)) continue;
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
            timestamp: m.timestamp + i,
            opponentType: m.opponentType,
            opponentModel: m.opponentModel,
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

  /** Distinct (type, model) pairs that have been played against. */
  const getPlayedOpponents = useCallback((): Array<{
    type: BriscolaOpponentName;
    model?: string;
  }> => {
    const seen = new Map<string, { type: BriscolaOpponentName; model?: string }>();
    for (const m of store.matches) {
      const key = `${m.opponentType}::${m.opponentModel ?? ''}`;
      if (!seen.has(key)) {
        seen.set(key, { type: m.opponentType, model: m.opponentModel });
      }
    }
    return Array.from(seen.values());
  }, [store.matches]);

  /** What to show in the StatsModal opponent list: CPU bots always, plus
   *  every LLM (type, model) pair the player has played. */
  const getAllDisplayOpponents = useCallback((): Array<{
    type: BriscolaOpponentName;
    model?: string;
  }> => {
    const result: Array<{ type: BriscolaOpponentName; model?: string }> = [];
    for (const cpu of CPU_BOT_NAMES) result.push({ type: cpu });
    for (const op of getPlayedOpponents()) {
      if (!CPU_BOT_NAMES.includes(op.type as CpuBotName)) {
        result.push(op);
      }
    }
    return result;
  }, [getPlayedOpponents]);

  const clearStats = useCallback(() => {
    setStore({ matches: [], lastUpdated: Date.now() });
  }, []);

  return {
    matches: store.matches,
    recordMatch,
    getBotSummary,
    getRoundsAgainst,
    getPlayedOpponents,
    getAllDisplayOpponents,
    clearStats,
  };
}
