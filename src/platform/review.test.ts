// The rating prompt's timing: after a won game, once a few games are
// finished, and not again for months.
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { storage } from './storage';

// The tests run in Node: give the web storage a localStorage to write to.
const fake = new Map<string, string>();
let failWrites = false;
vi.stubGlobal('localStorage', {
  getItem: (key: string) => fake.get(key) ?? null,
  setItem: (key: string, value: string) => {
    if (failWrites) throw new Error('quota');
    fake.set(key, value);
  },
  removeItem: (key: string) => { fake.delete(key); },
});
afterAll(() => vi.unstubAllGlobals());
import {
  MIN_DAYS_BETWEEN_ASKS,
  MIN_FINISHED_GAMES,
  REVIEW_PROMPT_KEY,
  noteGameFinished,
  readReviewPromptState,
  recordFinishedGame,
  shouldAskForReview,
} from './review';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-01T12:00:00Z');

beforeEach(() => {
  fake.clear();
  failWrites = false;
});

describe('shouldAskForReview', () => {
  it('waits for a few finished games and for a win', () => {
    expect(shouldAskForReview({ finished: MIN_FINISHED_GAMES - 1, lastAsked: null }, true, NOW)).toBe(false);
    expect(shouldAskForReview({ finished: MIN_FINISHED_GAMES, lastAsked: null }, false, NOW)).toBe(false);
    expect(shouldAskForReview({ finished: MIN_FINISHED_GAMES, lastAsked: null }, true, NOW)).toBe(true);
  });

  it('does not ask again until months have passed', () => {
    const asked = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * DAY).toISOString();
    expect(shouldAskForReview({ finished: 40, lastAsked: asked(1) }, true, NOW)).toBe(false);
    expect(shouldAskForReview({ finished: 40, lastAsked: asked(MIN_DAYS_BETWEEN_ASKS - 1) }, true, NOW)).toBe(false);
    expect(shouldAskForReview({ finished: 40, lastAsked: asked(MIN_DAYS_BETWEEN_ASKS) }, true, NOW)).toBe(true);
  });
});

describe('recordFinishedGame', () => {
  it('counts every finished game and asks at the first win from the third game on', () => {
    expect(recordFinishedGame(true, NOW)).toBe(false);
    expect(recordFinishedGame(true, NOW)).toBe(false);
    expect(recordFinishedGame(false, NOW)).toBe(false);
    expect(readReviewPromptState()).toEqual({ finished: 3, lastAsked: null });
    expect(recordFinishedGame(true, NOW)).toBe(true);
    expect(readReviewPromptState()).toEqual({ finished: 4, lastAsked: NOW.toISOString() });
    expect(recordFinishedGame(true, new Date(NOW.getTime() + DAY))).toBe(false);
    expect(readReviewPromptState().finished).toBe(5);
  });

  it('starts from zero when the stored value is unreadable', () => {
    storage.set(REVIEW_PROMPT_KEY, '{not json');
    expect(readReviewPromptState()).toEqual({ finished: 0, lastAsked: null });
    storage.set(REVIEW_PROMPT_KEY, JSON.stringify({ finished: 'many', lastAsked: 'yesterday' }));
    expect(readReviewPromptState()).toEqual({ finished: 0, lastAsked: null });
  });

  it('never asks when the count cannot be saved', () => {
    storage.set(REVIEW_PROMPT_KEY, JSON.stringify({ finished: 10, lastAsked: null }));
    failWrites = true;
    expect(recordFinishedGame(true, NOW)).toBe(false);
  });
});

describe('noteGameFinished', () => {
  it('does nothing on the website: no count, no prompt', () => {
    noteGameFinished(true);
    expect(fake.has(REVIEW_PROMPT_KEY)).toBe(false);
  });
});
