// React hook: live Scopa win-odds for the human seat, computed in a Web
// Worker. Debounces on position change, supersedes stale jobs, and
// surfaces the streamed (settling) estimate.
//
// The caller is responsible for only enabling this in allowed contexts
// (single-player Play mode — never multiplayer/spectator). When
// `enabled` is false or `view` is null the hook is inert.

import { useEffect, useRef, useState } from 'react';
import type { WinOdds, ScopaWinOddsView } from '../ai/winOdds';
import type {
  WinOddsWorkerMessage,
  WinOddsWorkerResponse,
} from '../workers/winOdds.worker';

export interface UseWinOddsOptions {
  enabled: boolean;
  /** Human info-set view, or null when odds shouldn't be computed
   *  (not the human's turn, round over, etc.). */
  view: ScopaWinOddsView | null;
  totalSamples?: number;
  chunkSize?: number;
  debounceMs?: number;
  /** Use the deeper (1-ply alpha-beta) playout policy mid-round. */
  deep?: boolean;
}

export interface UseWinOddsResult {
  odds: WinOdds | null;
  /** True while a job is running and hasn't streamed a final result yet. */
  computing: boolean;
}

const ids = (cs: { id: string }[] | undefined) =>
  (cs ?? []).map((c) => c.id).sort().join(',');

/** Stable string identifying the human's info-set (also seeds the RNG so
 *  the same position reproduces the same stream — no flicker on
 *  re-render). Deliberately excludes the opponent's hidden hand: it is
 *  resampled by the engine, so it must not perturb the seed. */
function viewKey(v: ScopaWinOddsView): string {
  const g = v.game;
  const me = v.player;
  const opp = me === 'human' ? 'cpu' : 'human';
  return [
    me,
    g.round.currentPlayer,
    g.round.lastCapture ?? '-',
    g.roundNumber,
    g.round.deck.length,
    ids(g.players[me].hand),
    ids(g.round.table),
    ids(g.players[me].captured),
    ids(g.players[opp].captured),
    g.players[me].scopaCount,
    g.players[opp].scopaCount,
  ].join('|');
}

function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h | 0;
}

export function useWinOdds({
  enabled,
  view,
  totalSamples = 200,
  chunkSize = 20,
  debounceMs = 200,
  deep = false,
}: UseWinOddsOptions): UseWinOddsResult {
  const [odds, setOdds] = useState<WinOdds | null>(null);
  const [computing, setComputing] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const jobIdRef = useRef(0);

  // Create the worker once.
  useEffect(() => {
    const worker = new Worker(
      new URL('../workers/winOdds.worker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<WinOddsWorkerResponse>) => {
      const msg = e.data;
      // Ignore anything from a superseded job.
      if (msg.jobId !== jobIdRef.current) return;
      if (msg.type === 'progress') {
        setOdds(msg.odds);
      } else if (msg.type === 'done') {
        setOdds(msg.odds);
        setComputing(false);
      } else {
        setComputing(false);
      }
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const key = enabled && view ? viewKey(view) : null;

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;

    // Disabled / no position → drop any in-flight job and clear.
    if (!enabled || !view || key === null) {
      jobIdRef.current++; // supersede: ignore any late messages
      setComputing(false);
      setOdds(null);
      return;
    }

    // Position / tuning changed. Supersede any in-flight job IMMEDIATELY
    // (not when the debounced run finally fires) so its still-streaming
    // 'progress' messages can't briefly paint stale odds during the
    // debounce window, and tell the worker to stop wasting cycles on it.
    const supersededId = jobIdRef.current;
    jobIdRef.current++;
    worker.postMessage({ type: 'cancel', jobId: supersededId });

    const t = setTimeout(() => {
      const jobId = ++jobIdRef.current;
      setComputing(true);
      const runMsg: WinOddsWorkerMessage = {
        type: 'run',
        jobId,
        view,
        totalSamples,
        chunkSize,
        baseSeed: hashSeed(key),
        deep,
      };
      worker.postMessage(runMsg);
    }, debounceMs);

    return () => clearTimeout(t);
    // key encodes the position; the numeric tuning knobs are deps too.
  }, [enabled, view, key, totalSamples, chunkSize, debounceMs, deep]);

  return { odds, computing };
}
