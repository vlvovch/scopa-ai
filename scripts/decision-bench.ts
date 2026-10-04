// Benchmark: a "decision model" as a Scopa and Briscola opponent, against
// the game's own bots Furbo (heuristic) and Esperto (expert).
//
// A decision model (Jev by TypeSafe AI, reached through OpenRouter's alpha
// Decisions endpoint) writes no text: it picks one of the options it is
// given and returns a probability for each. A turn therefore becomes one
// "choice" question whose options are the legal moves the game engine
// computed, with the position as the state.
//
//   npx tsx scripts/decision-bench.ts --mock        # no network: checks the harness
//   npx tsx scripts/decision-bench.ts               # both games, both opponents, 40 deals each
//   npx tsx scripts/decision-bench.ts --baselines-only --deals 300   # the scale: Esperto and Scimmietta vs Furbo
//   npx tsx scripts/decision-bench.ts --game briscola --opponent furbo --deals 50
//   npx tsx scripts/decision-bench.ts --api chat --model openai/gpt-6-luna --game scopa   # a chat model, thinking off
//   npx tsx scripts/decision-bench.ts --help
//
// With --api chat an ordinary chat model plays instead, through OpenRouter's
// chat completions with the same key: by default with the app's own
// single-turn prompt (rules, the round's history, the numbered moves, a JSON
// answer), so the two kinds of model can be compared on the same deals.
//
// The OpenRouter key is read from the environment (OPENROUTER_API_KEY) or
// from local/openrouter.env (git-ignored), one line: OPENROUTER_API_KEY=...
// It is sent to the endpoint and nowhere else, and never printed.
//
// Every deal is played twice with the seats swapped, so both sides play the
// same cards once and the luck of the deal cancels in the margin. Each round
// stands alone (score 0-0). At every decision of the model the script also
// asks Furbo and Esperto what they would play there: how often the model
// agrees with Esperto is a measure of move quality that needs far fewer
// rounds than win rates do.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';

import { gameReducer, createInitialState } from '../src/games/scopa/reducer';
import { getValidMoves } from '../src/games/scopa/rules';
import { heuristicAI as scopaFurbo } from '../src/games/scopa/ai/heuristic';
import { randomAI as scopaRandom } from '../src/games/scopa/ai/random';
import { selectExpertMoveWithState } from '../src/games/scopa/ai/expert';
import { MOVE_JSON_SCHEMA } from '../src/ai/moveSchema';
import {
  SYSTEM_INSTRUCTION_ON_DEVICE as SCOPA_ON_DEVICE,
  SYSTEM_INSTRUCTION_SINGLETURN as SCOPA_SINGLETURN,
  buildSingleTurnPrompt as scopaSingleTurnPrompt,
  formatCards as scopaCards,
  formatMove as scopaPlainMove,
  formatOnDeviceMove as scopaSpelledMove,
  buildRoundMemory as scopaMemory,
} from '../src/games/scopa/ai/prompts';
import type { Card, GameState as ScopaState, Move as ScopaMove, PlayerId } from '../src/games/scopa/types';
import type { LLMAIContext as ScopaContext } from '../src/games/scopa/ai/types';

import { applyMove } from '../src/games/briscola/rules';
import { createDeck, shuffleDeck, dealInitialHands } from '../src/games/briscola/deck';
import { calculateRoundScore } from '../src/games/briscola/scoring';
import { heuristicAI as briscolaFurbo } from '../src/games/briscola/ai/heuristic';
import { randomAI as briscolaRandom } from '../src/games/briscola/ai/random';
import { expertAI as briscolaEsperto } from '../src/games/briscola/ai/expert';
import {
  SYSTEM_INSTRUCTION_ON_DEVICE as BRISCOLA_ON_DEVICE,
  SYSTEM_INSTRUCTION_SINGLETURN as BRISCOLA_SINGLETURN,
  buildSingleTurnPrompt as briscolaSingleTurnPrompt,
  formatCard as briscolaCard,
  formatCards as briscolaCards,
  formatMove as briscolaPlainMove,
  formatOnDeviceMove as briscolaSpelledMove,
  buildRoundMemory as briscolaMemory,
} from '../src/games/briscola/ai/prompts';
import type { GameState as BriscolaState, Move as BriscolaMove } from '../src/games/briscola/types';
import type { LLMAIContext as BriscolaContext } from '../src/games/briscola/ai/types';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

type Game = 'scopa' | 'briscola';
type BotName = 'model' | 'furbo' | 'esperto' | 'scimmietta';
type PromptStyle = 'spelled' | 'plain' | 'app';
type Api = 'decisions' | 'chat';
type Thinking = 'off' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

interface Options {
  games: Game[];
  opponents: BotName[];
  deals: number;
  concurrency: number;
  api: Api;
  thinking: Thinking;
  prompt: PromptStyle;
  model: string;
  baseUrl: string;
  mock: boolean;
  baselines: boolean;
  /** Play only the reference pairings: no model, no key, no requests. */
  baselinesOnly: boolean;
  agreement: boolean;
  maxCost: number;
  show: number;
  out: string | null;
}

const HELP = `Decision-model benchmark (Scopa and Briscola)

  --game scopa|briscola|both      default both
  --opponent furbo|esperto|both   default both
  --deals N                       deals per pairing, each played twice with seats swapped (default 40)
  --concurrency K                 rounds in flight (default 4)
  --api decisions|chat            decisions: a decision model (default); chat: a chat model answering in JSON
  --thinking off|low|medium|high|xhigh|max   chat only (default off); the model must list the level
  --prompt spelled|plain|app      spelled: what matters + round memory + each move's outcome (default for decisions)
                                  plain: bare rules, position and moves
                                  app: the app's own single-turn prompt with the round's history (chat only, its default)
  --model ID                      default typesafe/jev-1.13
  --base-url URL                  default https://openrouter.ai/api/alpha, or https://openrouter.ai/api/v1 for chat
  --baselines                     also play Esperto and Scimmietta against Furbo (no requests) for scale
  --baselines-only                play only those reference pairings: no key needed
  --no-agreement                  skip asking Furbo and Esperto at the model's decisions
  --max-cost USD                  stop when the reported cost passes this (default 1)
  --show N                        print the first N requests and answers of each game (default 1)
  --out FILE                      results JSON (default local/bench/decision-bench-<time>.json)
  --mock                          no network: the model answers at random

Key: OPENROUTER_API_KEY in the environment, or a line OPENROUTER_API_KEY=... in local/openrouter.env`;

