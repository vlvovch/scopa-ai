#!/usr/bin/env node
/**
 * Scopa AI Simulation CLI
 *
 * Run AI vs AI simulations from the command line.
 * Designed to run on remote servers with screen/nohup for long-running LLM simulations.
 *
 * Usage:
 *   npx tsx scripts/simulate.ts --player1=gemini --player2=expert --games=100
 *
 * Environment variables:
 *   GEMINI_API_KEY - Google Gemini API key
 *   OPENAI_API_KEY - OpenAI API key
 *   ANTHROPIC_API_KEY - Anthropic Claude API key
 *
 * Also loads from .env.local (VITE_* prefixed keys supported)
 */

import * as fs from 'fs';
import * as path from 'path';

// Load .env.local file if it exists
function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  try {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIndex = trimmed.indexOf('=');
          if (eqIndex > 0) {
            const key = trimmed.slice(0, eqIndex);
            const value = trimmed.slice(eqIndex + 1);
            if (!process.env[key]) {
              process.env[key] = value;
            }
          }
        }
      }
    }
  } catch {
    // Ignore errors loading env file
  }
}
loadEnvFile();

import { GoogleGenAI, Chat } from '@google/genai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

// Import game logic and AI from src/
import type { Card, GameState, Move, PlayerId } from '../src/game/types.js';
import { dealCards } from '../src/game/deck.js';
import { getValidMoves, isValidMove, executeMove } from '../src/game/rules.js';
import { calculateRoundScore } from '../src/game/scoring.js';
import { DEFAULT_TARGET_SCORE, CARDS_PER_HAND } from '../src/game/constants.js';
import { createInitialState, dealInitialCards } from '../src/game/reducer.js';
import { randomAI as randomAIBase } from '../src/ai/random.js';
import { heuristicAI as heuristicAIBase } from '../src/ai/heuristic.js';
import { selectExpertMoveWithState } from '../src/ai/expert.js';
import type { AIPlayer, AIContext, AsyncAIPlayer, LLMAIContext } from '../src/ai/types.js';
import { isAsyncAI } from '../src/ai/types.js';
import {
  SYSTEM_INSTRUCTION_MULTITURN,
  SYSTEM_INSTRUCTION_SINGLETURN,
  buildTurnPrompt,
  buildSingleTurnPrompt,
} from '../src/ai/prompts.js';

// ============================================================================
// Wrap imported AIs with game character names
// ============================================================================

const randomAI: AIPlayer = { ...randomAIBase, name: '🐒 Scimmietta' };
const heuristicAI: AIPlayer = { ...heuristicAIBase, name: '🦊 Furbo' };

// ============================================================================
// Expert AI Wrapper (uses selectExpertMoveWithState from src/ai/expert.ts)
// ============================================================================

interface ExpertAIPlayer {
  name: string;
  selectMoveWithState(state: GameState): Move;
}

const expertAI: ExpertAIPlayer = {
  name: '🧠 Esperto',
  selectMoveWithState(state: GameState): Move {
    return selectExpertMoveWithState(state, { timeBudgetMs: 100 });
  },
};

function isExpertAI(ai: AnyGameAIPlayer): ai is ExpertAIPlayer {
  return 'selectMoveWithState' in ai;
}

// ============================================================================
// LLM AI Implementations
// ============================================================================

// JSON schema for move selection response
const MOVE_JSON_SCHEMA = {
  type: 'object' as const,
  properties: {
    moveIndex: { type: 'integer' as const, description: '0-based index of the selected move' },
    reasoning: { type: 'string' as const, description: 'Brief explanation of why this move was chosen' },
  },
  required: ['moveIndex', 'reasoning'],
};

// Token stats tracking
interface TokenStats {
  promptTokens: number;
  responseTokens: number;
  thinkingTokens: number;
  totalTokens: number;
  requestCount: number;
  totalTimeMs: number;
}

function createTokenStats(): TokenStats {
  return { promptTokens: 0, responseTokens: 0, thinkingTokens: 0, totalTokens: 0, requestCount: 0, totalTimeMs: 0 };
}

function formatTokensCompact(stats: TokenStats): string {
  const totalK = (stats.totalTokens / 1000).toFixed(1);
  const inK = (stats.promptTokens / 1000).toFixed(1);
  const outK = (stats.responseTokens / 1000).toFixed(1);
  const avgTimeS = stats.requestCount > 0 ? (stats.totalTimeMs / stats.requestCount / 1000).toFixed(1) : '0';
  if (stats.thinkingTokens > 0) {
    const thinkK = (stats.thinkingTokens / 1000).toFixed(1);
    return `${totalK}K (${inK}K in, ${thinkK}K think, ${outK}K out) ${avgTimeS}s/turn`;
  }
  return `${totalK}K (${inK}K in, ${outK}K out) ${avgTimeS}s/turn`;
}

// Gemini AI
class GeminiAI implements AsyncAIPlayer {
  readonly name: string;
  readonly isAsync = true as const;
  private ai: GoogleGenAI;
  private model: string;
  private chat: Chat | null = null;
  private useThinking: boolean;
  public tokenStats: TokenStats;

  constructor(apiKey: string, model: string, useThinking: boolean) {
    this.ai = new GoogleGenAI({ apiKey });
    this.model = model;
    this.useThinking = useThinking;
    const thinkStr = useThinking ? 'think' : 'no-think';
    this.name = `Gemini (${model}) [${thinkStr}, multi]`;
    this.tokenStats = createTokenStats();
  }

