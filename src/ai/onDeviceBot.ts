// What the two on-device bots share: one request at a time per seat, a
// deadline on every request, cancellation of requests the game no longer
// wants, and replies that arrive after that are ignored.
import { ON_DEVICE_TIMEOUT_MS, type OnDeviceModel, type OnDeviceMoveRequest, type OnDeviceMoveResponse } from './onDeviceModel';

export interface OnDeviceBotOptions {
  /** Deadline for one move (the shell enforces it; the bot adds a small grace). */
  timeoutMs?: number;
}

export class DeadlineError extends Error {
  constructor(ms: number) {
    super(`on-device model took longer than ${ms} ms`);
    this.name = 'DeadlineError';
  }
}

/** Reject `promise` if it has not settled within `ms`; the timer never outlives it. */
export function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new DeadlineError(ms)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

/** The first `max` sentences of `text` (sentence ends: . ! ? followed by a space or the end). */
export function firstSentences(text: string, max: number): string {
  const ends = /[.!?]+(?=\s|$)/g;
  let count = 0;
  let match: RegExpExecArray | null;
  while ((match = ends.exec(text)) !== null) {
    count += 1;
    if (count === max) return text.slice(0, match.index + match[0].length).trim();
  }
  return text.trim();
}

/** A note without the move it belongs to repeated at its start, tags included
 *  ("Play 7 of cups: takes..." → "takes...", "Plays 2 of Coins (trump): wins..." → "wins..."). */
function trimEchoedMove(note: string, move: string): string {
  const escaped = move.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return note.replace(new RegExp(`^(?:play(?:s|ing)?\\s+)?${escaped}(?:\\s*\\([^)]*\\))*\\s*(?:[:,;–—-]\\s*)?`, 'i'), '').trim();
}

/**
 * The reasoning to show: one line per weighed move, named by its card (the
 * model only knows indexes) with its note, the chosen one ticked, then the
 * verdict as its own paragraph, capped at two sentences because the small
 * model tends to keep going and invent from there. Candidates with a bad
 * index, an empty note or a repeated index are dropped; without any, just
 * the verdict.
 */
export function composeReasoning(response: OnDeviceMoveResponse, moveCount: number, describeMove: (index: number) => string): string {
  const chosen = Number(response.moveIndex);
  const seen = new Set<number>();
  const lines: string[] = [];
  for (const c of Array.isArray(response.candidates) ? response.candidates : []) {
    if (!Number.isInteger(c?.moveIndex) || c.moveIndex < 0 || c.moveIndex >= moveCount) continue;
    if (typeof c.note !== 'string' || c.note.trim() === '' || seen.has(c.moveIndex)) continue;
    seen.add(c.moveIndex);
    const move = describeMove(c.moveIndex);
    const note = trimEchoedMove(c.note, move);
    lines.push(`${c.moveIndex === chosen ? '✓' : '•'} ${move}${note ? `: ${note}` : ''}`);
  }
  const verdict = firstSentences(typeof response.reasoning === 'string' ? response.reasoning : '', 2);
  return [lines.join('\n'), verdict].filter(Boolean).join('\n\n');
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
  return String(error);
}

export type OnDeviceOutcome =
  | { kind: 'answer'; response: OnDeviceMoveResponse; requestId: string }
  | { kind: 'stale' }
  | { kind: 'timeout' }
  | { kind: 'failed'; error: unknown };

/**
 * The per-seat request lifecycle. `ask` sends one request; a newer `ask`,
 * a `cancelPending` or the deadline makes any earlier reply "stale", and
 * stale replies are reported as such so callers never act on them.
 */
export class OnDeviceRequester {
  private seq = 0;
  private inflight: string | null = null;
  private readonly timeoutMs: number;

  constructor(private readonly model: OnDeviceModel, private readonly seat: string, options: OnDeviceBotOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? ON_DEVICE_TIMEOUT_MS;
  }

  /** Prepare the next session while the other player is thinking. */
  prewarm(instructions: string): void {
    void this.model.prewarm?.(instructions).catch(() => undefined);
  }

  /** Drop the prepared session (the game is over or was left). */
  release(): void {
    void this.model.release?.().catch(() => undefined);
  }

  /** Abandon the request in flight, if any (new round, reset, unmount). */
  cancelPending(): void {
    const id = this.inflight;
    if (!id) return;
    this.inflight = null;
    void this.model.cancel(id);
  }

  async ask(request: Omit<OnDeviceMoveRequest, 'requestId' | 'timeoutMs'>): Promise<OnDeviceOutcome> {
    this.cancelPending();
    const requestId = `${this.seat}-${++this.seq}`;
    this.inflight = requestId;
    // The shell rejects at timeoutMs on its own; the grace covers a bridge
    // that never answers at all.
    const grace = Math.min(1_500, this.timeoutMs);
    try {
      const response = await withDeadline(
        this.model.selectMove({ ...request, requestId, timeoutMs: this.timeoutMs }),
        this.timeoutMs + grace
      );
      if (this.inflight !== requestId) return { kind: 'stale' };
      this.inflight = null;
      return { kind: 'answer', response, requestId };
    } catch (error) {
      if (this.inflight !== requestId) return { kind: 'stale' };
      this.inflight = null;
      if (error instanceof DeadlineError) {
        void this.model.cancel(requestId);
        return { kind: 'timeout' };
      }
      // The shell's own deadline (it has already cancelled the generation).
      if (/timed out/i.test(errorMessage(error))) return { kind: 'timeout' };
      return { kind: 'failed', error };
    }
  }
}
