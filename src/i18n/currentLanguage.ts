// The interface language as it is shown right now, for code outside React:
// the AI bots write their reasoning in it (src/ai/reasoningLanguage.ts).
// LanguageProvider keeps it up to date. No imports at run time, so the
// prompt modules that read it stay free of React and of storage.
import type { Language } from './LanguageContext';

let current: Language = 'en';

export function setCurrentLanguage(language: Language): void {
  current = language;
}

export function getCurrentLanguage(): Language {
  return current;
}
