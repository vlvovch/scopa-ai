// Estimated API cost from tracked token usage. This is a client-side
// ESTIMATE from public list prices — the providers expose real billed
// spend only through org-admin APIs that BYOK user keys can't reach.
//
// Semantics differ per provider and are encoded in estimateCostUsd():
// - Anthropic: usage.input_tokens EXCLUDES cache reads and writes;
//   reads bill at 0.1x input, writes at 1.25x. Thinking tokens are
//   already inside output_tokens.
// - OpenAI: input_tokens INCLUDES cached tokens (billed at 0.1x);
//   reasoning tokens are already inside output_tokens.
// - Gemini: promptTokenCount INCLUDES cached tokens (implicit caching,
//   billed at 0.25x); thought tokens are separate and bill as output.
//
// Prices are per 1M tokens in USD (input, output), list prices as of
// 2026-08. Unknown models return null and the UI hides the cost row —
// notably the free-tier 'gemini-3-flash-preview' is intentionally
// absent (the player pays nothing). Matching is longest-prefix on the
// date-stripped model id, so dated Claude ids resolve to their family.

import type { GeminiTokenStats } from './tokenStats';

interface Price {
  in: number;
  out: number;
}

const PRICES: Record<string, Price> = {
  // Anthropic
  'claude-fable-5': { in: 10, out: 50 },
  'claude-opus-5': { in: 5, out: 25 },
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-opus-4-7': { in: 5, out: 25 },
  'claude-opus-4-6': { in: 5, out: 25 },
  'claude-opus-4-5': { in: 5, out: 25 },
  'claude-opus-4-1': { in: 15, out: 75 },
  'claude-opus-4': { in: 15, out: 75 },
  'claude-sonnet-5': { in: 2, out: 10 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-sonnet-4-5': { in: 3, out: 15 },
  'claude-sonnet-4': { in: 3, out: 15 },
  'claude-3-7-sonnet': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 },
  'claude-3-5-haiku': { in: 0.8, out: 4 },
  // OpenAI
  'gpt-5.6-sol': { in: 5, out: 30 },
  'gpt-5.6-terra': { in: 2, out: 12 },
  'gpt-5.6-luna': { in: 0.2, out: 1.2 },
  'gpt-5.5': { in: 5, out: 30 },
  'gpt-5.4-mini': { in: 0.75, out: 4.5 },
  'gpt-5.4-nano': { in: 0.2, out: 1.25 },
  'gpt-5.4': { in: 2.5, out: 15 },
  'gpt-5.1': { in: 1.25, out: 10 },
  'gpt-5-mini': { in: 0.25, out: 2 },
  'gpt-5-nano': { in: 0.05, out: 0.4 },
  'gpt-5': { in: 1.25, out: 10 },
  'gpt-4.1-mini': { in: 0.4, out: 1.6 },
  'gpt-4.1-nano': { in: 0.1, out: 0.4 },
  'gpt-4.1': { in: 2, out: 8 },
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
  'gpt-4o': { in: 2.5, out: 10 },
  'o3-mini': { in: 1.1, out: 4.4 },
  'o3': { in: 2, out: 8 },
  'o4-mini': { in: 1.1, out: 4.4 },
  // Gemini
  'gemini-3.7-flash': { in: 0.75, out: 3.75 },
  'gemini-3.6-flash': { in: 1.5, out: 7.5 },
  'gemini-3.5-flash': { in: 1.5, out: 9 },
  'gemini-2.5-flash-lite': { in: 0.1, out: 0.4 },
  'gemini-2.5-flash': { in: 0.3, out: 2.5 },
  'gemini-2.5-pro': { in: 1.25, out: 10 },
  'gemini-2.0-flash': { in: 0.1, out: 0.4 },
};

// Longest keys first so 'gpt-5.6-sol' wins over 'gpt-5', etc.
const PRICE_KEYS = Object.keys(PRICES).sort((a, b) => b.length - a.length);

function priceFor(modelId: string): Price | null {
  const id = modelId.toLowerCase().replace(/-\d{8}$/, '');
  const key = PRICE_KEYS.find((k) => id.startsWith(k));
  return key ? PRICES[key] : null;
}

/**
 * Estimated cost in USD for the tracked usage, or null when the model's
 * price is unknown (the UI hides the row then).
 */
export function estimateCostUsd(stats: GeminiTokenStats): number | null {
  const price = priceFor(stats.modelId);
  if (!price) return null;

  const M = 1_000_000;
  const cached = stats.cachedTokens ?? 0;
  const cacheWrites = stats.cacheCreationTokens ?? 0;
  const id = stats.modelId.toLowerCase();

  let inputCost: number;
  let outputTokens: number;
  if (id.startsWith('claude')) {
    // prompt excludes cache traffic; thinking is inside responseTokens
    inputCost =
      (stats.promptTokens * price.in +
        cached * price.in * 0.1 +
        cacheWrites * price.in * 1.25) / M;
    outputTokens = stats.responseTokens;
  } else if (id.startsWith('gemini')) {
    // prompt includes cached; thoughts bill as output on top of candidates
    inputCost =
      ((stats.promptTokens - cached) * price.in + cached * price.in * 0.25) / M;
    outputTokens = stats.responseTokens + stats.thoughtTokens;
  } else {
    // OpenAI: prompt includes cached; reasoning is inside responseTokens
    inputCost =
      ((stats.promptTokens - cached) * price.in + cached * price.in * 0.1) / M;
    outputTokens = stats.responseTokens;
  }

  return inputCost + (outputTokens * price.out) / M;
}

/** Format an estimated cost for display, e.g. "$0.0042". */
export function formatCostUsd(cost: number): string {
  if (cost >= 1) return `$${cost.toFixed(2)}`;
  if (cost >= 0.01) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(4)}`;
}