function parseOptions(argv: string[]): Options {
  const o: Options = {
    games: ['scopa', 'briscola'], opponents: ['furbo', 'esperto'], deals: 40, concurrency: 4,
    api: 'decisions', thinking: 'off',
    prompt: 'spelled', model: 'typesafe/jev-1.13', baseUrl: '',
    mock: false, baselines: false, baselinesOnly: false, agreement: true, maxCost: 1, show: 1, out: null,
  };
  const fail = (message: string): never => { console.error(`${message}\n\n${HELP}`); process.exit(2); };
  let promptGiven = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = (): string => argv[++i] ?? fail(`${arg} needs a value`);
    const positive = (): number => { const n = Number(value()); return Number.isFinite(n) && n > 0 ? n : fail(`${arg} needs a positive number`); };
    switch (arg) {
      case '--help': case '-h': console.log(HELP); process.exit(0); break;
      case '--game': { const v = value(); o.games = v === 'both' ? ['scopa', 'briscola'] : v === 'scopa' || v === 'briscola' ? [v] : fail(`unknown game ${v}`); break; }
      case '--opponent': { const v = value(); o.opponents = v === 'both' ? ['furbo', 'esperto'] : v === 'furbo' || v === 'esperto' ? [v] : fail(`unknown opponent ${v}`); break; }
      case '--deals': o.deals = Math.floor(positive()); break;
      case '--concurrency': o.concurrency = Math.floor(positive()); break;
      case '--api': { const v = value(); o.api = v === 'decisions' || v === 'chat' ? v : fail(`unknown api ${v}`); break; }
      case '--thinking': { const v = value(); o.thinking = v === 'off' || v === 'low' || v === 'medium' || v === 'high' || v === 'xhigh' || v === 'max' ? v : fail(`unknown thinking level ${v}`); break; }
      case '--prompt': { const v = value(); o.prompt = v === 'spelled' || v === 'plain' || v === 'app' ? v : fail(`unknown prompt style ${v}`); promptGiven = true; break; }
      case '--model': o.model = value(); break;
      case '--base-url': o.baseUrl = value().replace(/\/+$/, ''); break;
      case '--baselines': o.baselines = true; break;
      case '--baselines-only': o.baselines = true; o.baselinesOnly = true; break;
      case '--no-agreement': o.agreement = false; break;
      case '--max-cost': o.maxCost = positive(); break;
      case '--show': o.show = Math.floor(Number(value())) || 0; break;
      case '--out': o.out = value(); break;
      case '--mock': o.mock = true; break;
      default: fail(`unknown option ${arg}`);
    }
  }
  if (o.api === 'chat' && !promptGiven) o.prompt = 'app';
  if (o.api === 'decisions' && o.prompt === 'app') fail('--prompt app needs --api chat');
  if (!o.baseUrl) o.baseUrl = o.api === 'chat' ? 'https://openrouter.ai/api/v1' : 'https://openrouter.ai/api/alpha';
  return o;
}

const OPTIONS = parseOptions(process.argv.slice(2));

/** The key from the environment or local/openrouter.env. Never logged. */
function loadKey(): string | null {
  const fromEnv = process.env.OPENROUTER_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const file = path.resolve(process.cwd(), 'local', 'openrouter.env');
  if (!fs.existsSync(file)) return null;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^\s*(?:export\s+)?OPENROUTER_API_KEY\s*=\s*(.+?)\s*$/);
    if (match) return match[1].replace(/^['"]|['"]$/g, '') || null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The decision request
// ---------------------------------------------------------------------------

/** USD per input token on OpenRouter (output is free); used only when a response carries no cost. */
const PRICE_PER_INPUT_TOKEN = 0.042 / 1_000_000;
// A chat model that thinks hard can take minutes over one move.
const REQUEST_TIMEOUT_MS = OPTIONS.api !== 'chat' ? 20_000 : ['high', 'xhigh', 'max'].includes(OPTIONS.thinking) ? 300_000 : 90_000;
const RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 524, 529]);
const RETRY_DELAYS_MS = [500, 1500, 4000];

/** Stops the whole run: the key is missing, wrong or out of credit, or the request itself is malformed. */
class FatalError extends Error {}

interface Decision {
  /** Index of the chosen option. */
  index: number;
  confidence: number | null;
  /** Probability of each option, in option order; null when the answer carries none. */
  probabilities: number[] | null;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cost: number;
  costReported: boolean;
}

/** One turn, in both forms: a decision request (state + options) and a chat request (system + user). */
interface Question {
  state: string;
  options: string[];
  system: string;
  user: string;
}

/** What the chat request needs to know about the model (from OpenRouter's catalogue). */
interface ChatModel {
  reasoning: Record<string, unknown> | null;
  structuredOutputs: boolean;
  jsonMode: boolean;
  inputPrice: number;
  outputPrice: number;
}
let chatModel: ChatModel | null = null;

