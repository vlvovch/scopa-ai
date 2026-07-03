// Language Context — UI language (English / Italian) for both games.
//
// Resolution order: explicit user choice (localStorage) > browser locale
// (any Italian variant in navigator.languages) > English. The choice is
// stored outside GameSettings on purpose: it's a device-level preference
// like Text Size's pre-paint value, and "Reset to Defaults" in Settings
// should not silently flip the app's language.

import { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { en, type Translation } from './en';
import { it } from './it';

export type Language = 'en' | 'it';

const STORAGE_KEY = 'scopa-language';

const DICTIONARIES: Record<Language, Translation> = { en, it };

export function detectLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'it') return stored;
  } catch {
    // localStorage unavailable (private mode) — fall through to locale
  }
  const locales = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];
  for (const locale of locales) {
    const lang = locale?.toLowerCase();
    if (lang?.startsWith('it')) return 'it';
    if (lang?.startsWith('en')) return 'en';
  }
  return 'en';
}

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  /** The active translation dictionary. */
  t: Translation;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'en',
  setLanguage: () => {},
  t: en,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>(detectLanguage);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // best effort — private mode keeps the in-session choice only
    }
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo(
    () => ({ language, setLanguage, t: DICTIONARIES[language] }),
    [language]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

/** Full context: language + setter + dictionary (for the settings switcher). */
export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}

/** Just the active dictionary — the common case for rendering text. */
export function useT(): Translation {
  return useContext(LanguageContext).t;
}