  startRound(): void {
    this.chat = this.ai.chats.create({
      model: this.model,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION_MULTITURN,
        responseMimeType: 'application/json',
        responseJsonSchema: MOVE_JSON_SCHEMA,
      },
    });
  }

  endRound(): void {
    this.chat = null;
  }

  async selectMove(context: LLMAIContext): Promise<Move> {
    if (!this.chat) this.startRound();

    const { validMoves } = context;
    if (validMoves.length === 0) throw new Error('No valid moves');
    if (validMoves.length === 1) return validMoves[0];

    try {
      const prompt = buildTurnPrompt(context);
      const startTime = performance.now();

      const thinkingBudget = this.useThinking ? -1 : 0;

      const response = await this.chat!.sendMessage({
        message: prompt,
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: MOVE_JSON_SCHEMA,
          thinkingConfig: { thinkingBudget },
        },
      });

      const elapsed = performance.now() - startTime;
      this.tokenStats.requestCount++;
      this.tokenStats.totalTimeMs += elapsed;
      if (response.usageMetadata) {
        this.tokenStats.promptTokens += response.usageMetadata.promptTokenCount || 0;
        this.tokenStats.responseTokens += response.usageMetadata.candidatesTokenCount || 0;
        this.tokenStats.thinkingTokens += response.usageMetadata.thoughtsTokenCount || 0;
        this.tokenStats.totalTokens += response.usageMetadata.totalTokenCount || 0;
      }

      const result = JSON.parse(response.text || '{}');
      const index = result.moveIndex;

      if (typeof index === 'number' && index >= 0 && index < validMoves.length) {
        return validMoves[index];
      }
      return validMoves[0];
    } catch (error) {
      console.error(`[Gemini] Error:`, error);
      return randomAI.selectMove(context);
    }
  }
}

// OpenAI AI
class OpenAIAI implements AsyncAIPlayer {
  readonly name: string;
  readonly isAsync = true as const;
  private client: OpenAI;
  private model: string;
  private messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  public tokenStats: TokenStats;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
    this.name = `GPT (${model}) [multi]`;
    this.tokenStats = createTokenStats();
  }

  startRound(): void {
    this.messages = [{ role: 'system', content: SYSTEM_INSTRUCTION_MULTITURN }];
  }

  endRound(): void {
    this.messages = [];
  }

  async selectMove(context: LLMAIContext): Promise<Move> {
    if (this.messages.length === 0) this.startRound();

    const { validMoves } = context;
    if (validMoves.length === 0) throw new Error('No valid moves');
    if (validMoves.length === 1) return validMoves[0];

    try {
      const prompt = buildTurnPrompt(context);
      this.messages.push({ role: 'user', content: prompt });

      const startTime = performance.now();

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: this.messages,
        response_format: { type: 'json_object' },
      });

      const elapsed = performance.now() - startTime;
      this.tokenStats.requestCount++;
      this.tokenStats.totalTimeMs += elapsed;
      if (response.usage) {
        this.tokenStats.promptTokens += response.usage.prompt_tokens || 0;
        this.tokenStats.responseTokens += response.usage.completion_tokens || 0;
        this.tokenStats.totalTokens += response.usage.total_tokens || 0;
      }

      const content = response.choices[0]?.message?.content || '{}';
      this.messages.push({ role: 'assistant', content });

      const result = JSON.parse(content);
      const index = result.moveIndex;

      if (typeof index === 'number' && index >= 0 && index < validMoves.length) {
        return validMoves[index];
      }
      return validMoves[0];
    } catch (error) {
      console.error(`[OpenAI] Error:`, error);
      return randomAI.selectMove(context);
    }
  }
}

// Claude AI
class ClaudeAI implements AsyncAIPlayer {
  readonly name: string;
  readonly isAsync = true as const;
  private client: Anthropic;
  private model: string;
  private messages: Anthropic.MessageParam[] = [];
  private useThinking: boolean;
  public tokenStats: TokenStats;

  constructor(apiKey: string, model: string, useThinking: boolean) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.useThinking = useThinking;
    const thinkStr = useThinking ? 'think' : 'no-think';
    this.name = `Claude (${model}) [${thinkStr}, multi]`;
    this.tokenStats = createTokenStats();
  }

  startRound(): void {
    this.messages = [];
  }

  endRound(): void {
    this.messages = [];
  }

  async selectMove(context: LLMAIContext): Promise<Move> {
    const { validMoves } = context;
    if (validMoves.length === 0) throw new Error('No valid moves');
    if (validMoves.length === 1) return validMoves[0];

    try {
      const prompt = buildTurnPrompt(context);
      this.messages.push({ role: 'user', content: prompt });

      const startTime = performance.now();

      // Build request params
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const requestParams: any = {
        model: this.model,
        max_tokens: this.useThinking ? 16000 : 1024,
        system: SYSTEM_INSTRUCTION_MULTITURN,
        messages: this.messages,
      };

      // Add thinking config for supported models
      if (this.useThinking && this.model.includes('3-7') && validMoves.length > 1) {
        requestParams.thinking = { type: 'enabled', budget_tokens: 10000 };
      }

      const response = await this.client.messages.create(requestParams);

      const elapsed = performance.now() - startTime;
      this.tokenStats.requestCount++;
      this.tokenStats.totalTimeMs += elapsed;
      this.tokenStats.promptTokens += response.usage?.input_tokens || 0;
      this.tokenStats.responseTokens += response.usage?.output_tokens || 0;
      this.tokenStats.totalTokens += (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

      // Extract text from response
      let text = '';
      for (const block of response.content) {
        if (block.type === 'text') {
          text = block.text;
          break;
        }
      }

      // Add assistant response to conversation
      this.messages.push({ role: 'assistant', content: text });

      // Parse JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        const index = result.moveIndex;

        if (typeof index === 'number' && index >= 0 && index < validMoves.length) {
          return validMoves[index];
        }
      }

      return validMoves[0];
    } catch (error) {
      console.error(`[Claude] Error:`, error);
      return randomAI.selectMove(context);
    }
  }
}

// ============================================================================
// Single-Turn LLM AI Implementations
// ============================================================================

// Base class for single-turn AI with move history tracking
abstract class SingleTurnAIBase implements AsyncAIPlayer {
  abstract readonly name: string;
  readonly isAsync = true as const;
  abstract tokenStats: TokenStats;

  protected roundMoveHistory: Move[] = [];
  protected initialTable: Card[] = [];

  startRound(): void {
    this.roundMoveHistory = [];
    this.initialTable = [];
  }

  endRound(): void {
    this.roundMoveHistory = [];
    this.initialTable = [];
  }

