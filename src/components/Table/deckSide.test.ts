import { describe, expect, it } from 'vitest';
import { deckSide, tightLeftColumnQuery } from './deckSide';

describe('deckSide', () => {
  it('follows the dealer where the left column has room', () => {
    expect(deckSide(false, false)).toBe('left');
    expect(deckSide(true, false)).toBe('right');
  });

  it('is the right side wherever the left column is tight', () => {
    expect(deckSide(false, true)).toBe('right');
    expect(deckSide(true, true)).toBe('right');
  });
});

describe('tightLeftColumnQuery', () => {
  it('raises the window height limit with the text size', () => {
    expect(tightLeftColumnQuery(1.0)).toBe('(orientation: landscape) and (max-height: 630px)');
    expect(tightLeftColumnQuery(1.2)).toBe('(orientation: landscape) and (max-height: 696px)');
    expect(tightLeftColumnQuery(1.6)).toBe('(orientation: landscape) and (max-height: 828px)');
  });

  it('takes every landscape window up to that height: the phone landscape layout is left out by its own query', () => {
    expect(tightLeftColumnQuery(1.2)).not.toContain('min-');
    expect(tightLeftColumnQuery(1.2)).not.toContain(',');
  });
});
