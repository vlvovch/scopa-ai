// OpenAI provider plumbing shared by both games: API-key availability and
// the model list (fetched once per key, cached). Game-specific bots live
// in src/games/<game>/ai/openai*.ts and import from here — never from
// each other (see claudeProvider.ts for why).

import OpenAI from 'openai';
import { registerApiKeyCacheClearer } from './apiKeyCaches';
import { getOpenAIApiKey, isOpenAIKeyValid } from '../hooks/useSettings';

// Model info returned from API
export interface OpenAIModelInfo {
  id: string;
  displayName: string;
}

// Cached models list
let cachedModels: OpenAIModelInfo[] | null = null;
let modelsFetchPromise: Promise<OpenAIModelInfo[]> | null = null;

/**
 * Fetch available OpenAI models from the API
 * Results are cached after first successful fetch
 */
export async function fetchOpenAIModels(): Promise<OpenAIModelInfo[]> {
  // Return cached models if available
  if (cachedModels !== null) {
    return cachedModels;
  }

  // Return existing promise if fetch is in progress
  if (modelsFetchPromise !== null) {
    return modelsFetchPromise;
  }

  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    return [];
  }

  modelsFetchPromise = (async () => {
    try {
      const client = new OpenAI({
        apiKey,
        dangerouslyAllowBrowser: true
      });

      const models: OpenAIModelInfo[] = [];

      // Allowlist pattern for chat models
      // Only matches base models without date suffixes to avoid duplicates
      // e.g., gpt-4o, gpt-4o-mini, gpt-4.1, gpt-4.1-mini, gpt-4.1-nano, o3, o4-mini, etc.
      const ALLOWED_PATTERNS = [
        /^gpt-4o(-mini)?$/,                              // gpt-4o, gpt-4o-mini (no date suffixes)
        /^gpt-4\.1(-mini|-nano)?$/,                      // gpt-4.1, gpt-4.1-mini, gpt-4.1-nano
        /^gpt-4-turbo$/,                                 // gpt-4-turbo (no date suffixes)
        /^gpt-5(\.\d+)?(-[a-z]+)?$/,                     // gpt-5[-mini|-nano|-pro], gpt-5.1, gpt-5.6-sol/terra/luna, …
        /^o[134](-mini|-pro)?$/,                         // o1, o3, o4, o3-mini, o4-mini, o1-pro
      ];

      const isAllowedModel = (id: string): boolean => {
        return ALLOWED_PATTERNS.some(pattern => pattern.test(id));
      };

      const response = await client.models.list();

      for await (const model of response) {
        if (isAllowedModel(model.id)) {
          // Use raw model ID as display name for clarity
          models.push({
            id: model.id,
            displayName: model.id
          });
        }
      }

      // Sort: gpt-5 family (newest minor version first) > gpt-4.1 > gpt-4o
      // > o-series, then by variant (base > mini > nano)
      models.sort((a, b) => {
        const order = (id: string): number => {
          if (id.startsWith('gpt-5')) return 0;
          if (id.startsWith('gpt-4.1')) return 1;
          if (id.startsWith('gpt-4o')) return 2;
          if (id.startsWith('gpt-4-turbo')) return 3;
          if (id.startsWith('o')) return 4;
          return 5;
        };
        const minorOf = (id: string): number => {
          const m = id.match(/^gpt-5\.(\d+)/);
          return m ? parseInt(m[1], 10) : 0;
        };
        const variantOrder = (id: string): number => {
          if (id.includes('-nano')) return 2;
          if (id.includes('-mini')) return 1;
          if (id.includes('-pro')) return 3;
          return 0;
        };

        return (
          order(a.id) - order(b.id) ||
          minorOf(b.id) - minorOf(a.id) ||
          variantOrder(a.id) - variantOrder(b.id)
        );
      });

      cachedModels = models;
      return models;
    } catch (error) {
      console.error('Failed to fetch OpenAI models:', error);
      // Return fallback models on error (use raw IDs as display names)
      return [
        { id: 'gpt-5.6-luna', displayName: 'gpt-5.6-luna' },
        { id: 'gpt-5-mini', displayName: 'gpt-5-mini' },
        { id: 'gpt-5', displayName: 'gpt-5' },
        { id: 'gpt-4.1-mini', displayName: 'gpt-4.1-mini' },
        { id: 'gpt-4o-mini', displayName: 'gpt-4o-mini' },
      ];
    } finally {
      modelsFetchPromise = null;
    }
  })();

  return modelsFetchPromise;
}

/**
 * Get cached models synchronously (returns empty if not yet fetched)
 */
export function getCachedOpenAIModels(): OpenAIModelInfo[] {
  return cachedModels || [];
}

/**
 * Forget the cached model list (it was fetched with the previous key).
 * Registered with the API-key cache registry; the game bots' own
 * clearers also call it so direct callers see the old behaviour.
 */
export function clearOpenAIModelCache(): void {
  cachedModels = null;
}
registerApiKeyCacheClearer('openai', clearOpenAIModelCache);

/**
 * Check if OpenAI API key is available AND valid
 */
export function isOpenAIAvailable(): boolean {
  return !!getOpenAIApiKey() && isOpenAIKeyValid();
}

// Re-export for backwards compatibility
export { getOpenAIApiKey };