  protected captureInitialTable(table: Card[], lastOpponentMove: Move | null): void {
    if (this.roundMoveHistory.length === 0 && this.initialTable.length === 0) {
      if (!lastOpponentMove) {
        this.initialTable = [...table];
      } else {
        if (lastOpponentMove.capturedCards.length === 0) {
          this.initialTable = table.filter(c => c.id !== lastOpponentMove.cardPlayed.id);
        } else {
          this.initialTable = [...table, ...lastOpponentMove.capturedCards];
        }
      }
    }
  }

  protected trackOpponentMove(lastOpponentMove: Move | null): void {
    if (lastOpponentMove && !this.roundMoveHistory.some(
      m => m.cardPlayed.id === lastOpponentMove.cardPlayed.id && m.player === lastOpponentMove.player
    )) {
      this.roundMoveHistory.push(lastOpponentMove);
    }
  }

  protected trackOwnMove(move: Move): void {
    this.roundMoveHistory.push(move);
  }

  abstract selectMove(context: LLMAIContext): Promise<Move>;
}

// Gemini Single-Turn AI
class GeminiSingleTurnAI extends SingleTurnAIBase {
  readonly name: string;
  private ai: GoogleGenAI;
  private model: string;
  private useThinking: boolean;
  public tokenStats: TokenStats;

  constructor(apiKey: string, model: string, useThinking: boolean) {
    super();
    this.ai = new GoogleGenAI({ apiKey });
    this.model = model;
    this.useThinking = useThinking;
    const thinkStr = useThinking ? 'think' : 'no-think';
    this.name = `Gemini (${model}) [${thinkStr}, single]`;
    this.tokenStats = createTokenStats();
  }

  async selectMove(context: LLMAIContext): Promise<Move> {
    const { validMoves, table, lastOpponentMove } = context;
    if (validMoves.length === 0) throw new Error('No valid moves');

    this.captureInitialTable(table, lastOpponentMove);
    this.trackOpponentMove(lastOpponentMove);

    if (validMoves.length === 1) {
      this.trackOwnMove(validMoves[0]);
      return validMoves[0];
    }

    try {
      const prompt = buildSingleTurnPrompt(context, this.roundMoveHistory, this.initialTable);
      const startTime = performance.now();
      const thinkingBudget = this.useThinking ? -1 : 0;

      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION_SINGLETURN,
          responseMimeType: 'application/json',
          responseJsonSchema: MOVE_JSON_SCHEMA,
          thinkingConfig: { thinkingBudget },
        },
      });

      const elapsed = performance.now() - startTime;
      this.tokenStats.requestCount++;
      this.tokenStats.totalTimeMs += elapsed;
      if (response.usageMetadata) {
        this.tokenStats.promptTokens += response.usageMetadata.promptTokenCount || 0;
        this.tokenStats.responseTokens += response.usageMetadata.candidatesTokenCount || 0;
        this.tokenStats.thinkingTokens += response.usageMetadata.thoughtsTokenCount || 0;
        this.tokenStats.totalTokens += response.usageMetadata.totalTokenCount || 0;
      }

      const result = JSON.parse(response.text || '{}');
      const index = result.moveIndex;

      if (typeof index === 'number' && index >= 0 && index < validMoves.length) {
        this.trackOwnMove(validMoves[index]);
        return validMoves[index];
      }
      this.trackOwnMove(validMoves[0]);
      return validMoves[0];
    } catch (error) {
      console.error(`[Gemini single] Error:`, error);
      const fallback = randomAI.selectMove(context);
      this.trackOwnMove(fallback);
      return fallback;
    }
  }
}

// OpenAI Single-Turn AI
class OpenAISingleTurnAI extends SingleTurnAIBase {
  readonly name: string;
  private client: OpenAI;
  private model: string;
  public tokenStats: TokenStats;

  constructor(apiKey: string, model: string) {
    super();
    this.client = new OpenAI({ apiKey });
    this.model = model;
    this.name = `GPT (${model}) [single]`;
    this.tokenStats = createTokenStats();
  }

  async selectMove(context: LLMAIContext): Promise<Move> {
    const { validMoves, table, lastOpponentMove } = context;
    if (validMoves.length === 0) throw new Error('No valid moves');

    this.captureInitialTable(table, lastOpponentMove);
    this.trackOpponentMove(lastOpponentMove);

    if (validMoves.length === 1) {
      this.trackOwnMove(validMoves[0]);
      return validMoves[0];
    }

    try {
      const prompt = buildSingleTurnPrompt(context, this.roundMoveHistory, this.initialTable);
      const startTime = performance.now();

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: SYSTEM_INSTRUCTION_SINGLETURN },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      });

      const elapsed = performance.now() - startTime;
      this.tokenStats.requestCount++;
      this.tokenStats.totalTimeMs += elapsed;
      if (response.usage) {
        this.tokenStats.promptTokens += response.usage.prompt_tokens || 0;
        this.tokenStats.responseTokens += response.usage.completion_tokens || 0;
        this.tokenStats.totalTokens += response.usage.total_tokens || 0;
      }

      const content = response.choices[0]?.message?.content || '{}';
      const result = JSON.parse(content);
      const index = result.moveIndex;

      if (typeof index === 'number' && index >= 0 && index < validMoves.length) {
        this.trackOwnMove(validMoves[index]);
        return validMoves[index];
      }
      this.trackOwnMove(validMoves[0]);
      return validMoves[0];
    } catch (error) {
      console.error(`[OpenAI single] Error:`, error);
      const fallback = randomAI.selectMove(context);
      this.trackOwnMove(fallback);
      return fallback;
    }
  }
}

// Claude Single-Turn AI
class ClaudeSingleTurnAI extends SingleTurnAIBase {
  readonly name: string;
  private client: Anthropic;
  private model: string;
  private useThinking: boolean;
  public tokenStats: TokenStats;

  constructor(apiKey: string, model: string, useThinking: boolean) {
    super();
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.useThinking = useThinking;
    const thinkStr = useThinking ? 'think' : 'no-think';
    this.name = `Claude (${model}) [${thinkStr}, single]`;
    this.tokenStats = createTokenStats();
  }

