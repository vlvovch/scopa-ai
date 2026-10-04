// The App Store rating prompt of the iOS app.
//
// Apple allows one way to ask for a rating: the system's own prompt
// (StoreKit, through ios/App/App/ReviewPlugin.swift). The system decides
// whether it really appears (at most three times a year per user, never in
// TestFlight), and Apple asks apps to request it at a natural pause, once
// the player has shown that they use the app, and never as the answer to a
// tap. So the app asks after a finished game the player won, once a few
// games have been finished on this device, and then not again for months.
// The count is remembered through the storage seam. The website has nothing
// like it: there this does nothing.
import { IS_NATIVE_BUILD } from './native';
import { storage } from './storage';

export const REVIEW_PROMPT_KEY = 'review-prompt';
/** Finished games (won or lost) before the first ask. */
export const MIN_FINISHED_GAMES = 3;
/** Days before the app asks again. */
export const MIN_DAYS_BETWEEN_ASKS = 120;
// The end-of-game screen and its sound come first.
const ASK_DELAY_MS = 2000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReviewPromptState {
  /** Games finished on this device since the prompt exists. */
  finished: number;
  /** When the system was last asked for the prompt (ISO date), or null. */
  lastAsked: string | null;
}

export function readReviewPromptState(): ReviewPromptState {
  try {
    const parsed = JSON.parse(storage.get(REVIEW_PROMPT_KEY) ?? 'null') as Partial<ReviewPromptState> | null;
    const finished = typeof parsed?.finished === 'number' && parsed.finished > 0 ? Math.floor(parsed.finished) : 0;
    const lastAsked = typeof parsed?.lastAsked === 'string' && !Number.isNaN(Date.parse(parsed.lastAsked)) ? parsed.lastAsked : null;
    return { finished, lastAsked };
  } catch {
    return { finished: 0, lastAsked: null };
  }
}

/** Whether this finished game is a moment to ask, given what is remembered (the game itself already counted). */
export function shouldAskForReview(state: ReviewPromptState, won: boolean, now: Date = new Date()): boolean {
  if (!won || state.finished < MIN_FINISHED_GAMES) return false;
  if (!state.lastAsked) return true;
  return now.getTime() - Date.parse(state.lastAsked) >= MIN_DAYS_BETWEEN_ASKS * DAY_MS;
}

/** Count a finished game and say whether to ask now; an ask is remembered at once. */
export function recordFinishedGame(won: boolean, now: Date = new Date()): boolean {
  const state = readReviewPromptState();
  state.finished += 1;
  const ask = shouldAskForReview(state, won, now);
  if (ask) state.lastAsked = now.toISOString();
  try {
    storage.set(REVIEW_PROMPT_KEY, JSON.stringify(state));
  } catch {
    // A count that cannot be saved must not lead to a prompt after every game.
    return false;
  }
  return ask;
}

/** Called when the player's own game ends (not a watched one): the iOS app may ask for a rating. */
export function noteGameFinished(won: boolean): void {
  if (!IS_NATIVE_BUILD) return;
  if (!recordFinishedGame(won)) return;
  setTimeout(() => {
    import('./reviewPlugin')
      .then(({ Review }) => Review.request())
      .catch(() => undefined);
  }, ASK_DELAY_MS);
}
