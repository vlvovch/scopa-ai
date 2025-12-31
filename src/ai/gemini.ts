// Gemini AI Player - Uses Google's Gemini API for intelligent play

import { GoogleGenAI, Type, Chat } from '@google/genai';
import type { Card, Move } from '../game/types';
import type { AsyncAIPlayer, LLMAIContext } from './types';
import { randomAI } from './random';

// Model info returned from API
export interface GeminiModelInfo {
  id: string;
  displayName: string;
}

// Token usage statistics
export interface GeminiTokenStats {
  promptTokens: number;
  responseTokens: number;
  thoughtTokens: number;
  totalTokens: number;
  cachedTokens: number;
  requestCount: number;
}

// Delta from last API call
export interface GeminiTokenDelta {
  promptTokens: number;
  responseTokens: number;
  thoughtTokens: number;
  totalTokens: number;
}

// Default model to use
const DEFAULT_MODEL = 'gemini-2.5-flash';

// Cached models list
let cachedModels: GeminiModelInfo[] | null = null;
let modelsFetchPromise: Promise<GeminiModelInfo[]> | null = null;

/**
 * Fetch available Gemini models from the API
 * Results are cached after first successful fetch
 */
export async function fetchGeminiModels(): Promise<GeminiModelInfo[]> {
  // Return cached models if available
  if (cachedModels !== null) {
    return cachedModels;
  }

  // Return existing promise if fetch is in progress
  if (modelsFetchPromise !== null) {
    return modelsFetchPromise;
  }

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return [];
  }

  modelsFetchPromise = (async () => {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const models: GeminiModelInfo[] = [];

      for await (const model of await ai.models.list()) {
        // Only include models that support generateContent
        if (model.supportedActions?.includes('generateContent')) {
          // Extract model ID from full name (e.g., "models/gemini-2.5-flash" -> "gemini-2.5-flash")
          const id = model.name?.replace('models/', '') || '';
          const displayName = model.displayName || id;

          if (id) {
            models.push({ id, displayName });
          }
        }
      }

      // Sort by display name
      models.sort((a, b) => a.displayName.localeCompare(b.displayName));

      cachedModels = models;
      return models;
    } catch (error) {
      console.error('Failed to fetch Gemini models:', error);
      // Return fallback models on error
      return [
        { id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
        { id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' },
        { id: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash' },
      ];
    } finally {
      modelsFetchPromise = null;
    }
  })();

  return modelsFetchPromise;
}

/**
 * Get cached models synchronously (returns empty if not yet fetched)
 */
export function getCachedGeminiModels(): GeminiModelInfo[] {
  return cachedModels || [];
}

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

INPUT: Current game state and numbered list of valid moves.
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
 * Format a move for display
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
 * Format last opponent move
 */
function formatLastMove(move: Move | null): string {
  if (!move) return 'None (start of round)';
  const cardStr = formatCard(move.cardPlayed);
  if (move.capturedCards.length === 0) {
    return `Played ${cardStr} to table`;
  }
  const captured = formatCards(move.capturedCards);
  return `Played ${cardStr} and captured: ${captured}`;
}

/**
 * Build prompt for current turn
 */
function buildPrompt(context: LLMAIContext): string {
  const {
    hand, table, scores, targetScore, roundNumber,
    opponentHandCount, selfCapturedCount, opponentCapturedCount,
    deckCount, lastOpponentMove, validMoves
  } = context;

  const movesStr = validMoves.map((m, i) => formatMove(m, i)).join('\n');

  return `--- TURN ---
Round ${roundNumber} | Score: You ${scores.self} - Opponent ${scores.opponent} (target: ${targetScore})
Deck: ${deckCount} | My pile: ${selfCapturedCount} | Opponent pile: ${opponentCapturedCount} | Opponent hand: ${opponentHandCount}

Opponent's last move: ${formatLastMove(lastOpponentMove)}

Table: ${formatCards(table)}
My hand: ${formatCards(hand)}

Valid moves:
${movesStr}

Choose best move (0-${validMoves.length - 1}):`;
}

/**
 * Gemini AI Player using @google/genai SDK
 */
class GeminiAI implements AsyncAIPlayer {
  readonly name: string;
  readonly isAsync = true as const;

  private ai: GoogleGenAI;
  private model: string;
  private chat: Chat | null = null;
  public lastReasoning: string = '';
  public tokenStats: GeminiTokenStats = {
    promptTokens: 0,
    responseTokens: 0,
    thoughtTokens: 0,
    totalTokens: 0,
    cachedTokens: 0,
    requestCount: 0,
  };
  public lastDelta: GeminiTokenDelta = {
    promptTokens: 0,
    responseTokens: 0,
    thoughtTokens: 0,
    totalTokens: 0,
  };

  constructor(apiKey: string, model: string = DEFAULT_MODEL) {
    this.ai = new GoogleGenAI({ apiKey });
    this.model = model;
    // Create display name from model ID (e.g., "gemini-2.5-flash" -> "2.5 Flash")
    const shortName = model.replace('gemini-', '').split('-').map(
      (part, i) => i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)
    ).join(' ');
    this.name = `Gemini ${shortName}`;
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

    // Track last delta
    this.lastDelta = {
      promptTokens: promptDelta,
      responseTokens: responseDelta,
      thoughtTokens: thoughtDelta,
      totalTokens: totalDelta,
    };
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
    };
    this.lastDelta = {
      promptTokens: 0,
      responseTokens: 0,
      thoughtTokens: 0,
      totalTokens: 0,
    };
  }

  /**
   * Start a new round - create fresh chat session
   */
  startRound(): void {
    this.chat = this.ai.chats.create({
      model: this.model,
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
    this.lastReasoning = '';
  }

  /**
   * End the current round
   */
  endRound(): void {
    this.chat = null;
  }

  /**
   * Select a move using Gemini AI
   */
  async selectMove(context: LLMAIContext): Promise<Move> {
    const { hand, table, player, validMoves } = context;

    if (hand.length === 0) {
      throw new Error('Cannot select move with empty hand');
    }

    if (validMoves.length === 0) {
      throw new Error('No valid moves available');
    }

    // Create chat session if not exists
    if (!this.chat) {
      this.startRound();
    }

    // If only one move, still inform AI of game state for context
    if (validMoves.length === 1) {
      const prompt = buildPrompt(context);
      try {
        // Wait for response to keep chat session in sync
        const response = await this.chat!.sendMessage({ message: prompt });
        this.updateTokenStats(response.usageMetadata);
      } catch (e) {
        // Ignore errors for single-move updates
      }
      this.lastReasoning = 'Only one move available.';
      return validMoves[0];
    }

    try {
      const prompt = buildPrompt(context);
      const response = await this.chat!.sendMessage({ message: prompt });
      this.updateTokenStats(response.usageMetadata);
      const jsonText = response.text;

      if (!jsonText) {
        throw new Error('Empty response from AI');
      }

      const result = JSON.parse(jsonText);
      const index = result.moveIndex;
      this.lastReasoning = result.reasoning || '';

      if (typeof index === 'number' && index >= 0 && index < validMoves.length) {
        console.log(`[Gemini] ${this.lastReasoning}`);
        return validMoves[index];
      }

      console.warn(`[Gemini] Invalid moveIndex ${index}, using first valid move`);
      return validMoves[0];
    } catch (error) {
      console.error('Gemini AI error, falling back to random:', error);
      this.lastReasoning = 'Error occurred, random fallback.';
      return randomAI.selectMove({ hand, table, player });
    }
  }
}

/**
 * Check if Gemini API key is available
 */
export function isGeminiAvailable(): boolean {
  return !!import.meta.env.VITE_GEMINI_API_KEY;
}

/**
 * Get the Gemini API key from environment
 */
export function getGeminiApiKey(): string | null {
  return import.meta.env.VITE_GEMINI_API_KEY || null;
}

/**
 * Create a Gemini AI player instance
 */
export function createGeminiAI(model: string = DEFAULT_MODEL): AsyncAIPlayer | null {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    console.warn('Gemini API key not found. Set VITE_GEMINI_API_KEY in .env.local');
    return null;
  }
  return new GeminiAI(apiKey, model);
}

