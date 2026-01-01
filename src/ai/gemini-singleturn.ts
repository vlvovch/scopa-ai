// Gemini Single-Turn AI Player - Uses single requests with full move history
// Unlike the multi-turn version, each request is independent and includes
// the complete round history in the prompt.

import { GoogleGenAI, Type } from '@google/genai';
import type { Card, Move } from '../game/types';
import type { AsyncAIPlayer, LLMAIContext } from './types';
import { randomAI } from './random';
import {
  getGeminiApiKey,
  isGeminiAvailable,
  type GeminiTokenStats,
  type GeminiTokenDelta,
} from './gemini';

// Default model to use
const DEFAULT_MODEL = 'gemini-2.5-flash';

const SYSTEM_INSTRUCTION = `You are an expert Italian Scopa player.

RULES:
- 40-card deck, 4 suits: Denari (coins), Coppe (cups), Spade (swords), Bastoni (clubs)
- Values: 1 (Asso) to 10 (Re). Face cards: Fante=8, Cavallo=9, Re=10
- On your turn, you play one card from hand. When playing a card:
  - If it matches a table card's value, you must capture that card
  - You may capture multiple cards if their values sum to your card's value
  - Single-card match takes priority over sum capture
  - If no capture possible, place your card on the table
- On the last hand, the player who did last capture takes all remaining cards on the table

SCORING (calculated at end of each round):
- Carte: 1 point for most cards captured (21+ guarantees)
- Denari: 1 point for most Denari suit cards (6+ guarantees)
- Sette Bello: 1 point for capturing the 7 of Denari
- Primiera: 1 point for best prime (highest-value card from each suit)
  Prime values: 7=21, 6=18, Asso=16, 5=15, 4=14, 3=13, 2=12, face cards=10
- Scopa: 1 point EACH TIME you clear all cards from the table EXCEPT for the last hand

First to reach target score wins.

INPUT: Current game state with complete round move history and numbered list of valid moves.
OUTPUT: JSON with moveIndex (0-based) and reasoning.`;

/**
 * Format a card for display
 */
function formatCard(card: Card): string {
  return `${card.value} of ${card.suit}`;
}

/**
 * Format an array of cards
 */
function formatCards(cards: Card[]): string {
  if (cards.length === 0) return '(none)';
  return cards.map(formatCard).join(', ');
}

/**
 * Format a move for display in history
 */
function formatMoveForHistory(move: Move, perspective: 'self' | 'opponent'): string {
  const who = perspective === 'self' ? 'You' : 'Opponent';
  const cardStr = formatCard(move.cardPlayed);
  if (move.capturedCards.length === 0) {
    return `${who} played ${cardStr} (placed on table)`;
  }
  const captured = formatCards(move.capturedCards);
  const scopa = move.isScopa ? ' [SCOPA!]' : '';
  return `${who} played ${cardStr} → captured ${captured}${scopa}`;
}

/**
 * Format a move for display in valid moves list
 */
function formatMove(move: Move, index: number): string {
  const cardStr = formatCard(move.cardPlayed);
  if (move.capturedCards.length === 0) {
    return `[${index}] Play ${cardStr} (place on table)`;
  }
  const captured = formatCards(move.capturedCards);
  const scopa = move.isScopa ? ' [SCOPA!]' : '';
  return `[${index}] Play ${cardStr} → capture ${captured}${scopa}`;
}

/**
 * Format the complete move history for the round
 */
function formatMoveHistory(history: Move[], selfPlayer: 'human' | 'cpu'): string {
  if (history.length === 0) return 'None (start of round)';

  return history.map((move, i) => {
    const perspective = move.player === selfPlayer ? 'self' : 'opponent';
    return `Turn ${i + 1}: ${formatMoveForHistory(move, perspective)}`;
  }).join('\n');
}

/**
 * Build prompt for current turn with full move history
 */
function buildPrompt(context: LLMAIContext, roundMoveHistory: Move[]): string {
  const {
    hand, table, player, scores, targetScore, roundNumber,
    opponentHandCount, selfCapturedCount, opponentCapturedCount,
    deckCount, validMoves
  } = context;

  const movesStr = validMoves.map((m, i) => formatMove(m, i)).join('\n');
  const historyStr = formatMoveHistory(roundMoveHistory, player);

  return `--- TURN ---
Round ${roundNumber} | Score: You ${scores.self} - Opponent ${scores.opponent} (target: ${targetScore})
Deck: ${deckCount} | My pile: ${selfCapturedCount} | Opponent pile: ${opponentCapturedCount} | Opponent hand: ${opponentHandCount}

ROUND MOVE HISTORY:
${historyStr}

Table: ${formatCards(table)}
My hand: ${formatCards(hand)}

Valid moves:
${movesStr}

Choose best move (0-${validMoves.length - 1}):`;
}

/**
 * Gemini Single-Turn AI Player using @google/genai SDK
 * Each request is independent - no chat session maintained.
 * Full move history is included in each prompt.
 */
class GeminiSingleTurnAI implements AsyncAIPlayer {
  readonly name: string;
  readonly isAsync = true as const;