  async selectMove(context: LLMAIContext): Promise<Move> {
    const { validMoves, table, lastOpponentMove } = context;
    if (validMoves.length === 0) throw new Error('No valid moves');

    this.captureInitialTable(table, lastOpponentMove);
    this.trackOpponentMove(lastOpponentMove);

    if (validMoves.length === 1) {
      this.trackOwnMove(validMoves[0]);
      return validMoves[0];
    }

    try {
      const prompt = buildSingleTurnPrompt(context, this.roundMoveHistory, this.initialTable);
      const startTime = performance.now();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const requestParams: any = {
        model: this.model,
        max_tokens: this.useThinking ? 16000 : 1024,
        system: SYSTEM_INSTRUCTION_SINGLETURN,
        messages: [{ role: 'user', content: prompt }],
      };

      if (this.useThinking && this.model.includes('3-7') && validMoves.length > 1) {
        requestParams.thinking = { type: 'enabled', budget_tokens: 10000 };
      }

      const response = await this.client.messages.create(requestParams);

      const elapsed = performance.now() - startTime;
      this.tokenStats.requestCount++;
      this.tokenStats.totalTimeMs += elapsed;
      this.tokenStats.promptTokens += response.usage?.input_tokens || 0;
      this.tokenStats.responseTokens += response.usage?.output_tokens || 0;
      this.tokenStats.totalTokens += (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

      let text = '';
      for (const block of response.content) {
        if (block.type === 'text') {
          text = block.text;
          break;
        }
      }

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        const index = result.moveIndex;

        if (typeof index === 'number' && index >= 0 && index < validMoves.length) {
          this.trackOwnMove(validMoves[index]);
          return validMoves[index];
        }
      }

      this.trackOwnMove(validMoves[0]);
      return validMoves[0];
    } catch (error) {
      console.error(`[Claude single] Error:`, error);
      const fallback = randomAI.selectMove(context);
      this.trackOwnMove(fallback);
      return fallback;
    }
  }
}

// ============================================================================
// AI Factory
// ============================================================================

type AIType = 'random' | 'heuristic' | 'expert' | 'gemini' | 'openai' | 'claude';

interface AIConfig {
  type: AIType;
  model?: string;
  useThinking?: boolean;
  singleTurn?: boolean;
}

// Combined type for all AI players (sync, async, and expert)
type AnyAIPlayer = AIPlayer | AsyncAIPlayer;
type AnyGameAIPlayer = AnyAIPlayer | ExpertAIPlayer;

function createAI(config: AIConfig): AnyGameAIPlayer {
  const singleTurn = config.singleTurn ?? false;

  switch (config.type) {
    case 'random':
      return randomAI;
    case 'heuristic':
      return heuristicAI;
    case 'expert':
      return expertAI;
    case 'gemini': {
      const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error('GEMINI_API_KEY environment variable not set');
      if (singleTurn) {
        return new GeminiSingleTurnAI(apiKey, config.model || 'gemini-2.5-flash', config.useThinking ?? true);
      }
      return new GeminiAI(apiKey, config.model || 'gemini-2.5-flash', config.useThinking ?? true);
    }
    case 'openai': {
      const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
      if (!apiKey) throw new Error('OPENAI_API_KEY environment variable not set');
      if (singleTurn) {
        return new OpenAISingleTurnAI(apiKey, config.model || 'gpt-4o-mini');
      }
      return new OpenAIAI(apiKey, config.model || 'gpt-4o-mini');
    }
    case 'claude': {
      const apiKey = process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY environment variable not set');
      if (singleTurn) {
        return new ClaudeSingleTurnAI(apiKey, config.model || 'claude-sonnet-4-20250514', config.useThinking ?? true);
      }
      return new ClaudeAI(apiKey, config.model || 'claude-sonnet-4-20250514', config.useThinking ?? true);
    }
    default:
      throw new Error(`Unknown AI type: ${config.type}`);
  }
}

// ============================================================================
// Simulation Engine
// ============================================================================

interface CategoryStats {
  cards: number;
  coins: number;
  setteBello: number;
  prime: number;
  scopas: number;
}

interface GameResult {
  game: number;
  player1Score: number;
  player2Score: number;
  rounds: number;
  winner: 'player1' | 'player2' | 'tie';
  player1Categories: CategoryStats;
  player2Categories: CategoryStats;
}

interface SimulationStats {
  gamesPlayed: number;
  player1Wins: number;
  player2Wins: number;
  ties: number;
  player1TotalScore: number;
  player2TotalScore: number;
  totalRounds: number;
  player1Categories: CategoryStats;
  player2Categories: CategoryStats;
  player1TokenStats?: TokenStats;
  player2TokenStats?: TokenStats;
  gameResults: GameResult[];
}

interface RoundEndInfo {
  round: number;
  player1Score: number;
  player2Score: number;
  gameOver: boolean;
}

interface GameResultInternal {
  winner: 'player1' | 'player2' | 'tie';
  scores: { player1: number; player2: number };
  rounds: number;
  player1Categories: CategoryStats;
  player2Categories: CategoryStats;
}

