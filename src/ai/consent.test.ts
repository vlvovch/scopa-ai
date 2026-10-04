// The AI data notice: which seats need it, where their games go, and the
// remembered answer behind the storage seam.
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { storage } from '../platform/storage';

// The tests run in Node: give the web storage a localStorage to write to.
const fake = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => fake.get(key) ?? null,
  setItem: (key: string, value: string) => { fake.set(key, value); },
  removeItem: (key: string) => { fake.delete(key); },
});
afterAll(() => vi.unstubAllGlobals());
import {
  AI_DATA_CONSENT_KEY,
  aiDataDestination,
  aiDataDestinations,
  aiDataConsentDate,
  grantAIDataConsent,
  hasAIDataConsent,
  revokeAIDataConsent,
} from './consent';

describe('aiDataDestination', () => {
  it('sends the free AI through the proxy and every own-key provider straight to it', () => {
    expect(aiDataDestination('gemini-free')).toBe('free');
    for (const seat of ['gemini', 'gemini-singleturn', 'openai', 'openai-singleturn', 'claude', 'claude-singleturn', 'openrouter', 'openrouter-singleturn']) {
      expect(aiDataDestination(seat)).toBe('key');
    }
  });
  it('needs nothing for the CPU bots, the on-device model or a human', () => {
    for (const seat of ['random', 'heuristic', 'expert', 'apple', 'multiplayer', '']) {
      expect(aiDataDestination(seat)).toBeNull();
    }
  });
  it('lists the distinct destinations of a set of seats, free first', () => {
    expect(aiDataDestinations(['expert', 'heuristic'])).toEqual([]);
    expect(aiDataDestinations(['openai', 'gemini-free'])).toEqual(['free', 'key']);
    expect(aiDataDestinations(['claude', 'openrouter-singleturn'])).toEqual(['key']);
    expect(aiDataDestinations(['apple', 'gemini-free'])).toEqual(['free']);
  });
});

describe('the remembered answer', () => {
  beforeEach(() => storage.remove(AI_DATA_CONSENT_KEY));

  it('is absent until granted, then carries the date, and can be revoked', () => {
    expect(hasAIDataConsent()).toBe(false);
    expect(aiDataConsentDate()).toBeNull();
    grantAIDataConsent(new Date('2026-09-15T20:00:00Z'));
    expect(hasAIDataConsent()).toBe(true);
    expect(aiDataConsentDate()?.toISOString()).toBe('2026-09-15T20:00:00.000Z');
    expect(storage.get(AI_DATA_CONSENT_KEY)).toBe('2026-09-15T20:00:00.000Z');
    revokeAIDataConsent();
    expect(hasAIDataConsent()).toBe(false);
  });

  it('treats an unreadable stored value as granted at an unknown date', () => {
    storage.set(AI_DATA_CONSENT_KEY, 'yes');
    expect(hasAIDataConsent()).toBe(true);
    expect(aiDataConsentDate()?.getTime()).toBe(0);
  });
});