  private ai: GoogleGenAI;
  private model: string;
  private modelDisplayName: string;

  // Track moves for this round
  private roundMoveHistory: Move[] = [];
  private selfPlayer: 'human' | 'cpu' = 'cpu';

  public lastReasoning: string = '';
  public tokenStats: GeminiTokenStats;
  public lastDelta: GeminiTokenDelta = {
    promptTokens: 0,
    responseTokens: 0,
    thoughtTokens: 0,
    totalTokens: 0,
  };

  constructor(apiKey: string, model: string = DEFAULT_MODEL) {
    this.ai = new GoogleGenAI({ apiKey });
    this.model = model;
    // Create display name from model ID (e.g., "gemini-2.5-flash" -> "Gemini 2.5 Flash")
    const shortName = model.replace('gemini-', '').split('-').map(
      (part, i) => i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)
    ).join(' ');
    this.modelDisplayName = `Gemini ${shortName}`;
    this.name = `${this.modelDisplayName} (1-turn)`;

    // Initialize token stats with model info
    this.tokenStats = {
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
      modelId: model,
      modelDisplayName: this.modelDisplayName,
      totalTimeMs: 0,
      lastTurnTimeMs: 0,
      minTurnTimeMs: 0,
      maxTurnTimeMs: 0,
      roundTotalTimeMs: 0,
    };
  }

  /**
   * Update token stats from response metadata
   */
  private updateTokenStats(usageMetadata: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    cachedContentTokenCount?: number;
    thoughtsTokenCount?: number;
  } | undefined): void {
    if (!usageMetadata) return;

    const promptDelta = usageMetadata.promptTokenCount || 0;
    const responseDelta = usageMetadata.candidatesTokenCount || 0;
    const thoughtDelta = usageMetadata.thoughtsTokenCount || 0;
    const totalDelta = usageMetadata.totalTokenCount || 0;

    // Update cumulative stats
    this.tokenStats.promptTokens += promptDelta;
    this.tokenStats.responseTokens += responseDelta;
    this.tokenStats.thoughtTokens += thoughtDelta;
    this.tokenStats.totalTokens += totalDelta;
    this.tokenStats.cachedTokens += usageMetadata.cachedContentTokenCount || 0;
    this.tokenStats.requestCount += 1;

    // Update round-specific stats
    this.tokenStats.roundPromptTokens += promptDelta;
    this.tokenStats.roundResponseTokens += responseDelta;
    this.tokenStats.roundThoughtTokens += thoughtDelta;
    this.tokenStats.roundTotalTokens += totalDelta;
    this.tokenStats.roundRequestCount += 1;

    // Track last delta
    this.lastDelta = {
      promptTokens: promptDelta,
      responseTokens: responseDelta,
      thoughtTokens: thoughtDelta,
      totalTokens: totalDelta,
    };
  }

  /**
   * Update timing stats after a turn
   */
  private updateTimingStats(turnTimeMs: number): void {
    this.tokenStats.lastTurnTimeMs = turnTimeMs;
    this.tokenStats.totalTimeMs += turnTimeMs;
    this.tokenStats.roundTotalTimeMs += turnTimeMs;

    // Update min/max (initialize min on first turn)
    if (this.tokenStats.minTurnTimeMs === 0 || turnTimeMs < this.tokenStats.minTurnTimeMs) {
      this.tokenStats.minTurnTimeMs = turnTimeMs;
    }
    if (turnTimeMs > this.tokenStats.maxTurnTimeMs) {
      this.tokenStats.maxTurnTimeMs = turnTimeMs;
    }
  }

  /**
   * Reset token stats (e.g., for new game)
   */
  resetTokenStats(): void {
    this.tokenStats = {
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
      modelId: this.model,
      modelDisplayName: this.modelDisplayName,
      totalTimeMs: 0,
      lastTurnTimeMs: 0,
      minTurnTimeMs: 0,
      maxTurnTimeMs: 0,
      roundTotalTimeMs: 0,
    };
    this.lastDelta = {
      promptTokens: 0,
      responseTokens: 0,
      thoughtTokens: 0,
      totalTokens: 0,
    };
  }

  /**
   * Reset round-specific stats (called at start of each round)
   */
  resetRoundStats(): void {
    this.tokenStats.roundPromptTokens = 0;
    this.tokenStats.roundResponseTokens = 0;
    this.tokenStats.roundThoughtTokens = 0;
    this.tokenStats.roundTotalTokens = 0;
    this.tokenStats.roundRequestCount = 0;
    this.tokenStats.roundTotalTimeMs = 0;
  }

  /**
   * Start a new round - reset move history
   */
  startRound(): void {
    this.resetRoundStats();
    this.roundMoveHistory = [];
    this.lastReasoning = '';
  }

  /**
   * End the current round
   */
  endRound(): void {
    this.roundMoveHistory = [];
  }

  /**
   * Check if a move is already in history (by comparing card played)
   */
  private isInHistory(move: Move): boolean {
    return this.roundMoveHistory.some(
      m => m.cardPlayed.id === move.cardPlayed.id && m.player === move.player
    );
  }

  /**
   * Select a move using Gemini AI (single request with full history)
   */
  async selectMove(context: LLMAIContext): Promise<Move> {
    const { hand, table, player, validMoves, lastOpponentMove } = context;

    // Remember which player we are
    this.selfPlayer = player;

    if (hand.length === 0) {
      throw new Error('Cannot select move with empty hand');
    }

    if (validMoves.length === 0) {
      throw new Error('No valid moves available');
    }

    // Add opponent's last move to history if not already tracked
    if (lastOpponentMove && !this.isInHistory(lastOpponentMove)) {
      this.roundMoveHistory.push(lastOpponentMove);
    }

    // If only one move, just add it to history and return
    if (validMoves.length === 1) {
      const onlyMove = validMoves[0];
      this.roundMoveHistory.push(onlyMove);
      this.lastReasoning = 'Only one move available.';
      return onlyMove;
    }

    try {
      const prompt = buildPrompt(context, this.roundMoveHistory);
      const startTime = performance.now();

      // Single request with full context (no chat session)
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              moveIndex: { type: Type.INTEGER },
              reasoning: { type: Type.STRING },
            },
            required: ['moveIndex', 'reasoning'],
          },
        },
      });

      const turnTime = performance.now() - startTime;
      this.updateTokenStats(response.usageMetadata);
      this.updateTimingStats(turnTime);

      const jsonText = response.text;

      if (!jsonText) {
        throw new Error('Empty response from AI');
      }

      const result = JSON.parse(jsonText);
      const index = result.moveIndex;
      this.lastReasoning = result.reasoning || '';

      if (typeof index === 'number' && index >= 0 && index < validMoves.length) {
        const selectedMove = validMoves[index];
        // Add our move to history
        this.roundMoveHistory.push(selectedMove);
        console.log(`[Gemini Single-Turn] ${this.lastReasoning}`);
        return selectedMove;
      }

      console.warn(`[Gemini Single-Turn] Invalid moveIndex ${index}, using first valid move`);
      const fallbackMove = validMoves[0];
      this.roundMoveHistory.push(fallbackMove);
      return fallbackMove;
    } catch (error) {
      console.error('Gemini Single-Turn AI error, falling back to random:', error);
      this.lastReasoning = 'Error occurred, random fallback.';
      const fallbackMove = randomAI.selectMove({ hand, table, player });
      this.roundMoveHistory.push(fallbackMove);
      return fallbackMove;
    }
  }
}

