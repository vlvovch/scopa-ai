// The data notice before the first game against an AI service. App Review
// Guideline 5.1.2(i) asks for a clear disclosure and explicit permission
// before anything is shared with third-party AI; the website shows the same
// notice so both platforms behave alike. What a game sends is only its own
// state (cards, scores, moves), never anything about the player, but the
// destination differs: the Free AI goes through our proxy to Google, a
// user's own key goes straight from the device to the provider it belongs
// to. The answer is remembered through the storage seam (Preferences on
// iOS, localStorage on the web) and can be reset from Settings. Neither the
// CPU bots nor the on-device model (Apple Intelligence) need it.
import { storage } from '../platform/storage';

export const AI_DATA_CONSENT_KEY = 'ai-data-consent';

/** Where a seat's requests go: through our proxy ('free') or straight to the
 *  provider of the user's own key ('key'). */
export type AIDataDestination = 'free' | 'key';

/** The destination of one opponent type, or null when it sends nothing
 *  (CPU bots, the on-device model, a human). Works for both games' names:
 *  the LLM ones are shared, Scopa adds "-singleturn" variants. */
export function aiDataDestination(aiType: string): AIDataDestination | null {
  if (aiType === 'gemini-free') return 'free';
  if (/^(gemini|openai|claude|openrouter)(-singleturn)?$/.test(aiType)) return 'key';
  return null;
}

/** The distinct destinations a set of seats would send to, 'free' first. */
export function aiDataDestinations(seats: readonly string[]): AIDataDestination[] {
  const found = new Set<AIDataDestination>();
  for (const seat of seats) {
    const destination = aiDataDestination(seat);
    if (destination) found.add(destination);
  }
  return (['free', 'key'] as const).filter((d) => found.has(d));
}

/** When the notice was accepted, or null: not yet, or the answer could not be read. */
export function aiDataConsentDate(): Date | null {
  try {
    const stored = storage.get(AI_DATA_CONSENT_KEY);
    if (!stored) return null;
    const date = new Date(stored);
    return Number.isNaN(date.getTime()) ? new Date(0) : date;
  } catch {
    return null;
  }
}

export function hasAIDataConsent(): boolean {
  return aiDataConsentDate() !== null;
}

/** Remember the acceptance; a storage that cannot be written only means the notice shows again next time. */
export function grantAIDataConsent(now: Date = new Date()): void {
  try {
    storage.set(AI_DATA_CONSENT_KEY, now.toISOString());
  } catch {
    // ignored: see above
  }
}

/** Forget the acceptance (Settings → show the notice again). */
export function revokeAIDataConsent(): void {
  try {
    storage.remove(AI_DATA_CONSENT_KEY);
  } catch {
    // ignored
  }
}
