// Which language the app starts in: the saved choice, else the system's
// choice for the app (iOS), else the browser's list, else English.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { detectLanguage } from './LanguageContext';
import { getSystemLanguage, setSystemLanguage } from './systemLanguage';

function environment(stored: string | null, browser: string[]) {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => (key === 'scopa-language' ? stored : null),
    setItem: () => {},
    removeItem: () => {},
  });
  vi.stubGlobal('navigator', { languages: browser, language: browser[0] });
}

afterEach(() => {
  setSystemLanguage(null);
  vi.unstubAllGlobals();
});

describe('setSystemLanguage', () => {
  it('keeps English and Italian in any regional form and drops everything else', () => {
    setSystemLanguage('it');
    expect(getSystemLanguage()).toBe('it');
    setSystemLanguage('it-CH');
    expect(getSystemLanguage()).toBe('it');
    setSystemLanguage('en-GB');
    expect(getSystemLanguage()).toBe('en');
    for (const other of ['uk', 'Base', '', null, undefined, 7]) {
      setSystemLanguage(other);
      expect(getSystemLanguage()).toBeNull();
    }
  });
});

describe('detectLanguage', () => {
  it('follows the browser list when nothing else is known', () => {
    environment(null, ['de-DE', 'it-IT', 'en-US']);
    expect(detectLanguage()).toBe('it');
    environment(null, ['uk-UA']);
    expect(detectLanguage()).toBe('en');
  });

  it('prefers the system choice for the app over the first device language', () => {
    // The iOS web view reports only the first device language.
    environment(null, ['uk-UA']);
    setSystemLanguage('it');
    expect(detectLanguage()).toBe('it');
  });

  it('keeps the saved choice above everything', () => {
    environment('en', ['it-IT']);
    setSystemLanguage('it');
    expect(detectLanguage()).toBe('en');
  });
});