async function runGame(
  player1: AnyGameAIPlayer,
  player2: AnyGameAIPlayer,
  targetScore: number,
  verbose: boolean,
  onRoundEnd?: (info: RoundEndInfo) => void
): Promise<GameResultInternal> {
  let state = createInitialState(targetScore);

  // Randomly select first dealer
  state.round.dealer = Math.random() < 0.5 ? 'human' : 'cpu';
  state = dealInitialCards(state);

  // Track last moves for LLM context
  const lastMoves: { human: Move | null; cpu: Move | null } = { human: null, cpu: null };

  // Track category stats across all rounds
  const player1Categories: CategoryStats = { cards: 0, coins: 0, setteBello: 0, prime: 0, scopas: 0 };
  const player2Categories: CategoryStats = { cards: 0, coins: 0, setteBello: 0, prime: 0, scopas: 0 };

  // Start round for async AIs
  if (!isExpertAI(player1) && isAsyncAI(player1) && player1.startRound) player1.startRound();
  if (!isExpertAI(player2) && isAsyncAI(player2) && player2.startRound) player2.startRound();

  while (state.status !== 'gameEnd') {
    // Play until round ends
    while (state.status === 'playing') {
      const currentPlayer = state.round.currentPlayer;
      const ai = currentPlayer === 'human' ? player1 : player2;
      const hand = state.players[currentPlayer].hand;
      const table = state.round.table;

      // Build context
      const selfPlayer = currentPlayer;
      const oppPlayer = currentPlayer === 'human' ? 'cpu' : 'human';
      const validMoves: Move[] = [];
      for (const card of hand) {
        validMoves.push(...getValidMoves(card, table, currentPlayer));
      }

      // Get move based on AI type
      let move: Move;
      if (isExpertAI(ai)) {
        // Expert AI needs full game state
        move = ai.selectMoveWithState(state);
      } else if (isAsyncAI(ai)) {
        const context: LLMAIContext = {
          hand,
          table,
          player: currentPlayer,
          scores: {
            self: state.scores[selfPlayer],
            opponent: state.scores[oppPlayer],
          },
          targetScore: state.targetScore,
          roundNumber: state.roundNumber,
          opponentHandCount: state.players[oppPlayer].hand.length,
          selfCapturedCount: state.players[selfPlayer].captured.length,
          opponentCapturedCount: state.players[oppPlayer].captured.length,
          deckCount: state.round.deck.length,
          lastOpponentMove: lastMoves[oppPlayer],
          lastSelfMove: lastMoves[selfPlayer],
          validMoves,
        };
        move = await ai.selectMove(context);
      } else {
        const context: AIContext = { hand, table, player: currentPlayer };
        move = (ai as AIPlayer).selectMove(context);
      }

      // Validate and execute
      if (!isValidMove(move, hand, table)) {
        // Fallback to first valid move
        move = validMoves[0];
      }

      lastMoves[currentPlayer] = move;
      state = executeMove(state, move);

      // Check for re-deal or round end
      const humanHandEmpty = state.players.human.hand.length === 0;
      const cpuHandEmpty = state.players.cpu.hand.length === 0;

      if (humanHandEmpty && cpuHandEmpty) {
        if (state.round.deck.length > 0) {
          // Re-deal
          const humanDeal = dealCards(state.round.deck, CARDS_PER_HAND);
          const cpuDeal = dealCards(humanDeal.remaining, CARDS_PER_HAND);
          state = {
            ...state,
            round: { ...state.round, deck: cpuDeal.remaining },
            players: {
              human: { ...state.players.human, hand: humanDeal.dealt },
              cpu: { ...state.players.cpu, hand: cpuDeal.dealt },
            },
          };
        } else {
          // Round end - undo scopa on last hand
          if (move.isScopa) {
            const playerState = state.players[move.player];
            state = {
              ...state,
              players: {
                ...state.players,
                [move.player]: {
                  ...playerState,
                  scopaCount: playerState.scopaCount - 1,
                  scopaCaptures: playerState.scopaCaptures.slice(0, -1),
                },
              },
            };
          }
          state = { ...state, status: 'roundEnd' };
        }
      }
    }

    // Process round end
    if (state.status === 'roundEnd') {
      // Award remaining table cards to last capture player
      if (state.round.table.length > 0 && state.round.lastCapture) {
        const lastPlayer = state.round.lastCapture;
        state = {
          ...state,
          round: { ...state.round, table: [] },
          players: {
            ...state.players,
            [lastPlayer]: {
              ...state.players[lastPlayer],
              captured: [...state.players[lastPlayer].captured, ...state.round.table],
            },
          },
        };
      }

      // Calculate scores
      const roundScores = calculateRoundScore(state);
      const newHumanScore = state.scores.human + roundScores.human.total;
      const newCpuScore = state.scores.cpu + roundScores.cpu.total;

      // Accumulate category stats
      player1Categories.cards += roundScores.human.cards;
      player1Categories.coins += roundScores.human.coins;
      player1Categories.setteBello += roundScores.human.setteBello;
      player1Categories.prime += roundScores.human.prime;
      player1Categories.scopas += roundScores.human.scopas;
      player2Categories.cards += roundScores.cpu.cards;
      player2Categories.coins += roundScores.cpu.coins;
      player2Categories.setteBello += roundScores.cpu.setteBello;
      player2Categories.prime += roundScores.cpu.prime;
      player2Categories.scopas += roundScores.cpu.scopas;

      if (verbose) {
        console.log(`  Round ${state.roundNumber}: P1=${roundScores.human.total} (${newHumanScore}) P2=${roundScores.cpu.total} (${newCpuScore})`);
      }

      // Update scores
      state = {
        ...state,
        scores: { human: newHumanScore, cpu: newCpuScore },
        lastRoundScores: roundScores,
      };

      // Check for game end
      const isGameOver = newHumanScore >= targetScore || newCpuScore >= targetScore;

      // Notify round end
      if (onRoundEnd) {
        onRoundEnd({
          round: state.roundNumber,
          player1Score: newHumanScore,
          player2Score: newCpuScore,
          gameOver: isGameOver,
        });
      }

      // End async AI rounds
      if (!isExpertAI(player1) && isAsyncAI(player1) && player1.endRound) player1.endRound();
      if (!isExpertAI(player2) && isAsyncAI(player2) && player2.endRound) player2.endRound();

      // Check for game end
      if (isGameOver) {
        state = { ...state, status: 'gameEnd' };
      } else {
        // Next round
        const newDealer: PlayerId = state.round.dealer === 'human' ? 'cpu' : 'human';
        state = {
          ...state,
          status: 'playing',
          round: {
            deck: [],
            table: [],
            currentPlayer: newDealer === 'human' ? 'cpu' : 'human',
            dealer: newDealer,
            lastCapture: null,
          },
          players: {
            human: { hand: [], captured: [], scopaCount: 0, scopaCaptures: [] },
            cpu: { hand: [], captured: [], scopaCount: 0, scopaCaptures: [] },
          },
          roundNumber: state.roundNumber + 1,
          lastRoundScores: undefined,
        };
        state = dealInitialCards(state);
        lastMoves.human = null;
        lastMoves.cpu = null;

        // Start new round for async AIs
        if (!isExpertAI(player1) && isAsyncAI(player1) && player1.startRound) player1.startRound();
        if (!isExpertAI(player2) && isAsyncAI(player2) && player2.startRound) player2.startRound();
      }
    }
  }

  // Determine winner
  let winner: 'player1' | 'player2' | 'tie';
  if (state.scores.human > state.scores.cpu) {
    winner = 'player1';
  } else if (state.scores.cpu > state.scores.human) {
    winner = 'player2';
  } else {
    winner = 'tie';
  }

  return {
    winner,
    scores: { player1: state.scores.human, player2: state.scores.cpu },
    rounds: state.roundNumber,
    player1Categories,
    player2Categories,
  };
}

