// Web Worker: runs the Scopa win-odds simulation off the main thread.
//
// Work is done in small chunks (each a separate seed) so we can:
//   - stream a "settling" estimate to the UI after every chunk, and
//   - yield between chunks so a newer 'run' or a 'cancel' interrupts a
//     stale job instead of blocking behind a long synchronous loop.
//
// Determinism: the per-chunk seeds are derived from the job's baseSeed,
// so the same position + baseSeed reproduces the same stream.

import {
  tallyWinOdds,
  formatWinOdds,
  type WinOdds,
  type WinOddsTally,
  type MoveTally,
  type ScopaWinOddsView,
} from '../ai/winOdds';

export type WinOddsWorkerMessage =
  | {
      type: 'run';
      jobId: number;
      view: ScopaWinOddsView;
      totalSamples: number;
      chunkSize: number;
      baseSeed: number;
      /** Use the deeper (1-ply alpha-beta) playout policy mid-round. */
      deep?: boolean;
    }
  | { type: 'cancel'; jobId: number };

export type WinOddsWorkerResponse =
  | { type: 'progress'; jobId: number; odds: WinOdds }
  | { type: 'done'; jobId: number; odds: WinOdds }
  | { type: 'error'; jobId: number; message: string };

let currentJobId: number | null = null;

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function post(msg: WinOddsWorkerResponse) {
  (self as unknown as Worker).postMessage(msg);
}

function mergeInto(acc: WinOddsTally, t: WinOddsTally): void {
  acc.played += t.played;
  for (const [key, p] of Object.entries(t.perMove)) {
    const a: MoveTally =
      acc.perMove[key] ??
      (acc.perMove[key] = {
        wins: 0,
        ties: 0,
        losses: 0,
        played: 0,
        sumDiff: 0,
        sumSqDiff: 0,
      });
    a.wins += p.wins;
    a.ties += p.ties;
    a.losses += p.losses;
    a.played += p.played;
    a.sumDiff += p.sumDiff;
    a.sumSqDiff += p.sumSqDiff;
  }
}

async function runJob(
  jobId: number,
  view: ScopaWinOddsView,
  totalSamples: number,
  chunkSize: number,
  baseSeed: number,
  deep?: boolean
): Promise<void> {
  const acc: WinOddsTally = { played: 0, perMove: {} };
  let done = 0;
  let chunkIndex = 0;

  while (done < totalSamples) {
    // A newer run / cancel arrived while we were yielding — abandon.
    if (jobId !== currentJobId) return;

    const n = Math.min(chunkSize, totalSamples - done);
    // Distinct, deterministic seed per chunk.
    const seed = (baseSeed + chunkIndex * 0x9e3779b9) | 0;
    const tally = tallyWinOdds(view, { samples: n, seed, deep });
    mergeInto(acc, tally);
    // Endgame short-circuit: tallyWinOdds returned played=1 (a single
    // exact solve, no sampling). Don't keep looping: emit done and stop.
    const endgame = tally.played === 1 && n > 1;
    done = endgame ? totalSamples : done + n;
    chunkIndex++;

    if (jobId !== currentJobId) return;
    const odds = formatWinOdds(acc);
    if (done >= totalSamples) {
      post({ type: 'done', jobId, odds });
      return;
    }
    post({ type: 'progress', jobId, odds });
    await tick(); // let queued messages (newer run / cancel) run
  }
}

self.onmessage = (e: MessageEvent<WinOddsWorkerMessage>) => {
  const msg = e.data;

  if (msg.type === 'cancel') {
    if (currentJobId === msg.jobId) currentJobId = null;
    return;
  }

  // 'run' — supersede any in-flight job.
  currentJobId = msg.jobId;
  void runJob(
    msg.jobId,
    msg.view,
    msg.totalSamples,
    msg.chunkSize,
    msg.baseSeed,
    msg.deep
  ).catch((err) => {
    post({
      type: 'error',
      jobId: msg.jobId,
      message: err instanceof Error ? err.message : String(err),
    });
  });
};