// Cached instance with model tracking
let cachedInstance: AsyncAIPlayer | null = null;
let cachedModelId: string | null = null;

/**
 * Get a Gemini AI instance (cached if same model)
 */
export function getGeminiAI(model: string = DEFAULT_MODEL): AsyncAIPlayer | null {
  if (!isGeminiAvailable()) {
    return null;
  }

  // Return cached instance if model matches
  if (cachedInstance !== null && cachedModelId === model) {
    return cachedInstance;
  }

  // Create new instance for different model
  cachedInstance = createGeminiAI(model);
  cachedModelId = model;
  return cachedInstance;
}

/**
 * Get the default Gemini model ID
 */
export function getDefaultGeminiModel(): string {
  return DEFAULT_MODEL;
}

/**
 * Get token stats from the cached Gemini AI instance
 */
export function getGeminiTokenStats(): GeminiTokenStats | null {
  const instance = cachedInstance as GeminiAI | null;
  if (instance && 'tokenStats' in instance) {
    return { ...instance.tokenStats };
  }
  return null;
}

/**
 * Get last turn delta from the cached Gemini AI instance
 */
export function getGeminiTokenDelta(): GeminiTokenDelta | null {
  const instance = cachedInstance as GeminiAI | null;
  if (instance && 'lastDelta' in instance) {
    return { ...instance.lastDelta };
  }
  return null;
}

/**
 * Reset token stats on the cached Gemini AI instance
 */
export function resetGeminiTokenStats(): void {
  const instance = cachedInstance as GeminiAI | null;
  if (instance && 'resetTokenStats' in instance) {
    instance.resetTokenStats();
  }
}
