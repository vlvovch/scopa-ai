import { describe, it, expect } from 'vitest';
import { estimateCostUsd, formatCostUsd } from './pricing';
import type { GeminiTokenStats } from './tokenStats';

const stats = (overrides: Partial<GeminiTokenStats>): GeminiTokenStats => ({
  promptTokens: 0,
  responseTokens: 0,
  thoughtTokens: 0,
  totalTokens: 0,
  cachedTokens: 0,
  requestCount: 1,
  roundPromptTokens: 0,
  roundResponseTokens: 0,
  roundThoughtTokens: 0,
  roundTotalTokens: 0,
  roundRequestCount: 1,
  modelId: '',
  modelDisplayName: '',
  totalTimeMs: 0,
  lastTurnTimeMs: 0,
  minTurnTimeMs: 0,
  maxTurnTimeMs: 0,
  roundTotalTimeMs: 0,
  ...overrides,
});

describe('estimateCostUsd', () => {
  it('prices Claude with cache reads (0.1x) and writes (1.25x) on top of uncached input', () => {
    // Sonnet 5: $2 in / $10 out per 1M
    const cost = estimateCostUsd(
      stats({
        modelId: 'claude-sonnet-5',
        promptTokens: 10_000, // excludes cache traffic (Anthropic semantics)
        cachedTokens: 50_000,
        cacheCreationTokens: 2_000,
        responseTokens: 3_000,
      })
    );
    // 10k*2 + 50k*0.2 + 2k*2.5 + 3k*10 = 65_000 micro-dollars
    expect(cost).toBeCloseTo(0.065, 6);
  });

  it('prices Gemini with cached tokens inside promptTokens (0.25x) and thoughts as output', () => {
    // 3.5-flash: $1.5 in / $9 out per 1M
    const cost = estimateCostUsd(
      stats({
        modelId: 'gemini-3.5-flash',
        promptTokens: 20_000, // includes 8k cached
        cachedTokens: 8_000,
        responseTokens: 1_000,
        thoughtTokens: 2_000,
      })
    );
    // (12k*1.5 + 8k*0.375) + 3k*9 = 48_000 micro-dollars
    expect(cost).toBeCloseTo(0.048, 6);
  });

  it('prices OpenAI with cached tokens inside promptTokens (0.1x), reasoning inside output', () => {
    // gpt-5-mini: $0.25 in / $2 out per 1M
    const cost = estimateCostUsd(
      stats({
        modelId: 'gpt-5-mini',
        promptTokens: 10_000, // includes 4k cached
        cachedTokens: 4_000,
        responseTokens: 2_000,
        thoughtTokens: 500, // reasoning is already inside responseTokens — must not double-bill
      })
    );
    // (6k*0.25 + 4k*0.025) + 2k*2 = 5_600 micro-dollars
    expect(cost).toBeCloseTo(0.0056, 6);
  });

  it('matches the longest prefix (gpt-5.6-luna is not billed as gpt-5)', () => {
    const luna = estimateCostUsd(
      stats({ modelId: 'gpt-5.6-luna', promptTokens: 1_000_000 })
    );
    expect(luna).toBeCloseTo(0.2, 6);
  });

  it('strips Claude date suffixes before matching', () => {
    const cost = estimateCostUsd(
      stats({ modelId: 'claude-sonnet-4-5-20250929', promptTokens: 1_000_000 })
    );
    expect(cost).toBeCloseTo(3, 6);
  });

  it('returns null for unknown models (incl. the free tier, hidden in the UI)', () => {
    expect(estimateCostUsd(stats({ modelId: 'gemini-3-flash-preview' }))).toBeNull();
    expect(estimateCostUsd(stats({ modelId: '' }))).toBeNull();
  });
});

describe('formatCostUsd', () => {
  it('scales decimals with magnitude', () => {
    expect(formatCostUsd(1.5)).toBe('$1.50');
    expect(formatCostUsd(0.065)).toBe('$0.065');
    expect(formatCostUsd(0.0056)).toBe('$0.0056');
  });
});
