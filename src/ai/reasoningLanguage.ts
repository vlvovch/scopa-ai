// Which language a cloud model writes its reasoning in: the interface
// language. The prompts are English, and the models answered in English
// even when the interface was Italian, so an Italian player read English in
// the reasoning bubble. One closing line of the system instruction asks for
// Italian. The on-device model keeps its English instruction: it is small
// and was tuned on that text (docs/ios.md).
import { getCurrentLanguage } from '../i18n/currentLanguage';
import type { Language } from '../i18n/LanguageContext';

/** The closing line of a cloud model's system instruction for `language` (default: the interface language); empty for English. */
export function reasoningLanguageNote(language: Language = getCurrentLanguage()): string {
  if (language !== 'it') return '';
  return '\n\nLANGUAGE: write the "reasoning" text in Italian, because the player reads Italian. Use the Italian card names (denari, coppe, spade, bastoni; Asso, Re, Cavallo, Fante). Everything else in the answer stays exactly as specified.';
}
