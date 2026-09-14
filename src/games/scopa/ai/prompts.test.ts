// The on-device prompt: the round memory a good player keeps (Denari race,
// Sette Bello, primiera, scope, values still out) computed from the cards
// seen, placed before the position, and absent when nothing is known.
import { describe, it, expect } from 'vitest';
import { createDeck } from '../deck';
import { getValidMoves } from '../rules';
import type { Card, Move } from '../types';
import type { LLMAIContext } from './types';
import { buildRoundMemory, buildOnDeviceTurnPrompt, buildTurnPrompt, SYSTEM_INSTRUCTION_ON_DEVICE } from './prompts';

const deck = createDeck();
const cards = (...ids: string[]): Card[] => ids.map((id) => deck.find((c) => c.id === id)!);

function context(overrides: Partial<LLMAIContext> = {}): LLMAIContext {
  const hand = cards('coins-7', 'cups-3');
  const table = cards('coins-4', 'swords-2');
  const validMoves: Move[] = hand.flatMap((c) => getValidMoves(c, table, 'cpu'));
  return {
    hand, table, player: 'cpu', validMoves,
    scores: { self: 3, opponent: 5 }, targetScore: 11, roundNumber: 2,
    opponentHandCount: 3, selfCapturedCount: 5, opponentCapturedCount: 2, deckCount: 26,
    lastOpponentMove: null, lastSelfMove: null,
    selfCaptured: cards('coins-1', 'coins-2', 'cups-6', 'swords-5', 'clubs-3'),
    opponentCaptured: cards('coins-3', 'cups-7'),
    selfScopaCount: 1, opponentScopaCount: 0,
    ...overrides,
  };
}

describe('buildRoundMemory (Scopa)', () => {
  it('summarises Denari, the Sette Bello, both primiere, scope and the values still out', () => {
    const memory = buildRoundMemory(context());
    expect(memory).toContain('Denari captured: you 2, opponent 1 (7 still in play; 6 win the Denari point)');
    expect(memory).toContain('Sette Bello (7 of coins): in your hand');
    // you: coins Ace (16, beats the 2) + cups 6 (18) + swords 5 (15) + clubs 3 (13) = 62; opponent: coins 3 (13) + cups 7 (21) = 34, two suits missing
    expect(memory).toContain('Primiera: you 62 (coins 1, cups 6, swords 5, clubs 3) vs opponent 34 so far (coins 3, cups 7; missing swords, clubs)');
    expect(memory).toContain('Scope this round: you 1, opponent 0');
    // 11 cards seen (2 hand + 2 table + 5 + 2), 29 still out
    expect(memory).toContain("Not seen yet (in the deck or the opponent's hand): 29 cards, by value: 1×3, 2×2, 3×1, 4×3, 5×3, 6×3, 7×2, 8×4, 9×4, 10×4");
  });

  it('tracks where the Sette Bello is', () => {
    expect(buildRoundMemory(context({ hand: cards('cups-3'), selfCaptured: cards('coins-7') }))).toContain('Sette Bello (7 of coins): you have captured it');
    expect(buildRoundMemory(context({ hand: cards('cups-3'), opponentCaptured: cards('coins-7') }))).toContain('Sette Bello (7 of coins): the opponent has captured it');
    expect(buildRoundMemory(context({ hand: cards('cups-3'), table: cards('coins-7') }))).toContain('Sette Bello (7 of coins): on the table');
    expect(buildRoundMemory(context({ hand: cards('cups-3') }))).toContain("Sette Bello (7 of coins): not seen yet (in the deck or the opponent's hand)");
  });

  it('is empty without the captured piles, and so is the on-device prompt\'s memory', () => {
    const bare = context({ selfCaptured: undefined, opponentCaptured: undefined });
    expect(buildRoundMemory(bare)).toBe('');
    expect(buildOnDeviceTurnPrompt(bare)).toBe(buildTurnPrompt(bare));
    expect(buildOnDeviceTurnPrompt(bare)).not.toContain('ROUND MEMORY');
  });
});

describe('buildOnDeviceTurnPrompt (Scopa)', () => {
  it('places the memory after the last moves and before the table, leaving the plain prompt unchanged', () => {
    const ctx = context();
    const prompt = buildOnDeviceTurnPrompt(ctx);
    const memoryAt = prompt.indexOf('--- ROUND MEMORY');
    expect(memoryAt).toBeGreaterThan(prompt.indexOf("Opponent's last move"));
    expect(memoryAt).toBeLessThan(prompt.indexOf('Table:'));
    expect(prompt.endsWith(`Choose best move (0-${ctx.validMoves.length - 1}):`)).toBe(true);
    expect(buildTurnPrompt(ctx)).not.toContain('ROUND MEMORY');
    expect(prompt.length).toBeLessThan(1500);
  });

  it('the on-device instructions ask for the reasoning before the move index', () => {
    expect(SYSTEM_INSTRUCTION_ON_DEVICE).toContain('ROUND MEMORY');
    expect(SYSTEM_INSTRUCTION_ON_DEVICE.indexOf('reasoning')).toBeLessThan(SYSTEM_INSTRUCTION_ON_DEVICE.indexOf('moveIndex'));
  });
});
