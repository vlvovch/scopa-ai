// Briscola opponent backed by the on-device model (Apple Intelligence).
// Mirrors the Scopa class: one compact request per move with a deadline,
// guided output from the shell, heuristic fallback so the game never stalls.
import type { Move } from '../types';
import type { AsyncAIPlayer, LLMAIContext } from './types';
import type { Seat } from '../../../ai/seat';
import {
  getOnDeviceModel,
  isOnDeviceModelAvailable,
  ON_DEVICE_MODEL_NAME,
  type OnDeviceModel,
} from '../../../ai/onDeviceModel';
import { OnDeviceRequester, composeReasoning, type OnDeviceBotOptions } from '../../../ai/onDeviceBot';
import { SYSTEM_INSTRUCTION_ON_DEVICE, buildOnDeviceTurnPrompt, formatCard } from './prompts';
import { heuristicAI } from './heuristic';

export class AppleBriscolaAI implements AsyncAIPlayer {
  readonly name = ON_DEVICE_MODEL_NAME;
  readonly isAsync = true as const;
  public lastReasoning = '';
  /** True when the last move came from the heuristic because the model
   *  did not deliver (timeout, failure, invalid index); the UI marks it. */
  public lastMoveWasFallback = false;
  public lastTurnTimeMs = 0;
  private readonly requester: OnDeviceRequester;

  constructor(model: OnDeviceModel, seat: Seat = 'cpu', options: OnDeviceBotOptions = {}) {
    this.requester = new OnDeviceRequester(model, seat, options);
  }

  cancelPending(): void {
    this.requester.cancelPending();
  }

  /** Load the model and prepare the next session ahead of the request. */
  prewarm(): void {
    this.requester.prewarm(SYSTEM_INSTRUCTION_ON_DEVICE);
  }

  /** Drop the prepared session (game over or left). */
  release(): void {
    this.requester.release();
  }

  startRound(): void {
    this.cancelPending();
    this.lastReasoning = '';
    this.lastMoveWasFallback = false;
    this.prewarm();
  }

  endRound(): void {
    this.cancelPending();
  }

  async selectMove(context: LLMAIContext): Promise<Move> {
    const { hand, validMoves } = context;
    if (hand.length === 0) throw new Error('Cannot select move with empty hand');
    if (validMoves.length === 0) throw new Error('No valid moves available');
    this.lastMoveWasFallback = false;
    if (validMoves.length === 1) {
      this.lastReasoning = 'Only one card in hand.';
      return validMoves[0];
    }
    const started = performance.now();
    const outcome = await this.requester.ask({
      instructions: SYSTEM_INSTRUCTION_ON_DEVICE,
      prompt: buildOnDeviceTurnPrompt(context),
      moveCount: validMoves.length,
    });
    this.lastTurnTimeMs = performance.now() - started;
    const reasoning = outcome.kind === 'answer'
      ? composeReasoning(outcome.response, validMoves.length, (i) => formatCard(validMoves[i].cardPlayed))
      : '';
    if (outcome.kind !== 'stale') {
      console.info(`[briscola apple] move in ${(this.lastTurnTimeMs / 1000).toFixed(1)} s (${outcome.kind}, ${reasoning ? reasoning.split(/\s+/).length : 0} words)`);
      // The human thinks next: have the following session ready by then.
      this.prewarm();
    }
    switch (outcome.kind) {
      case 'answer': {
        const index = Number(outcome.response?.moveIndex);
        if (Number.isInteger(index) && index >= 0 && index < validMoves.length) {
          this.lastReasoning = reasoning;
          return validMoves[index];
        }
        console.warn(`[briscola apple] invalid moveIndex ${String(outcome.response?.moveIndex)}; heuristic move played`);
        this.lastReasoning = 'The on-device model picked an invalid move, so a heuristic move was played.';
        break;
      }
      case 'timeout':
        console.warn('[briscola apple] on-device model timed out; heuristic move played');
        this.lastReasoning = 'The on-device model took too long, so a heuristic move was played.';
        break;
      case 'stale':
        break;
      case 'failed':
        console.warn('[briscola apple] on-device model failed; heuristic move played:', outcome.error);
        this.lastReasoning = 'The on-device model did not answer, so a heuristic move was played.';
        break;
    }
    this.lastMoveWasFallback = true;
    return heuristicAI.selectMove(context);
  }
}

const instances = new Map<Seat, AppleBriscolaAI>();

function instanceFor(seat: Seat): AppleBriscolaAI | null {
  const model = getOnDeviceModel();
  if (!model) return null;
  let ai = instances.get(seat);
  if (!ai) {
    ai = new AppleBriscolaAI(model, seat);
    instances.set(seat, ai);
    ai.prewarm();
  }
  return ai;
}

export function getAppleBriscolaAI(seat: Seat = 'cpu'): AsyncAIPlayer | null {
  return instanceFor(seat);
}

export function isAppleAvailable(): boolean {
  return isOnDeviceModelAvailable();
}

/** Round lifecycle for a seat, like the other providers' start/end hooks.
 *  The start also loads the model while the cards are dealt. */
export function startAppleBriscolaRound(seat: Seat): void {
  instanceFor(seat)?.startRound();
}

export function endAppleBriscolaRound(seat: Seat): void {
  instances.get(seat)?.endRound();
}

/** Abandon every on-device request in flight and the prepared session
 *  (reset, invite, game switch, unmount). */
export function cancelOnDeviceRequests(): void {
  for (const ai of instances.values()) ai.cancelPending();
  void getOnDeviceModel()?.release?.().catch(() => undefined);
}