async function runSimulation(
  player1Config: AIConfig,
  player2Config: AIConfig,
  numGames: number,
  targetScore: number,
  verbose: boolean,
  progressInterval: number
): Promise<SimulationStats> {
  const player1 = createAI(player1Config);
  const player2 = createAI(player2Config);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Scopa AI Simulation`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Player 1: ${player1.name}`);
  console.log(`Player 2: ${player2.name}`);
  console.log(`Games: ${numGames} | Target Score: ${targetScore}`);
  if (progressInterval > 0) {
    console.log(`Progress: every ${progressInterval} games`);
  }
  console.log(`${'='.repeat(60)}\n`);

  const stats: SimulationStats = {
    gamesPlayed: 0,
    player1Wins: 0,
    player2Wins: 0,
    ties: 0,
    player1TotalScore: 0,
    player2TotalScore: 0,
    totalRounds: 0,
    player1Categories: { cards: 0, coins: 0, setteBello: 0, prime: 0, scopas: 0 },
    player2Categories: { cards: 0, coins: 0, setteBello: 0, prime: 0, scopas: 0 },
    gameResults: [],
  };

  const startTime = Date.now();
  let lastOutputTime = 0;
  const OUTPUT_THROTTLE_MS = 500;
  let lastPrintedGame = 0;
  let currentProvisionalScore = '';
  const isTTY = process.stdout.isTTY;

  // Helper to output progress (throttled)
  const outputProgress = (force = false) => {
    // Only show provisional scores in TTY mode
    if (!isTTY) return;

    const now = Date.now();
    if (!force && now - lastOutputTime < OUTPUT_THROTTLE_MS) {
      return;
    }
    lastOutputTime = now;

    // Output provisional score for current game (overwrites line)
    if (currentProvisionalScore) {
      process.stdout.write(`\r${currentProvisionalScore}                    `);
    }
  };

  // Helper to finalize game output (moves to next line)
  const finalizeGameOutput = (game: number, p1Score: number, p2Score: number, tokenInfo: string = '') => {
    if (isTTY) {
      // Clear line completely, then print final score
      process.stdout.write(`\r\x1b[K`);
    }
    console.log(`Game ${game}: ${p1Score}-${p2Score}${tokenInfo}`);
    lastPrintedGame = game;
    currentProvisionalScore = '';
  };

  for (let game = 1; game <= numGames; game++) {
    if (verbose) {
      console.log(`\nGame ${game}/${numGames}:`);
    }

    // Callback for round updates
    const onRoundEnd = verbose ? undefined : (info: RoundEndInfo) => {
      // Build token usage string for LLM players
      let tokenInfo = '';
      if ('tokenStats' in player1 && (player1 as GeminiAI).tokenStats.totalTokens > 0) {
        tokenInfo += ` | P1: ${formatTokensCompact((player1 as GeminiAI).tokenStats)}`;
      }
      if ('tokenStats' in player2 && (player2 as GeminiAI).tokenStats.totalTokens > 0) {
        tokenInfo += ` | P2: ${formatTokensCompact((player2 as GeminiAI).tokenStats)}`;
      }

      if (info.gameOver) {
        // Game finished - print final score on new line
        finalizeGameOutput(game, info.player1Score, info.player2Score, tokenInfo);
      } else {
        // Game in progress - show provisional score (will be overwritten)
        currentProvisionalScore = `Game ${game}: ${info.player1Score}-${info.player2Score} (round ${info.round})${tokenInfo}`;
        outputProgress();
      }
    };

    const result = await runGame(player1, player2, targetScore, verbose, onRoundEnd);

    // Ensure final score is output even if callback wasn't called
    if (!verbose && lastPrintedGame < game) {
      let tokenInfo = '';
      if ('tokenStats' in player1 && (player1 as GeminiAI).tokenStats.totalTokens > 0) {
        tokenInfo += ` | P1: ${formatTokensCompact((player1 as GeminiAI).tokenStats)}`;
      }
      if ('tokenStats' in player2 && (player2 as GeminiAI).tokenStats.totalTokens > 0) {
        tokenInfo += ` | P2: ${formatTokensCompact((player2 as GeminiAI).tokenStats)}`;
      }
      finalizeGameOutput(game, result.scores.player1, result.scores.player2, tokenInfo);
    }

    stats.gamesPlayed++;
    stats.player1TotalScore += result.scores.player1;
    stats.player2TotalScore += result.scores.player2;
    stats.totalRounds += result.rounds;

    // Accumulate category stats
    stats.player1Categories.cards += result.player1Categories.cards;
    stats.player1Categories.coins += result.player1Categories.coins;
    stats.player1Categories.setteBello += result.player1Categories.setteBello;
    stats.player1Categories.prime += result.player1Categories.prime;
    stats.player1Categories.scopas += result.player1Categories.scopas;
    stats.player2Categories.cards += result.player2Categories.cards;
    stats.player2Categories.coins += result.player2Categories.coins;
    stats.player2Categories.setteBello += result.player2Categories.setteBello;
    stats.player2Categories.prime += result.player2Categories.prime;
    stats.player2Categories.scopas += result.player2Categories.scopas;

    // Store individual game result
    stats.gameResults.push({
      game,
      player1Score: result.scores.player1,
      player2Score: result.scores.player2,
      rounds: result.rounds,
      winner: result.winner,
      player1Categories: result.player1Categories,
      player2Categories: result.player2Categories,
    });

    if (result.winner === 'player1') {
      stats.player1Wins++;
    } else if (result.winner === 'player2') {
      stats.player2Wins++;
    } else {
      stats.ties++;
    }

    // Print intermediate summary at specified intervals
    if (progressInterval > 0 && game % progressInterval === 0 && game < numGames) {
      printIntermediateProgress(game, numGames, stats, player1.name, player2.name, player1, player2, startTime);
    }
  }

  // Collect token stats
  if ('tokenStats' in player1) {
    stats.player1TokenStats = (player1 as GeminiAI | OpenAIAI | ClaudeAI).tokenStats;
  }
  if ('tokenStats' in player2) {
    stats.player2TokenStats = (player2 as GeminiAI | OpenAIAI | ClaudeAI).tokenStats;
  }

  const totalTime = (Date.now() - startTime) / 1000;

  // Print results
  console.log(`\n\n${'='.repeat(60)}`);
  console.log(`RESULTS`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Total time: ${formatTime(totalTime)}`);
  console.log(`Games played: ${stats.gamesPlayed}`);
  console.log(`Avg rounds/game: ${(stats.totalRounds / stats.gamesPlayed).toFixed(1)}`);
  console.log();
  console.log(`${player1.name}:`);
  console.log(`  Wins: ${stats.player1Wins} (${(stats.player1Wins / stats.gamesPlayed * 100).toFixed(1)}%)`);
  console.log(`  Avg score: ${(stats.player1TotalScore / stats.gamesPlayed).toFixed(1)}`);
  if (stats.player1TokenStats) {
    console.log(`  API calls: ${stats.player1TokenStats.requestCount}`);
    let tokenBreakdown = `${stats.player1TokenStats.promptTokens.toLocaleString()} prompt, ${stats.player1TokenStats.responseTokens.toLocaleString()} response`;
    if (stats.player1TokenStats.thinkingTokens > 0) {
      tokenBreakdown += `, ${stats.player1TokenStats.thinkingTokens.toLocaleString()} thinking`;
    }
    console.log(`  Tokens: ${stats.player1TokenStats.totalTokens.toLocaleString()} (${tokenBreakdown})`);
    console.log(`  Avg time/call: ${(stats.player1TokenStats.totalTimeMs / stats.player1TokenStats.requestCount).toFixed(0)}ms`);
  }
  console.log();
  console.log(`${player2.name}:`);
  console.log(`  Wins: ${stats.player2Wins} (${(stats.player2Wins / stats.gamesPlayed * 100).toFixed(1)}%)`);
  console.log(`  Avg score: ${(stats.player2TotalScore / stats.gamesPlayed).toFixed(1)}`);
  if (stats.player2TokenStats) {
    console.log(`  API calls: ${stats.player2TokenStats.requestCount}`);
    let tokenBreakdown = `${stats.player2TokenStats.promptTokens.toLocaleString()} prompt, ${stats.player2TokenStats.responseTokens.toLocaleString()} response`;
    if (stats.player2TokenStats.thinkingTokens > 0) {
      tokenBreakdown += `, ${stats.player2TokenStats.thinkingTokens.toLocaleString()} thinking`;
    }
    console.log(`  Tokens: ${stats.player2TokenStats.totalTokens.toLocaleString()} (${tokenBreakdown})`);
    console.log(`  Avg time/call: ${(stats.player2TokenStats.totalTimeMs / stats.player2TokenStats.requestCount).toFixed(0)}ms`);
  }
  console.log();
  console.log(`Ties: ${stats.ties} (${(stats.ties / stats.gamesPlayed * 100).toFixed(1)}%)`);

  // Print category stats
  console.log();
  console.log(`Category Breakdown (total points across all games):`);
  const col1Width = Math.max(player1.name.length, 8) + 2;
  const col2Width = Math.max(player2.name.length, 8) + 2;
  console.log(`${''.padEnd(15)}${player1.name.padEnd(col1Width)}${player2.name}`);
  console.log(`  Cards:       ${String(stats.player1Categories.cards).padEnd(col1Width)}${stats.player2Categories.cards}`);
  console.log(`  Coins:       ${String(stats.player1Categories.coins).padEnd(col1Width)}${stats.player2Categories.coins}`);
  console.log(`  Sette Bello: ${String(stats.player1Categories.setteBello).padEnd(col1Width)}${stats.player2Categories.setteBello}`);
  console.log(`  Prime:       ${String(stats.player1Categories.prime).padEnd(col1Width)}${stats.player2Categories.prime}`);
  console.log(`  Scopas:      ${String(stats.player1Categories.scopas).padEnd(col1Width)}${stats.player2Categories.scopas}`);
  const p1CatTotal = stats.player1Categories.cards + stats.player1Categories.coins + stats.player1Categories.setteBello + stats.player1Categories.prime + stats.player1Categories.scopas;
  const p2CatTotal = stats.player2Categories.cards + stats.player2Categories.coins + stats.player2Categories.setteBello + stats.player2Categories.prime + stats.player2Categories.scopas;
  console.log(`  ${'─'.repeat(12 + col1Width + col2Width)}`);
  console.log(`  Total:       ${String(p1CatTotal).padEnd(col1Width)}${p2CatTotal}`);

  console.log(`${'='.repeat(60)}\n`);

  return stats;
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function formatTokenStats(stats: TokenStats): string {
  const tokensK = (stats.totalTokens / 1000).toFixed(1);
  return `${stats.requestCount} calls, ${tokensK}K tokens`;
}

function printIntermediateProgress(
  game: number,
  numGames: number,
  stats: SimulationStats,
  player1Name: string,
  player2Name: string,
  player1: AnyGameAIPlayer,
  player2: AnyGameAIPlayer,
  startTime: number
): void {
  const elapsed = (Date.now() - startTime) / 1000;
  const rate = game / elapsed;
  const eta = (numGames - game) / rate;
  const p1WinPct = (stats.player1Wins / game * 100).toFixed(1);
  const p2WinPct = (stats.player2Wins / game * 100).toFixed(1);

  console.log(`\n--- Progress: Game ${game}/${numGames} (${formatTime(elapsed)} elapsed, ETA: ${formatTime(eta)}) ---`);
  console.log(`${player1Name}: ${stats.player1Wins} wins (${p1WinPct}%), avg score ${(stats.player1TotalScore / game).toFixed(1)}`);
  if ('tokenStats' in player1) {
    console.log(`  Tokens: ${formatTokenStats((player1 as GeminiAI | OpenAIAI | ClaudeAI).tokenStats)}`);
  }
  console.log(`${player2Name}: ${stats.player2Wins} wins (${p2WinPct}%), avg score ${(stats.player2TotalScore / game).toFixed(1)}`);
  if ('tokenStats' in player2) {
    console.log(`  Tokens: ${formatTokenStats((player2 as GeminiAI | OpenAIAI | ClaudeAI).tokenStats)}`);
  }
  if (stats.ties > 0) {
    console.log(`Ties: ${stats.ties}`);
  }
}

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function parseArgs(): {
  player1: AIConfig;
  player2: AIConfig;
  games: number;
  target: number;
  verbose: boolean;
  interval: number;
  output?: string;
} {
  const args = process.argv.slice(2);

  let player1Type: AIType = 'heuristic';
  let player2Type: AIType = 'random';
  let player1Model: string | undefined;
  let player2Model: string | undefined;
  let useThinking = true;
  let singleTurn = false;
  let games = 10;
  let target = DEFAULT_TARGET_SCORE;
  let verbose = false;
  let interval = 10; // Print progress every N games (0 = only at end)
  let output: string | undefined;

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    const [key, value] = arg.split('=');
    switch (key) {
      case '--player1':
      case '-p1':
        player1Type = value as AIType;
        break;
      case '--player2':
      case '-p2':
        player2Type = value as AIType;
        break;
      case '--model1':
      case '-m1':
        player1Model = value;
        break;
      case '--model2':
      case '-m2':
        player2Model = value;
        break;
      case '--games':
      case '-g':
        games = parseInt(value, 10);
        break;
      case '--target':
      case '-t':
        target = parseInt(value, 10);
        break;
      case '--thinking':
        useThinking = value !== 'false' && value !== '0';
        break;
      case '--mode':
        singleTurn = value === 'single' || value === '1' || value === 'singleturn';
        break;
      case '--verbose':
      case '-v':
        verbose = true;
        break;
      case '--output':
      case '-o':
        output = value;
        break;
      case '--interval':
      case '-i':
        interval = parseInt(value, 10);
        break;
    }
  }

  return {
    player1: { type: player1Type, model: player1Model, useThinking, singleTurn },
    player2: { type: player2Type, model: player2Model, useThinking, singleTurn },
    games,
    target,
    verbose,
    interval,
    output,
  };
}

function printHelp(): void {
  console.log(`
Scopa AI Simulation CLI

Usage:
  npx tsx scripts/simulate.ts [options]

Options:
  --player1, -p1   AI type for player 1 (default: heuristic)
  --player2, -p2   AI type for player 2 (default: random)
  --model1, -m1    Model for player 1 (for LLM AIs)
  --model2, -m2    Model for player 2 (for LLM AIs)
  --games, -g      Number of games to run (default: 10)
  --target, -t     Target score per game (default: 11)
  --thinking       Enable thinking for LLMs (default: true)
  --mode           LLM conversation mode: 'multi' or 'single' (default: multi)
                   multi = chat session per round, single = full history each request
  --interval, -i   Print progress every N games (default: 10, 0=off)
  --verbose, -v    Show detailed output (per-round scores)
  --output, -o     Save results to JSON file
  --help, -h       Show this help

AI Types:
  random       Random move selection
  heuristic    Greedy strategy prioritizing valuable captures
  expert       ISMCTS with alpha-beta and determinization (from src/ai/expert.ts)
  gemini       Google Gemini (requires GEMINI_API_KEY)
  openai       OpenAI GPT (requires OPENAI_API_KEY)
  claude       Anthropic Claude (requires ANTHROPIC_API_KEY)

Examples:
  # Heuristic vs Random, 100 games
  npx tsx scripts/simulate.ts -p1=heuristic -p2=random -g=100

  # Expert vs Heuristic, 50 games
  npx tsx scripts/simulate.ts -p1=expert -p2=heuristic -g=50

  # Gemini vs Expert, 50 games
  GEMINI_API_KEY=xxx npx tsx scripts/simulate.ts -p1=gemini -p2=expert -g=50

  # Claude vs GPT, with specific models
  ANTHROPIC_API_KEY=xxx OPENAI_API_KEY=yyy npx tsx scripts/simulate.ts \\
    -p1=claude -m1=claude-sonnet-4-20250514 \\
    -p2=openai -m2=gpt-4o \\
    -g=20 --verbose

  # Run in background on server
  nohup npx tsx scripts/simulate.ts -p1=gemini -p2=expert -g=1000 > results.log 2>&1 &
`);
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const config = parseArgs();

  try {
    const stats = await runSimulation(
      config.player1,
      config.player2,
      config.games,
      config.target,
      config.verbose,
      config.interval
    );

    if (config.output) {
      const fs = await import('fs');
      const output = {
        config: {
          player1: config.player1,
          player2: config.player2,
          games: config.games,
          targetScore: config.target,
        },
        stats,
        timestamp: new Date().toISOString(),
      };
      fs.writeFileSync(config.output, JSON.stringify(output, null, 2));
      console.log(`Results saved to ${config.output}`);
    }
  } catch (error) {
    console.error('Simulation failed:', error);
    process.exit(1);
  }
}

main();
