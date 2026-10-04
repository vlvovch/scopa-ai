// Google (Gemini) provider plumbing shared by both games: API-key
// availability and the model list (fetched once per key, cached).
// Game-specific bots live in src/games/<game>/ai/gemini*.ts and import
// from here — never from each other (see claudeProvider.ts for why).

import { GoogleGenAI } from '@google/genai';
import { registerApiKeyCacheClearer } from './apiKeyCaches';
import { getGeminiApiKey, isGeminiKeyValid } from '../hooks/useSettings';

// Model info returned from API
export interface GeminiModelInfo {
  id: string;
  displayName: string;
}

// Cached models list
let cachedModels: GeminiModelInfo[] | null = null;
let modelsFetchPromise: Promise<GeminiModelInfo[]> | null = null;

/**
 * Fetch available Gemini models from the API
 * Results are cached after first successful fetch
 */
export async function fetchGeminiModels(): Promise<GeminiModelInfo[]> {
  // Return cached models if available
  if (cachedModels !== null) {
    return cachedModels;
  }

  // Return existing promise if fetch is in progress
  if (modelsFetchPromise !== null) {
    return modelsFetchPromise;
  }

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return [];
  }

  modelsFetchPromise = (async () => {
    try {
      const ai = new GoogleGenAI({ apiKey });
      let models: GeminiModelInfo[] = [];

      // Strict allowlist pattern for clean model names only
      // Format: gemini-X[.X]-{flash|flash-lite|pro}[-thinking][-preview]
      const ALLOWED_PATTERN = /^gemini-\d+(\.\d+)?-(flash-lite|flash|pro)(-thinking)?(-preview)?$/;

      // Also allow "latest" aliases
      const ALLOWED_LATEST = ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-pro-latest'];

      const isAllowedModel = (id: string): boolean => {
        return ALLOWED_PATTERN.test(id) || ALLOWED_LATEST.includes(id);
      };

      // Get base model name (without -preview suffix)
      const getBaseModel = (id: string): string => {
        return id.replace(/-preview$/, '');
      };

      for await (const model of await ai.models.list()) {
        // Only include models that support generateContent
        if (model.supportedActions?.includes('generateContent')) {
          // Extract model ID from full name (e.g., "models/gemini-2.5-flash" -> "gemini-2.5-flash")
          const id = model.name?.replace('models/', '') || '';

          if (id && isAllowedModel(id)) {
            // Use raw model ID as display name for clarity
            models.push({ id, displayName: id });
          }
        }
      }

      // Filter out preview models if non-preview version exists
      const nonPreviewIds = new Set(
        models.filter(m => !m.id.endsWith('-preview')).map(m => m.id)
      );
      models = models.filter(m => {
        if (!m.id.endsWith('-preview')) return true;
        // Keep preview only if non-preview doesn't exist
        const baseId = getBaseModel(m.id);
        return !nonPreviewIds.has(baseId);
      });

      // Sort by version (descending) then by type (flash before pro)
      models.sort((a, b) => {
        // Extract version numbers for comparison (handles both X.X and X formats)
        const versionA = a.id.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] || '0';
        const versionB = b.id.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] || '0';

        // Sort by version descending
        if (versionA !== versionB) {
          return versionB.localeCompare(versionA, undefined, { numeric: true });
        }

        // Within same version: flash < flash-lite < pro
        const typeOrder = (id: string) => {
          if (id.includes('-flash-lite')) return 1;
          if (id.includes('-flash')) return 0;
          if (id.includes('-pro')) return 2;
          return 3;
        };
        return typeOrder(a.id) - typeOrder(b.id);
      });

      cachedModels = models;
      return models;
    } catch (error) {
      console.error('Failed to fetch Gemini models:', error);
      // Return fallback models on error (use raw IDs as display names)
      return [
        { id: 'gemini-3.8-flash', displayName: 'gemini-3.8-flash' },
        { id: 'gemini-3.7-flash', displayName: 'gemini-3.7-flash' },
        { id: 'gemini-3.5-flash', displayName: 'gemini-3.5-flash' },
        { id: 'gemini-3.1-flash-lite', displayName: 'gemini-3.1-flash-lite' },
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
export function getCachedGeminiModels(): GeminiModelInfo[] {
  return cachedModels || [];
}

/**
 * Forget the cached model list (it was fetched with the previous key).
 * Registered with the API-key cache registry; the game bots' own
 * clearers also call it so direct callers see the old behaviour.
 */
export function clearGeminiModelCache(): void {
  cachedModels = null;
}
registerApiKeyCacheClearer('gemini', clearGeminiModelCache);

/**
 * Check if Gemini API key is available AND valid
 */
export function isGeminiAvailable(): boolean {
  return !!getGeminiApiKey() && isGeminiKeyValid();
}

// Re-export for backwards compatibility
export { getGeminiApiKey };