/**
 * Create a Gemini Single-Turn AI player instance
 */
export function createGeminiSingleTurnAI(model: string = DEFAULT_MODEL): AsyncAIPlayer | null {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    console.warn('Gemini API key not found. Set VITE_GEMINI_API_KEY in .env.local');
    return null;
  }
  return new GeminiSingleTurnAI(apiKey, model);
}

// Cached instance with model tracking
let cachedInstance: AsyncAIPlayer | null = null;
let cachedModelId: string | null = null;

/**
 * Get a Gemini Single-Turn AI instance (cached if same model)
 */
export function getGeminiSingleTurnAI(model: string = DEFAULT_MODEL): AsyncAIPlayer | null {
  if (!isGeminiAvailable()) {
    return null;
  }

  // Return cached instance if model matches
  if (cachedInstance !== null && cachedModelId === model) {
    return cachedInstance;
  }

  // Create new instance for different model
  cachedInstance = createGeminiSingleTurnAI(model);
  cachedModelId = model;
  return cachedInstance;
}

/**
 * Get token stats from the cached Gemini Single-Turn AI instance
 */
export function getGeminiSingleTurnTokenStats(): GeminiTokenStats | null {
  const instance = cachedInstance as GeminiSingleTurnAI | null;
  if (instance && 'tokenStats' in instance) {
    return { ...instance.tokenStats };
  }
  return null;
}

/**
 * Get last turn delta from the cached Gemini Single-Turn AI instance
 */
export function getGeminiSingleTurnTokenDelta(): GeminiTokenDelta | null {
  const instance = cachedInstance as GeminiSingleTurnAI | null;
  if (instance && 'lastDelta' in instance) {
    return { ...instance.lastDelta };
  }
  return null;
}

/**
 * Reset token stats on the cached Gemini Single-Turn AI instance
 */
export function resetGeminiSingleTurnTokenStats(): void {
  const instance = cachedInstance as GeminiSingleTurnAI | null;
  if (instance && 'resetTokenStats' in instance) {
    instance.resetTokenStats();
  }
}

/**
 * Start a new round on the cached Gemini Single-Turn AI instance
 */
export function startGeminiSingleTurnRound(): void {
  const instance = cachedInstance as GeminiSingleTurnAI | null;
  if (instance && 'startRound' in instance) {
    instance.startRound();
  }
}

/**
 * End the current round on the cached Gemini Single-Turn AI instance
 */
export function endGeminiSingleTurnRound(): void {
  const instance = cachedInstance as GeminiSingleTurnAI | null;
  if (instance && 'endRound' in instance) {
    instance.endRound();
  }
}
