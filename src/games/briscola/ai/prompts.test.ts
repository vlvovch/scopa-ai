// The on-device prompt: the round memory (points held, trumps and high
// cards played or still out, the opponent's exact hand once the deck is
// empty) computed from the cards seen, placed before the current trick.
import { describe, it, expect } from 'vitest';
import { createDeck } from '../deck';
import type { Card, Move } from '../types';
import type { LLMAIContext } from './types';
import { buildRoundMemory, buildOnDeviceTurnPrompt, buildTurnPrompt, SYSTEM_INSTRUCTION_ON_DEVICE } from './prompts';

const deck = createDeck();
const card = (id: string): Card => deck.find((c) => c.id === id)!;
const cards = (...ids: string[]): Card[] => ids.map(card);

function context(overrides: Partial<LLMAIContext> = {}): LLMAIContext {
  const hand = cards('coins-3', 'swords-5', 'clubs-1');
  const validMoves: Move[] = hand.map((c) => ({ player: 'cpu', cardPlayed: c }));
  return {
    hand, player: 'cpu', validMoves,
    trump: card('coins-10'), trumpSuit: 'coins', leadCard: card('cups-1'), deckCount: 10,
    scores: { self: 0, opponent: 0 }, targetScore: 1, roundNumber: 1, opponentHandCount: 3,
    lastOpponentMove: null, lastSelfMove: null,
    myCaptured: cards('coins-1', 'cups-2'),
    oppCaptured: cards('swords-3', 'swords-10', 'cups-5'),
    ...overrides,
  };
}

describe('buildRoundMemory (Briscola)', () => {
  it('summarises points, trumps and high cards played or still out', () => {
    const memory = buildRoundMemory(context());
    // you: Ace of Coins 11 + 2 of Cups 0; opponent: 3 of Swords 10 + King of Swords 4 + 5 of Cups 0
    expect(memory).toContain('Points captured: you 11, opponent 14 (95 still to be decided; 61 wins the round)');
    expect(memory).toContain('Trumps (Coins) played so far: Ace (1 of 10); you hold 1');
    // played: Ace of Coins (mine), 3 of Swords (theirs), Ace of Cups (led)
    expect(memory).toContain('Aces and 3s played so far: Ace of Coins (11pt), Ace of Cups (11pt), 3 of Swords (10pt)');
    // 10 trumps: 1 played, 1 in hand, the face-up King at the bottom, 7 still out
    expect(memory).toContain('Trumps not seen yet (in the deck or the opponent\'s hand): 7, plus the face-up King of Coins (4pt) at the bottom of the deck');
    // aces/3s not in play, hand or face-up: Ace of Swords, 3 of Cups, 3 of Clubs
    expect(memory).toContain('Aces and 3s not seen yet: Ace of Swords (11pt), 3 of Cups (10pt), 3 of Clubs (10pt)');
  });

  it('names the opponent\'s exact hand once the deck is empty', () => {
    const hand = cards('coins-3');
    const mine = deck.filter((c) => !['coins-3', 'cups-1', 'clubs-2', 'swords-4', 'coins-10'].includes(c.id)).slice(0, 18);
    const theirs = deck.filter((c) => !['coins-3', 'cups-1', 'clubs-2', 'swords-4', 'coins-10'].includes(c.id)).slice(18);
    const memory = buildRoundMemory(context({
      hand, validMoves: [{ player: 'cpu', cardPlayed: hand[0] }],
      leadCard: card('cups-1'), deckCount: 0, myCaptured: mine, oppCaptured: theirs,
    }));
    // known: 35 captured + lead + my card = 37; the trump King was drawn by someone, so it is among the 3 unseen
    expect(memory).toContain("Deck empty, so the opponent's hand is exactly: King of Coins (4pt), 4 of Swords, 2 of Clubs");
    expect(memory).not.toContain('not seen yet');
  });

  it('is empty without the captured piles', () => {
    const bare = context({ myCaptured: undefined, oppCaptured: undefined });
    expect(buildRoundMemory(bare)).toBe('');
    expect(buildOnDeviceTurnPrompt(bare)).toBe(buildTurnPrompt(bare));
  });
});

describe('buildOnDeviceTurnPrompt (Briscola)', () => {
  it('places the memory after the last moves and before the current trick, leaving the plain prompt unchanged', () => {
    const ctx = context();
    const prompt = buildOnDeviceTurnPrompt(ctx);
    const memoryAt = prompt.indexOf('--- ROUND MEMORY');
    expect(memoryAt).toBeGreaterThan(prompt.indexOf("Opponent's last move"));
    expect(memoryAt).toBeLessThan(prompt.indexOf('Opponent led:'));
    expect(prompt.endsWith('Choose the best move (0-2).')).toBe(true);
    expect(buildTurnPrompt(ctx)).not.toContain('ROUND MEMORY');
    expect(prompt.length).toBeLessThan(1500);
  });

  it('the on-device instructions ask for the reasoning before the move index', () => {
    expect(SYSTEM_INSTRUCTION_ON_DEVICE).toContain('ROUND MEMORY');
    expect(SYSTEM_INSTRUCTION_ON_DEVICE.indexOf('reasoning')).toBeLessThan(SYSTEM_INSTRUCTION_ON_DEVICE.indexOf('moveIndex'));
  });
});
