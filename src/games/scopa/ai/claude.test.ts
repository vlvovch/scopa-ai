// Tests for the thinking-mode gating. This function decides between the
// modern `thinking: {type: 'adaptive'}` shape and the legacy
// `budget_tokens` shape — getting it wrong is a hard 400 from the API
// (the pre-2026-08 version only matched opus-4-6+, so Sonnet 4.6/5 and
// Opus 5 errored whenever thinking was enabled).

import { describe, it, expect, vi } from 'vitest';
import { isAdaptiveThinkingModel } from './claude';

// claude.ts imports the SDK and the settings hook at module level;
// neither is exercised by the pure gating function.
vi.mock('@anthropic-ai/sdk', () => ({ default: class {} }));
vi.mock('../../../hooks/useSettings', () => ({
  getClaudeApiKey: () => null,
  isClaudeKeyValid: () => false,
}));

describe('isAdaptiveThinkingModel', () => {
  it('uses adaptive for the 4.6+ generation', () => {
    expect(isAdaptiveThinkingModel('claude-opus-4-6-20260205')).toBe(true);
    expect(isAdaptiveThinkingModel('claude-opus-4-7')).toBe(true);
    expect(isAdaptiveThinkingModel('claude-opus-4-8')).toBe(true);
    expect(isAdaptiveThinkingModel('claude-sonnet-4-6')).toBe(true);
  });

  it('uses adaptive for the 5-family (the pre-fix regression)', () => {
    expect(isAdaptiveThinkingModel('claude-opus-5')).toBe(true);
    expect(isAdaptiveThinkingModel('claude-sonnet-5')).toBe(true);
    expect(isAdaptiveThinkingModel('claude-fable-5')).toBe(true);
  });

  it('keeps legacy budget_tokens for pre-4.6 models', () => {
    expect(isAdaptiveThinkingModel('claude-sonnet-4-5-20250929')).toBe(false);
    expect(isAdaptiveThinkingModel('claude-haiku-4-5-20251001')).toBe(false);
    expect(isAdaptiveThinkingModel('claude-opus-4-5-20251101')).toBe(false);
    // Opus 4.0: the trailing group is a date, not a minor version
    expect(isAdaptiveThinkingModel('claude-opus-4-20250514')).toBe(false);
    expect(isAdaptiveThinkingModel('claude-opus-4-1-20250805')).toBe(false);
    expect(isAdaptiveThinkingModel('claude-3-5-sonnet-20241022')).toBe(false);
  });

  it('defaults unknown and future model names to adaptive', () => {
    expect(isAdaptiveThinkingModel('claude-sonnet-6')).toBe(true);
    expect(isAdaptiveThinkingModel('claude-somenewfamily-2')).toBe(true);
  });
});
