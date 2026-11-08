import { describe, it, expect } from 'vitest';
import { gameOutcome } from './useStats';

// A record stores both scores plus `playerWon`, which is false for a tie as
// well; the summaries derive the three-way outcome from the scores (issue #2).
describe('gameOutcome', () => {
  it('is a win when the player scored more', () => {
    expect(gameOutcome({ playerScore: 11, opponentScore: 7 })).toBe('win');
  });

  it('is a loss when the opponent scored more', () => {
    expect(gameOutcome({ playerScore: 9, opponentScore: 12 })).toBe('loss');
  });

  it('is a tie with equal scores, not a loss', () => {
    expect(gameOutcome({ playerScore: 11, opponentScore: 11 })).toBe('tie');
  });
});
