// The on-device prompt: the short round memory (points held, the trump
// count, Aces and 3s still out, the opponent's exact hand once the deck is
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
  it('summarises points, the trump count and the high cards still out, as counts the small model can use', () => {
    const memory = buildRoundMemory(context());
    // you: Ace of Coins 11 + 2 of Cups 0; opponent: 3 of Swords 10 + King of Swords 4 + 5 of Cups 0
    expect(memory).toContain('Points captured: you 11, opponent 14 (61 wins the round)');
    // 10 trumps: the Ace played, the 3 in hand, 8 still out (the face-up King at the bottom among them)
    expect(memory).toContain('Trumps (Coins): 1 played, you hold 1, 8 still out');
    // aces/3s not in play, hand or face-up: Ace of Swords, 3 of Cups, 3 of Clubs
    expect(memory).toContain('Aces and 3s still out: 3');
    expect(memory).not.toContain('played so far');
    expect(memory.split('\n')).toHaveLength(4);
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
    expect(memory).toContain('Deck empty: the opponent holds King of Coins (4pt), 4 of Swords, 2 of Clubs');
    expect(memory).not.toContain('Aces and 3s still out');
  });

  it('is empty without the captured piles', () => {
    const bare = context({ myCaptured: undefined, oppCaptured: undefined });
    expect(buildRoundMemory(bare)).toBe('');
    expect(buildOnDeviceTurnPrompt(bare)).not.toContain('ROUND MEMORY');
    // only the spelled-out moves differ from the plain prompt
    expect(buildOnDeviceTurnPrompt(bare).split('Valid moves:')[0]).toBe(buildTurnPrompt(bare).split('Valid moves:')[0]);
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
    expect(prompt.length).toBeLessThan(1000);
  });

  it('spells the legal moves out when following: trump, trick outcome and the points that change hands', () => {
    // the opponent led the Ace of Cups (11): the 3 of Coins is a trump and wins, the others lose
    const prompt = buildOnDeviceTurnPrompt(context());
    expect(prompt).toContain('[0] Play 3 of Coins (10pt) (trump): wins the trick, takes 21 points');
    expect(prompt).toContain('[1] Play 5 of Swords: loses the trick, gives 11 points');
    expect(prompt).toContain('[2] Play Ace of Clubs (11pt): loses the trick, gives 22 points');
    expect(buildTurnPrompt(context())).toContain('[0] Play 3 of Coins (10pt)\n');
  });

  it('spells the legal moves out when leading: what each card puts at risk', () => {
    const prompt = buildOnDeviceTurnPrompt(context({ leadCard: null, opponentHandCount: 3 }));
    expect(prompt).toContain('[0] Play 3 of Coins (10pt) (trump): risky lead: its 10 points go to the opponent if they hold a higher trump');
    expect(prompt).toContain('[1] Play 5 of Swords: safe lead, nothing at risk');
    expect(prompt).toContain('[2] Play Ace of Clubs (11pt): risky lead: its 11 points go to the opponent if they trump');
  });

  it('the on-device instructions stay short, forbid guessing the hidden cards and ask for the reasoning before the move index', () => {
    expect(SYSTEM_INSTRUCTION_ON_DEVICE).toContain('ROUND MEMORY');
    expect(SYSTEM_INSTRUCTION_ON_DEVICE).toContain("You cannot see the opponent's cards or the deck");
    expect(SYSTEM_INSTRUCTION_ON_DEVICE.split(/\s+/).length).toBeLessThan(300);
    expect(SYSTEM_INSTRUCTION_ON_DEVICE.indexOf('reasoning')).toBeLessThan(SYSTEM_INSTRUCTION_ON_DEVICE.indexOf('moveIndex'));
  });
});
