// Anthropic (Claude) provider plumbing shared by both games: API-key
// availability, the model list (fetched once per key, cached), and the
// per-model thinking-mode gating. Game-specific bots (prompts, request
// bodies, fallbacks) live in src/games/<game>/ai/claude*.ts and import
// from here.
//
// Why this is a separate module: each build ships the other game as a
// lazily loaded chunk, and Rollup assigns a module to the MAIN chunk as
// soon as the main chunk reaches it statically. When Briscola's bot
// imported these helpers from Scopa's bot module, the Briscola build's
// main chunk dragged in Scopa's whole bot (prompts, rules, heuristic
// fallback) although only the lazy ScopaApp used it. Game bot modules
// must therefore never import each other — only this shared layer.

import Anthropic from '@anthropic-ai/sdk';
import { registerApiKeyCacheClearer } from './apiKeyCaches';
import { getClaudeApiKey, isClaudeKeyValid } from '../hooks/useSettings';

/**
 * Check if a model uses adaptive thinking. Everything from the 4.6
 * generation onward — Opus 4.6/4.7/4.8, Sonnet 4.6, and the 5-family
 * (Opus 5, Sonnet 5, Fable 5) — REJECTS the legacy `thinking.type ===
 * 'enabled'` + `budget_tokens` shape with a 400 and takes
 * `thinking: {type: 'adaptive'}` plus `output_config.effort` instead.
 * Only the older generations (Sonnet 4.5, Haiku 4.5, Opus 4.5/4.1/4.0,
 * 3.x) still use budget_tokens, so unknown and future models default to
 * adaptive — that keeps next year's models working without a code change.
 */
export function isAdaptiveThinkingModel(model: string): boolean {
  if (model.includes('claude-3')) return false; // 3.x family: legacy shape
  const m = model.match(/claude-(?:opus|sonnet|haiku)-(\d+)(?:-(\d+))?/);
  if (!m) return true; // unrecognized family (fable, future names): adaptive
  const major = parseInt(m[1], 10);
  // A trailing 8-digit group is a date suffix, not a minor version
  // (e.g. claude-opus-4-20250514 is Opus 4.0).
  const minor = m[2] && m[2].length <= 2 ? parseInt(m[2], 10) : 0;
  if (major >= 5) return true;
  return major === 4 && minor >= 6;
}

/**
 * The 5-family (Sonnet 5, Opus 5, Fable 5) has thinking ON BY DEFAULT:
 * omitting the `thinking` param still runs adaptive thinking. "Thinking
 * off" there means adaptive at effort 'low' (explicit disabled has
 * documented failure modes on Opus 5 and is rejected by Fable 5). On
 * 4.6–4.8, omitting the param genuinely disables thinking.
 */
export function isAlwaysThinkingModel(model: string): boolean {
  if (model.includes('fable')) return true;
  const m = model.match(/claude-(?:opus|sonnet|haiku)-(\d+)/);
  return m !== null && parseInt(m[1], 10) >= 5;
}

// Model info returned from API
export interface ClaudeModelInfo {
  id: string;
  displayName: string;
}

// Cached models list
let cachedModels: ClaudeModelInfo[] | null = null;
let modelsFetchPromise: Promise<ClaudeModelInfo[]> | null = null;

/**
 * Fetch available Claude models from the API
 * Results are cached after first successful fetch
 */
export async function fetchClaudeModels(): Promise<ClaudeModelInfo[]> {
  // Return cached models if available
  if (cachedModels !== null) {
    return cachedModels;
  }

  // Return existing promise if fetch is in progress
  if (modelsFetchPromise !== null) {
    return modelsFetchPromise;
  }

  const apiKey = getClaudeApiKey();
  if (!apiKey) {
    return [];
  }

  modelsFetchPromise = (async () => {
    try {
      const client = new Anthropic({
        apiKey,
        dangerouslyAllowBrowser: true
      });

      const models: ClaudeModelInfo[] = [];

      // Fetch models from API (beta endpoint)
      const response = await client.beta.models.list({ limit: 100 });

      for (const model of response.data) {
        // Only include Claude chat models
        if (model.id.startsWith('claude-')) {
          models.push({
            id: model.id,
            displayName: model.display_name || model.id
          });
        }
      }

      // Sort newest version first, then by capability tier within a
      // version (fable > opus > sonnet > haiku). Parsed from the id so
      // future models sort correctly without a code change.
      const versionOf = (id: string): number => {
        // "claude-opus-4-8" / "claude-sonnet-4-5-20250929" → major.minor;
        // "claude-sonnet-5" → major only. A trailing 8-digit group is a
        // date suffix, never a minor version.
        let m = id.match(/-(\d+)-(\d{1,2})(?:-\d{8})?$/);
        if (m) return parseInt(m[1], 10) + parseInt(m[2], 10) / 100;
        m = id.match(/-(\d+)$/);
        return m ? parseInt(m[1], 10) : 0;
      };
      const familyOf = (id: string): number => {
        if (id.includes('fable')) return 3;
        if (id.includes('opus')) return 2;
        if (id.includes('sonnet')) return 1;
        if (id.includes('haiku')) return 0;
        return -1;
      };
      models.sort(
        (a, b) => versionOf(b.id) - versionOf(a.id) || familyOf(b.id) - familyOf(a.id)
      );

      cachedModels = models;
      return models;
    } catch (error) {
      console.error('Failed to fetch Claude models:', error);
      // Return fallback models on error
      return [
        { id: 'claude-opus-5', displayName: 'Claude Opus 5' },
        { id: 'claude-sonnet-5', displayName: 'Claude Sonnet 5' },
        { id: 'claude-opus-4-8', displayName: 'Claude Opus 4.8' },
        { id: 'claude-haiku-4-5', displayName: 'Claude Haiku 4.5' },
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
export function getCachedClaudeModels(): ClaudeModelInfo[] {
  return cachedModels || [];
}

/**
 * Forget the cached model list (it was fetched with the previous key).
 * Registered with the API-key cache registry so the Settings modal
 * triggers it on a key change in either game; the game bots' own
 * clearers also call it so direct callers see the old behaviour.
 */
export function clearClaudeModelCache(): void {
  cachedModels = null;
}
registerApiKeyCacheClearer('claude', clearClaudeModelCache);

/**
 * Check if Claude API key is available AND valid
 */
export function isClaudeAvailable(): boolean {
  return !!getClaudeApiKey() && isClaudeKeyValid();
}

// Re-export for backwards compatibility
export { getClaudeApiKey };