/** Read the model's catalogue entry: how to switch thinking off, whether it takes a JSON schema, its prices. */
async function loadChatModel(): Promise<ChatModel> {
  const response = await fetch(`${OPTIONS.baseUrl}/models`);
  const data = ((await response.json()) as { data?: Array<Record<string, unknown>> }).data ?? [];
  const entry = data.find((m) => m.id === OPTIONS.model);
  if (!entry) throw new FatalError(`${OPTIONS.model} is not in the catalogue at ${OPTIONS.baseUrl}/models`);
  const supported = Array.isArray(entry.supported_parameters) ? (entry.supported_parameters as string[]) : [];
  const meta = (entry.reasoning ?? null) as { mandatory?: boolean; supported_efforts?: string[] } | null;
  const efforts = meta?.supported_efforts ?? [];
  // The same choice the app makes (resolveReasoning in src/ai/openrouterProvider.ts).
  let reasoning: Record<string, unknown> | null = null;
  if (supported.includes('reasoning')) {
    if (OPTIONS.thinking !== 'off') reasoning = { effort: OPTIONS.thinking };
    else if (efforts.includes('none')) reasoning = { effort: 'none' };
    else if (meta?.mandatory) reasoning = efforts.includes('minimal') ? { effort: 'minimal' } : efforts.includes('low') ? { effort: 'low' } : null;
    else reasoning = { enabled: false };
  }
  const pricing = (entry.pricing ?? {}) as { prompt?: string; completion?: string };
  return {
    reasoning,
    structuredOutputs: supported.includes('structured_outputs'),
    jsonMode: supported.includes('response_format'),
    inputPrice: Number(pricing.prompt) || 0,
    outputPrice: Number(pricing.completion) || 0,
  };
}

