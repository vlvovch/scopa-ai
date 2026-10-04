// The on-device prompt: the short round memory (the coins race, where the
// 7 of coins is, the scope) computed from the cards seen, placed before the
// position, and absent when nothing is known; the instructions kept small.
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
  it('summarises the coins race, the 7 of coins and the scope, and nothing the small model misreads', () => {
    const memory = buildRoundMemory(context());
    expect(memory).toContain('Coins captured: you 2, opponent 1 (6 win the coins point)');
    expect(memory).toContain('7 of coins: in your hand');
    expect(memory).toContain('Scope this round: you 1, opponent 0');
    // the primiera breakdown and the unseen values by count were read as the opponent's hand
    expect(memory).not.toContain('Primiera');
    expect(memory).not.toContain('Not seen yet');
    expect(memory.split('\n')).toHaveLength(4);
  });

  it('tracks where the 7 of coins is', () => {
    expect(buildRoundMemory(context({ hand: cards('cups-3'), selfCaptured: cards('coins-7') }))).toContain('7 of coins: in your pile');
    expect(buildRoundMemory(context({ hand: cards('cups-3'), opponentCaptured: cards('coins-7') }))).toContain("7 of coins: in the opponent's pile");
    expect(buildRoundMemory(context({ hand: cards('cups-3'), table: cards('coins-7') }))).toContain('7 of coins: on the table');
    expect(buildRoundMemory(context({ hand: cards('cups-3') }))).toContain('7 of coins: not seen yet');
  });

  it('is empty without the captured piles, and so is the on-device prompt\'s memory', () => {
    const bare = context({ selfCaptured: undefined, opponentCaptured: undefined });
    expect(buildRoundMemory(bare)).toBe('');
    expect(buildOnDeviceTurnPrompt(bare)).not.toContain('ROUND MEMORY');
    // only the spelled-out moves differ from the plain prompt
    expect(buildOnDeviceTurnPrompt(bare).split('Valid moves:')[0]).toBe(buildTurnPrompt(bare).split('Valid moves:')[0]);
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
    expect(prompt.length).toBeLessThan(1000);
  });

  it('spells the legal moves out: captures, a scopa, or a card that stays on the table', () => {
    // the default position: neither the 7 nor the 3 captures anything
    const placing = buildOnDeviceTurnPrompt(context());
    expect(placing).toContain('[0] Play 7 of coins: no capture, it stays on the table');
    expect(placing).toContain('[1] Play 3 of cups: no capture, it stays on the table');
    expect(placing).not.toContain('(place on table)');
    expect(buildTurnPrompt(context())).toContain('[1] Play 3 of cups (place on table)');
    // with a 3 on the table the 7 takes the 4 and the 3 and empties it, the 3 of cups takes the 3
    const hand = cards('coins-7', 'cups-3');
    const table = cards('coins-4', 'swords-3');
    const capturing = buildOnDeviceTurnPrompt(context({ hand, table, validMoves: hand.flatMap((c) => getValidMoves(c, table, 'cpu')) }));
    expect(capturing).toContain('[0] Play 7 of coins: captures 4 of coins, 3 of swords and empties the table: a SCOPA');
    expect(capturing).toContain('[1] Play 3 of cups: captures 3 of swords');
  });

  it('the on-device instructions stay short, forbid guessing the hidden cards and ask for the reasoning before the move index', () => {
    expect(SYSTEM_INSTRUCTION_ON_DEVICE).toContain('ROUND MEMORY');
    expect(SYSTEM_INSTRUCTION_ON_DEVICE).toContain("You cannot see the opponent's cards or the deck");
    expect(SYSTEM_INSTRUCTION_ON_DEVICE.split(/\s+/).length).toBeLessThan(260);
    expect(SYSTEM_INSTRUCTION_ON_DEVICE.indexOf('reasoning')).toBeLessThan(SYSTEM_INSTRUCTION_ON_DEVICE.indexOf('moveIndex'));
  });
});
