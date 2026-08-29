// Small helper that bundles the token + timing bookkeeping each LLM bot
// needs. Shared between Scopa and Briscola; renders uniformly through
// the shared TokenStatsDisplay component.

import type { GeminiTokenStats, GeminiTokenDelta } from './tokenStats';

export class TokenTracker {
  public stats: GeminiTokenStats;
  public lastDelta: GeminiTokenDelta = {
    promptTokens: 0,
    responseTokens: 0,
    thoughtTokens: 0,
    totalTokens: 0,
    turnTimeMs: 0,
  };

  constructor(modelId: string, modelDisplayName: string) {
    this.stats = {
      promptTokens: 0,
      responseTokens: 0,
      thoughtTokens: 0,
      totalTokens: 0,
      cachedTokens: 0,
      requestCount: 0,
      roundPromptTokens: 0,
      roundResponseTokens: 0,
      roundThoughtTokens: 0,
      roundTotalTokens: 0,
      roundRequestCount: 0,
      modelId,
      modelDisplayName,
      totalTimeMs: 0,
      lastTurnTimeMs: 0,
      minTurnTimeMs: 0,
      maxTurnTimeMs: 0,
      roundTotalTimeMs: 0,
    };
  }

  recordTokens(usage: {
    promptTokens?: number;
    responseTokens?: number;
    thoughtTokens?: number;
    totalTokens?: number;
    cachedTokens?: number;
    cacheCreationTokens?: number;
  }): void {
    const p = usage.promptTokens ?? 0;
    const r = usage.responseTokens ?? 0;
    const t = usage.thoughtTokens ?? 0;
    const total = usage.totalTokens ?? p + r + t;
    this.stats.promptTokens += p;
    this.stats.responseTokens += r;
    this.stats.thoughtTokens += t;
    this.stats.totalTokens += total;
    this.stats.cachedTokens += usage.cachedTokens ?? 0;
    this.stats.cacheCreationTokens =
      (this.stats.cacheCreationTokens ?? 0) + (usage.cacheCreationTokens ?? 0);
    this.stats.requestCount += 1;
    this.stats.roundPromptTokens += p;
    this.stats.roundResponseTokens += r;
    this.stats.roundThoughtTokens += t;
    this.stats.roundTotalTokens += total;
    this.stats.roundRequestCount += 1;
    this.lastDelta = {
      promptTokens: p,
      responseTokens: r,
      thoughtTokens: t,
      totalTokens: total,
      cachedTokens: usage.cachedTokens ?? 0,
      cacheCreationTokens: usage.cacheCreationTokens ?? 0,
      turnTimeMs: 0,
    };
  }

  recordTiming(turnTimeMs: number): void {
    this.stats.lastTurnTimeMs = turnTimeMs;
    this.stats.totalTimeMs += turnTimeMs;
    this.stats.roundTotalTimeMs += turnTimeMs;
    if (
      this.stats.minTurnTimeMs === 0 ||
      turnTimeMs < this.stats.minTurnTimeMs
    ) {
      this.stats.minTurnTimeMs = turnTimeMs;
    }
    if (turnTimeMs > this.stats.maxTurnTimeMs) {
      this.stats.maxTurnTimeMs = turnTimeMs;
    }
    this.lastDelta.turnTimeMs = turnTimeMs;
  }

  resetRound(): void {
    this.stats.roundPromptTokens = 0;
    this.stats.roundResponseTokens = 0;
    this.stats.roundThoughtTokens = 0;
    this.stats.roundTotalTokens = 0;
    this.stats.roundRequestCount = 0;
    this.stats.roundTotalTimeMs = 0;
  }
}