/** The first JSON object in a reply (a chat model may wrap it in a code fence). */
function jsonObjectIn(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

interface ApiStats {
  calls: number;
  retries: number;
  /** Why requests were retried: the HTTP status, or the kind of error. */
  retryReasons: Record<string, number>;
  latencies: number[];
  inputTokens: number;
  outputTokens: number;
  /** Thinking tokens inside the output (chat models). */
  reasoningTokens: number;
  cost: number;
  costEstimated: boolean;
}

const api: ApiStats = { calls: 0, retries: 0, retryReasons: {}, latencies: [], inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cost: 0, costEstimated: false };
const KEY = OPTIONS.mock || OPTIONS.baselinesOnly ? 'unused' : loadKey();
const shown: Record<Game, number> = { scopa: 0, briscola: 0 };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function decide(game: Game, question: Question, instructions: string): Promise<Decision> {
  if (api.cost > OPTIONS.maxCost) throw new FatalError(`cost limit reached: $${api.cost.toFixed(4)} > $${OPTIONS.maxCost} (--max-cost)`);
  const { options } = question;
  const chat = OPTIONS.api === 'chat';
  let body: Record<string, unknown>;
  if (chat) {
    body = { model: OPTIONS.model, messages: [{ role: 'system', content: question.system }, { role: 'user', content: question.user }] };
    if (chatModel?.structuredOutputs) {
      body.response_format = { type: 'json_schema', json_schema: { name: 'move', strict: true, schema: { ...MOVE_JSON_SCHEMA, additionalProperties: false } } };
      body.provider = { require_parameters: true };
    } else if (chatModel?.jsonMode) {
      body.response_format = { type: 'json_object' };
    }
    if (chatModel?.reasoning) body.reasoning = chatModel.reasoning;
  } else {
    const criteria: Record<string, string> = {};
    options.forEach((text, i) => { criteria[`m${i}`] = text; });
    body = { model: OPTIONS.model, state: question.state, questions: { move: { type: 'choice', instructions, criteria } } };
  }
  const print = shown[game] < OPTIONS.show;
  if (print) {
    shown[game]++;
    console.log(`\n----- ${game}: request -----\n${JSON.stringify(body, null, 2)}`);
  }

  if (OPTIONS.mock) {
    const index = Math.floor(Math.random() * options.length);
    const inputTokens = Math.round(JSON.stringify(body).length / 4);
    const decision: Decision = {
      index, confidence: 0.5, probabilities: options.map((_, i) => (i === index ? 0.6 : 0.4 / Math.max(1, options.length - 1))),
      latencyMs: 1, inputTokens, outputTokens: 0, reasoningTokens: 0, cost: inputTokens * PRICE_PER_INPUT_TOKEN, costReported: false,
    };
    recordCall(decision);
    if (print) console.log(`----- ${game}: mock answer -----\nm${index}`);
    return decision;
  }

  let lastError = 'no attempt made';
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      api.retries++;
      await sleep(RETRY_DELAYS_MS[attempt - 1]);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const started = performance.now();
    try {
      const response = await fetch(`${OPTIONS.baseUrl}/${chat ? 'chat/completions' : 'decisions'}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://playscopa.net',
          'X-Title': 'Scopa AI benchmark',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      // The answer is complete when its body is: a chat endpoint sends the headers early.
      const text = await response.text();
      const latencyMs = performance.now() - started;
      if (!response.ok) {
        lastError = `HTTP ${response.status}: ${text.slice(0, 300)}`;
        if (RETRY_STATUSES.has(response.status)) { noteRetry(`HTTP ${response.status}`); continue; }
        throw new FatalError(lastError);
      }
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(text) as Record<string, unknown>;
      } catch {
        lastError = `not JSON: ${text.slice(0, 200)}`;
        noteRetry('answer not JSON');
        continue;
      }
      const usage = (json.usage ?? {}) as Record<string, unknown>;
      const costReported = typeof usage.cost === 'number';
      const number = (value: unknown) => (typeof value === 'number' ? value : 0);
      let decision: Decision;
      if (chat) {
        const message = (json.choices as Array<{ message?: { content?: unknown } }> | undefined)?.[0]?.message;
        const parsed = typeof message?.content === 'string' ? jsonObjectIn(message.content) : null;
        const index = typeof parsed?.moveIndex === 'number' && Number.isInteger(parsed.moveIndex) ? parsed.moveIndex : -1;
        // An answer that names no legal move is the model's answer, not a transport error: no retry.
        const inputTokens = number(usage.prompt_tokens);
        const outputTokens = number(usage.completion_tokens);
        const reasoningTokens = number((usage.completion_tokens_details as Record<string, unknown> | undefined)?.reasoning_tokens);
        decision = {
          index: index >= 0 && index < options.length ? index : -1,
          confidence: null,
          probabilities: null,
          latencyMs,
          inputTokens,
          outputTokens,
          reasoningTokens,
          cost: costReported ? (usage.cost as number) : inputTokens * (chatModel?.inputPrice ?? 0) + outputTokens * (chatModel?.outputPrice ?? 0),
          costReported,
        };
      } else {
        const answer = (json.answers as Record<string, Record<string, unknown>> | undefined)?.move;
        const choice = typeof answer?.choice === 'string' ? answer.choice : '';
        const index = /^m\d+$/.test(choice) ? Number(choice.slice(1)) : -1;
        if (index < 0 || index >= options.length) {
          lastError = `answer names no option: ${text.slice(0, 300)}`;
          noteRetry('answer names no option');
          continue;
        }
        const probabilityMap = answer?.probabilities as Record<string, unknown> | undefined;
        const probabilities = probabilityMap && typeof probabilityMap === 'object'
          ? options.map((_, i) => (typeof probabilityMap[`m${i}`] === 'number' ? (probabilityMap[`m${i}`] as number) : 0))
          : null;
        const inputTokens = number(usage.input_tokens);
        decision = {
          index,
          confidence: typeof answer?.confidence === 'number' ? answer.confidence : null,
          probabilities,
          latencyMs,
          inputTokens,
          outputTokens: 0,
          reasoningTokens: 0,
          cost: costReported ? (usage.cost as number) : inputTokens * PRICE_PER_INPUT_TOKEN,
          costReported,
        };
      }
      recordCall(decision);
      if (print) console.log(`----- ${game}: answer (${latencyMs.toFixed(0)} ms) -----\n${JSON.stringify(json, null, 2)}`);
      return decision;
    } catch (err) {
      if (err instanceof FatalError) throw err;
      lastError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      noteRetry(err instanceof Error ? err.name : 'error');
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(lastError);
}

function noteRetry(reason: string): void {
  api.retryReasons[reason] = (api.retryReasons[reason] ?? 0) + 1;
}

function recordCall(decision: Decision): void {
  api.calls++;
  api.latencies.push(decision.latencyMs);
  api.inputTokens += decision.inputTokens;
  api.outputTokens += decision.outputTokens;
  api.reasoningTokens += decision.reasoningTokens;
  api.cost += decision.cost;
  if (!decision.costReported) api.costEstimated = true;
}

// ---------------------------------------------------------------------------
// What the model's decisions looked like, per game
// ---------------------------------------------------------------------------

interface ModelStats {
  /** Turns with one legal move: played without a request. */
  forced: number;
  decisions: number;
  /** Requests that failed after the retries: Furbo's move was played instead. */
  fallbacks: number;
  /** Answers of a chat model that named no legal move: Furbo's move was played instead. */
  invalid: number;
  optionsTotal: number;
  confidenceTotal: number;
  confidenceCount: number;
  /** How often the option with the highest probability was the one chosen. */
  topChosen: number;
  withProbabilities: number;
  /** How often the first listed option was chosen, and how often it is Esperto's move: a check for position bias. */
  choseFirst: number;
  espertoFirst: number;
  agreeFurbo: number;
  agreeEsperto: number;
  /** Furbo's agreement with Esperto at the same positions, for scale. */
  furboAgreesEsperto: number;
  compared: number;
}

const newModelStats = (): ModelStats => ({
  forced: 0, decisions: 0, fallbacks: 0, invalid: 0, optionsTotal: 0, confidenceTotal: 0, confidenceCount: 0,
  topChosen: 0, withProbabilities: 0, choseFirst: 0, espertoFirst: 0, agreeFurbo: 0, agreeEsperto: 0, furboAgreesEsperto: 0, compared: 0,
});
const modelStats: Record<Game, ModelStats> = { scopa: newModelStats(), briscola: newModelStats() };
/** Requests that failed one after the other: past the limit the endpoint is taken to be down. */
let failuresInARow = 0;
const MAX_FAILURES_IN_A_ROW = 8;

const INSTRUCTIONS = 'You are the player to move. Choose the move that gives you the best chance of winning the round.';
/** The on-device instruction up to the part about its own input and output format. */
const brief = (instruction: string) => instruction.split('\n\nYou cannot see')[0];
const stripIndex = (line: string) => line.replace(/^\[\d+\]\s*/, '');

/**
 * Ask the model for one of `options`; on failure play `fallback` (the index
 * of Furbo's move). `reference` gives the indices Furbo and Esperto would play.
 */
async function modelChoice(
  game: Game,
  question: Question,
  fallback: number,
  reference: (() => { furbo: number; esperto: number }) | null
): Promise<number> {
  const stats = modelStats[game];
  const { options } = question;
  let index: number;
  try {
    const decision = await decide(game, question, INSTRUCTIONS);
    index = decision.index;
    failuresInARow = 0;
    if (index < 0) {
      stats.invalid++;
      return fallback;
    }
    stats.decisions++;
    stats.optionsTotal += options.length;
    if (decision.confidence !== null) { stats.confidenceTotal += decision.confidence; stats.confidenceCount++; }
    if (decision.probabilities) {
      stats.withProbabilities++;
      if (decision.probabilities[index] >= Math.max(...decision.probabilities)) stats.topChosen++;
    }
  } catch (err) {
    if (err instanceof FatalError) throw err;
    const reason = err instanceof Error ? err.message : String(err);
    if (++failuresInARow >= MAX_FAILURES_IN_A_ROW) throw new FatalError(`${failuresInARow} requests in a row failed, the last with: ${reason}`);
    stats.fallbacks++;
    if (stats.fallbacks <= 5) console.warn(`[${game}] request failed, Furbo's move played: ${reason}`);
    return fallback;
  }
  if (reference) {
    const { furbo, esperto } = reference();
    stats.compared++;
    if (index === 0) stats.choseFirst++;
    if (esperto === 0) stats.espertoFirst++;
    if (index === furbo) stats.agreeFurbo++;
    if (index === esperto) stats.agreeEsperto++;
    if (furbo === esperto) stats.furboAgreesEsperto++;
  }
  return index;
}

// ---------------------------------------------------------------------------
// Scopa
// ---------------------------------------------------------------------------

const other = (p: PlayerId): PlayerId => (p === 'human' ? 'cpu' : 'human');

function scopaMoves(state: ScopaState): ScopaMove[] {
  const player = state.round.currentPlayer;
  return state.players[player].hand.flatMap((card) => getValidMoves(card, state.round.table, player));
}

const sameScopaMove = (a: ScopaMove, b: ScopaMove) =>
  a.cardPlayed.id === b.cardPlayed.id &&
  a.capturedCards.length === b.capturedCards.length &&
  a.capturedCards.every((c) => b.capturedCards.some((d) => d.id === c.id));

function scopaContext(state: ScopaState, moves: ScopaMove[]): ScopaContext {
  const player = state.round.currentPlayer;
  const opponent = other(player);
  return {
    hand: state.players[player].hand,
    table: state.round.table,
    player,
    scores: { self: state.scores[player], opponent: state.scores[opponent] },
    targetScore: state.targetScore,
    roundNumber: state.roundNumber,
    opponentHandCount: state.players[opponent].hand.length,
    selfCapturedCount: state.players[player].captured.length,
    opponentCapturedCount: state.players[opponent].captured.length,
    deckCount: state.round.deck.length,
    lastOpponentMove: null,
    lastSelfMove: null,
    validMoves: moves,
    selfCaptured: state.players[player].captured,
    opponentCaptured: state.players[opponent].captured,
    selfScopaCount: state.players[player].scopaCount,
    opponentScopaCount: state.players[opponent].scopaCount,
  };
}

const SCOPA_PLAIN_RULES = `You play Scopa, the Italian card game, against one opponent. Cards are named "value of suit": values 1 to 10, suits coins, cups, swords and clubs. A played card captures a table card of the same value, or several table cards that add up to its value; otherwise it stays on the table. Points at the end of the round: most cards, most coins, the 7 of coins, the best primiera, and one point for every scopa (a capture that empties the table).`;

/** What a chat model is asked to return, in the app's own words. */
const JSON_ANSWER = 'OUTPUT: JSON with moveIndex (0-based) and reasoning.';
const numbered = (options: string[]) => `Valid moves:\n${options.map((text, i) => `[${i}] ${text}`).join('\n')}\n\nChoose the best move (0-${options.length - 1}).`;

interface ScopaRound { history: ScopaMove[]; initialTable: Card[] }

function scopaQuestion(context: ScopaContext, round: ScopaRound): Question {
  if (OPTIONS.prompt === 'app') {
    return {
      state: '', options: context.validMoves.map((move, i) => stripIndex(scopaPlainMove(move, i))),
      system: SCOPA_SINGLETURN, user: scopaSingleTurnPrompt(context, round.history, round.initialTable),
    };
  }
  const spelled = OPTIONS.prompt === 'spelled';
  const lines = [
    spelled ? brief(SCOPA_ON_DEVICE) : SCOPA_PLAIN_RULES,
    '',
    '--- POSITION ---',
    `Deck: ${context.deckCount} cards left${context.deckCount === 0 ? ' (last hand of the round: whoever captures last takes the cards left on the table)' : ''}`,
    `Your pile: ${context.selfCapturedCount} cards | Opponent pile: ${context.opponentCapturedCount} cards | Opponent hand: ${context.opponentHandCount} cards`,
  ];
  if (spelled) lines.push(scopaMemory(context));
  lines.push(`Table: ${context.table.length ? scopaCards(context.table) : 'empty'}`, `Your hand: ${scopaCards(context.hand)}`);
  const describe = spelled ? scopaSpelledMove : scopaPlainMove;
  const options = context.validMoves.map((move, i) => stripIndex(describe(move, i)));
  const [rules, ...position] = lines;
  return { state: lines.join('\n'), options, system: `${rules}\n\n${JSON_ANSWER}`, user: `${position.join('\n').trim()}\n\n${numbered(options)}` };
}

async function scopaMove(state: ScopaState, bot: BotName, round: ScopaRound): Promise<ScopaMove> {
  const player = state.round.currentPlayer;
  const simple = { hand: state.players[player].hand, table: state.round.table, player };
  if (bot === 'furbo') return scopaFurbo.selectMove(simple);
  if (bot === 'scimmietta') return scopaRandom.selectMove(simple);
  if (bot === 'esperto') return selectExpertMoveWithState(state);

  const moves = scopaMoves(state);
  if (moves.length === 1) { modelStats.scopa.forced++; return moves[0]; }
  const question = scopaQuestion(scopaContext(state, moves), round);
  const indexOf = (move: ScopaMove) => moves.findIndex((m) => sameScopaMove(m, move));
  const furbo = indexOf(scopaFurbo.selectMove(simple));
  const reference = OPTIONS.agreement ? () => ({ furbo, esperto: indexOf(selectExpertMoveWithState(state)) }) : null;
  return moves[await modelChoice('scopa', question, Math.max(0, furbo), reference)];
}

/** One dealt round, score 0-0, a random dealer. */
function dealScopa(): ScopaState {
  return gameReducer(createInitialState(11), { type: 'START_GAME', payload: { targetScore: 11, gameMode: 'cpuVsCPU' } });
}

async function playScopaRound(initial: ScopaState, seats: Record<PlayerId, BotName>): Promise<Record<PlayerId, number>> {
  let state = initial;
  const round: ScopaRound = { history: [], initialTable: initial.round.table };
  for (let plies = 0; state.status === 'playing'; plies++) {
    if (plies > 100) throw new Error('scopa: the round does not end');
    const move = await scopaMove(state, seats[state.round.currentPlayer], round);
    const next = gameReducer(state, { type: 'PLAY_CARD', payload: { move } });
    if (next === state) throw new Error(`scopa: the engine refused a move by ${seats[state.round.currentPlayer]}`);
    round.history.push(move);
    state = next;
  }
  if (state.status !== 'roundEnd') throw new Error(`scopa: unexpected status ${state.status}`);
  state = gameReducer(state, { type: 'END_ROUND' });
  const scores = state.lastRoundScores!;
  return { human: scores.human.total, cpu: scores.cpu.total };
}

// ---------------------------------------------------------------------------
// Briscola
// ---------------------------------------------------------------------------

function briscolaContext(state: BriscolaState, history: BriscolaMove[]): BriscolaContext {
  const player = state.round.currentPlayer;
  const opponent = other(player);
  return {
    hand: state.players[player].hand,
    player,
    trump: state.round.trump,
    trumpSuit: state.round.trumpSuit,
    leadCard: state.round.trick.leadCard,
    deckCount: state.round.deck.length,
    myCaptured: state.players[player].captured,
    oppCaptured: state.players[opponent].captured,
    scores: { self: 0, opponent: 0 },
    targetScore: 1,
    roundNumber: 1,
    opponentHandCount: state.players[opponent].hand.length,
    lastOpponentMove: null,
    lastSelfMove: null,
    validMoves: state.players[player].hand.map((card) => ({ player, cardPlayed: card })),
    roundMoveHistory: history,
  };
}

const BRISCOLA_PLAIN_RULES = `You play Briscola, the Italian trick-taking card game, against one opponent. Cards are named "rank of suit" with their points in brackets: Ace 11, 3 10, King 4, Knight 3, Knave 2, the other ranks 0. One suit is the trump. A trump beats any non-trump; between two trumps, or two cards of the suit led, the higher rank wins (Ace, 3, King, Knight, Knave, 7, 6, 5, 4, 2); a non-trump of another suit never wins. The winner of a trick takes both cards. 61 of the 120 points win the round.`;

function briscolaQuestion(context: BriscolaContext): Question {
  if (OPTIONS.prompt === 'app') {
    return {
      state: '', options: context.validMoves.map((move, i) => stripIndex(briscolaPlainMove(move, i))),
      system: BRISCOLA_SINGLETURN, user: briscolaSingleTurnPrompt(context),
    };
  }
  const spelled = OPTIONS.prompt === 'spelled';
  const lines = [
    spelled ? brief(BRISCOLA_ON_DEVICE) : BRISCOLA_PLAIN_RULES,
    '',
    '--- POSITION ---',
    `Trump: ${briscolaCard(context.trump)} (suit: ${context.trumpSuit})`,
    `Deck: ${context.deckCount} cards left | Opponent hand: ${context.opponentHandCount} cards`,
  ];
  if (spelled) lines.push(briscolaMemory(context));
  lines.push(
    context.leadCard ? `The opponent led ${briscolaCard(context.leadCard)}. You are following.` : 'You are leading the trick: the opponent answers after you.',
    `Your hand: ${briscolaCards(context.hand)}`
  );
  const describe = (move: BriscolaMove, i: number) => (spelled ? briscolaSpelledMove(move, i, context) : briscolaPlainMove(move, i));
  const options = context.validMoves.map((move, i) => stripIndex(describe(move, i)));
  const [rules, ...position] = lines;
  return { state: lines.join('\n'), options, system: `${rules}\n\n${JSON_ANSWER}`, user: `${position.join('\n').trim()}\n\n${numbered(options)}` };
}

async function briscolaMove(state: BriscolaState, bot: BotName, history: BriscolaMove[]): Promise<BriscolaMove> {
  const context = briscolaContext(state, history);
  if (bot === 'furbo') return briscolaFurbo.selectMove(context);
  if (bot === 'scimmietta') return briscolaRandom.selectMove(context);
  if (bot === 'esperto') return briscolaEsperto.selectMove(context);

  const moves = context.validMoves;
  if (moves.length === 1) { modelStats.briscola.forced++; return moves[0]; }
  const question = briscolaQuestion(context);
  const indexOf = (move: BriscolaMove) => moves.findIndex((m) => m.cardPlayed.id === move.cardPlayed.id);
  const furbo = indexOf(briscolaFurbo.selectMove(context));
  const reference = OPTIONS.agreement ? () => ({ furbo, esperto: indexOf(briscolaEsperto.selectMove(context)) }) : null;
  return moves[await modelChoice('briscola', question, Math.max(0, furbo), reference)];
}

function dealBriscola(): BriscolaState {
  const dealer: PlayerId = Math.random() < 0.5 ? 'human' : 'cpu';
  const leader = other(dealer);
  const initial = dealInitialHands(shuffleDeck(createDeck()), dealer);
  return {
    status: 'playing',
    round: {
      deck: initial.deck,
      trump: initial.trump,
      trumpSuit: initial.trump.suit,
      trick: { leadCard: null, leader },
      currentPlayer: leader,
      dealer,
    },
    players: {
      human: { hand: initial.hands.human, captured: [] },
      cpu: { hand: initial.hands.cpu, captured: [] },
    },
    scores: { human: 0, cpu: 0 },
    roundHistory: [],
    roundNumber: 1,
    targetScore: 1,
  };
}

async function playBriscolaRound(initial: BriscolaState, seats: Record<PlayerId, BotName>): Promise<Record<PlayerId, number>> {
  let state = initial;
  const history: BriscolaMove[] = [];
  for (let plies = 0; state.status === 'playing'; plies++) {
    if (plies > 60) throw new Error('briscola: the round does not end');
    const move = await briscolaMove(state, seats[state.round.currentPlayer], history);
    history.push(move);
    state = applyMove(state, move);
  }
  return {
    human: calculateRoundScore(state.players.human.captured, state.players.cpu.captured).points,
    cpu: calculateRoundScore(state.players.cpu.captured, state.players.human.captured).points,
  };
}

// ---------------------------------------------------------------------------
// Pairings: every deal twice, seats swapped
// ---------------------------------------------------------------------------

interface RoundResult { deal: number; aSeat: PlayerId; a: number; b: number }

interface PairingResult {
  game: Game;
  a: BotName;
  b: BotName;
  rounds: RoundResult[];
  seconds: number;
  /** Rounds planned, and why the pairing stopped early (the rounds played so far are kept). */
  planned: number;
  aborted?: string;
}

async function runPairing(game: Game, a: BotName, b: BotName, deals: number): Promise<PairingResult> {
  const started = performance.now();
  const tasks: Array<() => Promise<RoundResult>> = [];
  for (let deal = 0; deal < deals; deal++) {
    const initial = game === 'scopa' ? dealScopa() : dealBriscola();
    for (const aSeat of ['human', 'cpu'] as const) {
      const seats = { [aSeat]: a, [other(aSeat)]: b } as Record<PlayerId, BotName>;
      tasks.push(async () => {
        const points = game === 'scopa'
          ? await playScopaRound(initial as ScopaState, seats)
          : await playBriscolaRound(initial as BriscolaState, seats);
        return { deal, aSeat, a: points[aSeat], b: points[other(aSeat)] };
      });
    }
  }
  const rounds: RoundResult[] = [];
  let next = 0;
  let failure: unknown = null;
  const label = `${game}: ${a} vs ${b}`;
  const worker = async () => {
    while (next < tasks.length && !failure) {
      const task = tasks[next++];
      try {
        rounds.push(await task());
        if (rounds.length % 10 === 0 || rounds.length === tasks.length) {
          const margin = rounds.reduce((sum, r) => sum + r.a - r.b, 0) / rounds.length;
          console.log(`  ${label}: ${rounds.length}/${tasks.length} rounds, margin ${margin >= 0 ? '+' : ''}${margin.toFixed(2)}, ${api.calls} requests, $${api.cost.toFixed(4)}`);
        }
      } catch (err) {
        failure = err;
      }
    }
  };
  const usesModel = a === 'model' || b === 'model';
  await Promise.all(Array.from({ length: usesModel ? OPTIONS.concurrency : 1 }, worker));
  const result: PairingResult = { game, a, b, rounds, seconds: (performance.now() - started) / 1000, planned: tasks.length };
  // The rounds already played were paid for: keep them when the pairing stops early.
  if (failure) result.aborted = failure instanceof Error ? failure.message : String(failure);
  return result;
}

interface Summary {
  rounds: number;
  wins: number;
  draws: number;
  losses: number;
  meanA: number;
  meanB: number;
  /** Mean margin per round (a − b) and its standard error from the per-deal pairs. */
  margin: number;
  marginError: number;
}

function summarize(result: PairingResult): Summary {
  const { rounds } = result;
  const n = rounds.length;
  const byDeal = new Map<number, number[]>();
  for (const r of rounds) byDeal.set(r.deal, [...(byDeal.get(r.deal) ?? []), r.a - r.b]);
  const dealMeans = [...byDeal.values()].map((margins) => margins.reduce((s, m) => s + m, 0) / margins.length);
  const margin = dealMeans.reduce((s, m) => s + m, 0) / dealMeans.length;
  const variance = dealMeans.length > 1 ? dealMeans.reduce((s, m) => s + (m - margin) ** 2, 0) / (dealMeans.length - 1) : 0;
  return {
    rounds: n,
    wins: rounds.filter((r) => r.a > r.b).length,
    draws: rounds.filter((r) => r.a === r.b).length,
    losses: rounds.filter((r) => r.a < r.b).length,
    meanA: rounds.reduce((s, r) => s + r.a, 0) / n,
    meanB: rounds.reduce((s, r) => s + r.b, 0) / n,
    margin,
    marginError: Math.sqrt(variance / dealMeans.length),
  };
}

const NAMES: Record<BotName, string> = { model: OPTIONS.mock ? 'Mock model' : OPTIONS.model, furbo: 'Furbo', esperto: 'Esperto', scimmietta: 'Scimmietta' };
const KIND = OPTIONS.api === 'chat' ? `chat model, thinking ${OPTIONS.thinking}` : 'decision model';
const percent = (part: number, whole: number) => (whole ? `${((100 * part) / whole).toFixed(0)}%` : 'n/a');
const signed = (x: number, digits = 2) => `${x >= 0 ? '+' : ''}${x.toFixed(digits)}`;

function printPairing(result: PairingResult): void {
  const s = summarize(result);
  const unit = result.game === 'scopa' ? 'round points' : 'card points (of 120)';
  console.log(`\n${result.game.toUpperCase()}: ${NAMES[result.a]} vs ${NAMES[result.b]}  (${s.rounds} rounds, ${result.seconds.toFixed(0)} s)`);
  if (result.aborted) console.log(`  STOPPED EARLY after ${s.rounds} of ${result.planned} rounds: some deals were played from one seat only, so the margin is rougher than its error says`);
  console.log(`  rounds won ${s.wins}, drawn ${s.draws}, lost ${s.losses}  (${percent(s.wins, s.rounds)} won)`);
  console.log(`  average ${unit}: ${s.meanA.toFixed(2)} vs ${s.meanB.toFixed(2)}`);
  console.log(`  margin per round: ${signed(s.margin)} ± ${s.marginError.toFixed(2)}  (same deals, seats swapped)`);
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

function printModelStats(game: Game): void {
  const s = modelStats[game];
  if (!s.decisions && !s.fallbacks) return;
  console.log(`\n${game.toUpperCase()}: the model's decisions`);
  console.log(`  ${s.decisions} decisions (${(s.optionsTotal / Math.max(1, s.decisions)).toFixed(1)} options on average), ${s.forced} forced moves without a request, ${s.fallbacks} failed requests${s.invalid ? `, ${s.invalid} answers naming no legal move` : ''}`);
  if (s.confidenceCount) console.log(`  average confidence ${(s.confidenceTotal / s.confidenceCount).toFixed(2)}; the most probable option was the chosen one in ${percent(s.topChosen, s.withProbabilities)}`);
  if (s.compared) {
    console.log(`  same move as Esperto: ${percent(s.agreeEsperto, s.compared)}   same move as Furbo: ${percent(s.agreeFurbo, s.compared)}`);
    console.log(`  for scale, Furbo plays Esperto's move in ${percent(s.furboAgreesEsperto, s.compared)} of these positions`);
    console.log(`  first listed option chosen in ${percent(s.choseFirst, s.compared)} (it is Esperto's move in ${percent(s.espertoFirst, s.compared)})`);
  }
}

async function main(): Promise<void> {
  if (!KEY) {
    console.error(`No OpenRouter key found.\nPut it in the environment as OPENROUTER_API_KEY, or in local/openrouter.env (git-ignored) as one line:\n  OPENROUTER_API_KEY=...\nOr run with --mock to check the harness without requests.`);
    process.exit(2);
  }
  const pairings: Array<[Game, BotName, BotName]> = [];
  for (const game of OPTIONS.games) {
    if (!OPTIONS.baselinesOnly) for (const opponent of OPTIONS.opponents) pairings.push([game, 'model', opponent]);
    if (OPTIONS.baselines) pairings.push([game, 'esperto', 'furbo'], [game, 'scimmietta', 'furbo']);
  }
  console.log(OPTIONS.baselinesOnly
    ? `Reference pairings only (no requests): ${OPTIONS.deals} deals per pairing (${2 * OPTIONS.deals} rounds).`
    : `Benchmark: ${NAMES.model} (${KIND}) at ${OPTIONS.mock ? '(mock, no requests)' : OPTIONS.baseUrl}, prompt "${OPTIONS.prompt}", ${OPTIONS.deals} deals per pairing (${2 * OPTIONS.deals} rounds), ${OPTIONS.concurrency} rounds in flight.`);

  if (!OPTIONS.baselinesOnly && !OPTIONS.mock) {
    // About 12 requests per Scopa round and 19 per Briscola round (the rest are forced moves).
    const requests = pairings.reduce((sum, [game, a]) => sum + (a === 'model' ? 2 * OPTIONS.deals * (game === 'scopa' ? 12 : 19) : 0), 0);
    if (OPTIONS.api === 'chat') {
      try {
        chatModel = await loadChatModel();
      } catch (err) {
        console.error(`Cannot read the model's catalogue entry: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
      // About 1,000 tokens in and 80 out per request without thinking.
      const perRequest = 1000 * chatModel.inputPrice + 80 * chatModel.outputPrice;
      console.log(`About ${requests} requests, roughly $${(requests * perRequest).toFixed(2)} without thinking (more with it); reasoning parameter ${JSON.stringify(chatModel.reasoning)}; stops at $${OPTIONS.maxCost} (--max-cost).`);
    } else {
      console.log(`About ${requests} requests, roughly $${(requests * 0.00003).toFixed(2)} at $0.042 per million input tokens; stops at $${OPTIONS.maxCost} (--max-cost).`);
    }
  }

  const results: PairingResult[] = [];
  let aborted: string | null = null;
  for (const [game, a, b] of pairings) {
    console.log(`\n${game}: ${NAMES[a]} vs ${NAMES[b]}`);
    const result = await runPairing(game, a, b, OPTIONS.deals);
    if (result.rounds.length) results.push(result);
    if (result.aborted) {
      aborted = result.aborted;
      console.error(`\nStopped: ${aborted}`);
      break;
    }
  }

  console.log('\n================ RESULTS ================');
  for (const result of results) printPairing(result);
  for (const game of OPTIONS.games) printModelStats(game);
  if (api.calls) {
    const sorted = [...api.latencies].sort((x, y) => x - y);
    console.log(`\nREQUESTS`);
    const reasons = Object.entries(api.retryReasons).map(([reason, n]) => `${reason} ×${n}`).join(', ');
    console.log(`  ${api.calls} requests, ${api.retries} retries${reasons ? ` (${reasons})` : ''}`);
    console.log(`  latency: median ${quantile(sorted, 0.5).toFixed(0)} ms, 90% under ${quantile(sorted, 0.9).toFixed(0)} ms, slowest ${sorted[sorted.length - 1].toFixed(0)} ms`);
    console.log(`  input tokens: ${api.inputTokens} (${(api.inputTokens / api.calls).toFixed(0)} per request)`);
    if (api.outputTokens) console.log(`  output tokens: ${api.outputTokens} (${(api.outputTokens / api.calls).toFixed(0)} per request), of which thinking: ${api.reasoningTokens}`);
    console.log(`  cost: $${api.cost.toFixed(4)}${api.costEstimated ? ' (estimated from tokens where the answer carried no cost)' : ''}, $${(api.cost / api.calls).toFixed(6)} per request`);
  }

  const out = OPTIONS.out ?? path.join('local', 'bench', `decision-bench-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({
    when: new Date().toISOString(),
    options: OPTIONS,
    aborted,
    pairings: results.map((r) => ({ game: r.game, a: r.a, b: r.b, seconds: r.seconds, planned: r.planned, aborted: r.aborted ?? null, summary: summarize(r), rounds: r.rounds })),
    modelStats,
    requests: { calls: api.calls, retries: api.retries, retryReasons: api.retryReasons, inputTokens: api.inputTokens, outputTokens: api.outputTokens, reasoningTokens: api.reasoningTokens, cost: api.cost, costEstimated: api.costEstimated, latencies: api.latencies.map((ms) => Math.round(ms)) },
  }, null, 2));
  console.log(`\nResults written to ${out}`);
  if (aborted) process.exit(1);
}

void main();
