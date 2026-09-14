// Registry of "forget the bot instances built with the old API key" hooks.
//
// Each LLM bot module (Scopa's gemini / openai / claude and their single-
// turn variants, openrouter, Briscola's gemini / openai / claude /
// openrouter) caches instances per
// (model, thinking) and registers its cache-clearer here at module load.
// The Settings modal calls clearApiKeyCaches(provider) when a key changes.
//
// Why a registry instead of importing each game's clearers directly: the
// Settings modal is shared by both games and lives in the main chunk. A
// static import from a game's AI barrel would drag that game's bot
// modules (prompts, request builders, ...) into the main chunk even when
// the game itself is a lazily loaded chunk (see src/App.tsx), undoing the
// code split. With the registry, a game that hasn't been loaded yet
// simply has nothing to clear.
export type ApiKeyProvider = 'gemini' | 'openai' | 'claude' | 'openrouter';

const clearers: Record<ApiKeyProvider, Set<() => void>> = {
  gemini: new Set(),
  openai: new Set(),
  claude: new Set(),
  openrouter: new Set(),
};

export function registerApiKeyCacheClearer(provider: ApiKeyProvider, clear: () => void): void {
  clearers[provider].add(clear);
}

export function clearApiKeyCaches(provider: ApiKeyProvider): void {
  for (const clear of clearers[provider]) {
    try {
      clear();
    } catch {
      // A failing clearer must not block the others.
    }
  }
}
