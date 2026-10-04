// The language the operating system chose for the app, where the shell can
// say so: the iOS app sets it before the first render
// (src/platform/bootstrap.ts). iOS picks it from the languages the bundle
// declares (English, Italian) and looks past device languages the app does
// not have, while the web view reports only the first device language. A
// phone set to German, then Italian, starts in Italian this way instead of
// English. Null on the website, where navigator.languages already lists
// every preference.
export type SystemLanguage = 'en' | 'it';

let systemLanguage: SystemLanguage | null = null;

/** Takes a localization name as the system reports it ("it", "it-IT", "en"); anything else clears it. */
export function setSystemLanguage(code: unknown): void {
  const lang = typeof code === 'string' ? code.toLowerCase() : '';
  systemLanguage = lang.startsWith('it') ? 'it' : lang.startsWith('en') ? 'en' : null;
}

export function getSystemLanguage(): SystemLanguage | null {
  return systemLanguage;
}
