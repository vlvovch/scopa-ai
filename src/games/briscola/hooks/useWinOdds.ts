// React hook: live Briscola win-odds for the human seat, computed in a
// Web Worker. Debounces on position change, supersedes stale jobs, and
// surfaces the streamed (settling) estimate.
//
// The caller is responsible for only enabling this in allowed contexts
// (single-player Play mode — never multiplayer/watch). When `enabled` is
// false or `view` is null the hook is inert and reports no odds.

import { useEffect, useRef, useState } from 'react';
import type { AIContext } from '../ai/types';
import type { WinOdds } from '../ai/winOdds';
import type {
  WinOddsWorkerMessage,
  WinOddsWorkerResponse,
} from '../workers/winOdds.worker';

export interface UseWinOddsOptions {
  enabled: boolean;
  /** Player-1 info-set view, or null when odds shouldn't be computed
   *  (not the human's turn, round over, etc.). */
  view: AIContext | null;
  totalSamples?: number;
  chunkSize?: number;
  debounceMs?: number;
  /** Capped rollout depth (forwarded to the engine). */
  maxPlies?: number;
  /** Also compute per-card odds (≈hand-size× more work). */
  perCard?: boolean;
}

export interface UseWinOddsResult {
  odds: WinOdds | null;
  /** True while a job is running and hasn't streamed a final result yet. */
  computing: boolean;
}

/** Stable string identifying a position (also seeds the RNG so the same
 *  position reproduces the same stream — no flicker on re-render). */
function viewKey(v: AIContext): string {
  const ids = (cs: { id: string }[] | undefined) =>
    (cs ?? []).map((c) => c.id).sort().join(',');
  return [
    v.player,
    ids(v.hand),
    v.leadCard?.id ?? '-',
    v.trump.id,
    v.deckCount,
    ids(v.myCaptured),
    ids(v.oppCaptured),
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
  chunkSize = 25,
  debounceMs = 200,
  maxPlies,
  perCard = false,
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

    const t = setTimeout(() => {
      const jobId = ++jobIdRef.current;
      setComputing(true);
      const runMsg: WinOddsWorkerMessage = {
        type: 'run',
        jobId,
        ctx: view,
        totalSamples,
        chunkSize,
        baseSeed: hashSeed(key),
        maxPlies,
        perCard,
      };
      worker.postMessage(runMsg);
    }, debounceMs);

    return () => clearTimeout(t);
    // key encodes the position; the numeric tuning knobs are deps too.
  }, [
    enabled,
    view,
    key,
    totalSamples,
    chunkSize,
    debounceMs,
    maxPlies,
    perCard,
  ]);

  return { odds, computing };
}
