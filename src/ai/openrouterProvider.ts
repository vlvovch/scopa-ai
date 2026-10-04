// OpenRouter provider plumbing shared by both games: API-key availability,
// the public model catalogue (fetched once, cached), per-model capability
// lookups and the HTTP client the game bots call. OpenRouter speaks the
// OpenAI chat-completions dialect, so this is plain fetch — no SDK: the
// request carries OpenRouter-only fields (`reasoning`, `provider`, the
// exact `usage.cost`) that a typed SDK would fight, and the website
// bundles stay smaller without one.
//
// Game-specific bots (prompts, move handling, fallbacks) live in
// src/games/<game>/ai/openrouter.ts and import from here — never from each
// other (see claudeProvider.ts for why).
//
// One key, many models: the user's OpenRouter key pays for whichever model
// they pick (OpenAI, Anthropic, Google, DeepSeek, …). Users who prefer to
// be billed by the model vendor directly can add their own vendor keys on
// openrouter.ai (Settings → Integrations, "BYOK"); OpenRouter then routes
// through those keys and this app needs no change for it — the response's
// usage block just reports the upstream charge separately.

import { registerApiKeyCacheClearer } from './apiKeyCaches';
import { getOpenRouterApiKey, isOpenRouterKeyValid } from '../hooks/useSettings';
import type { AiThinkingLevel } from './effort';

export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1';

/** Cheap, structured-output capable, reasoning model — the picker default. */
export const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-5.6-luna';

/** OpenRouter's router that picks an available free model per request. */
export const OPENROUTER_FREE_ROUTER = 'openrouter/free';

/** The free-tier entries: the ":free" variants and the free router. They are
 *  listed under the "Free AI" category of the pickers, not under BYOK. */
export function isFreeOpenRouterModel(modelId: string): boolean {
  return modelId.endsWith(':free') || modelId === OPENROUTER_FREE_ROUTER;
}

/**
 * Keep a saved selection inside the catalogue, so the picker never shows
 * one model while requests use another: a retired paid id maps to the
 * default paid model, a retired free id to the first free entry. A free
 * selection is never turned into a paid one — with no free entry to move
 * to it stays as it is (a clear request error beats a silent charge).
 * `models` must be the fetched catalogue, never the built-in fallback
 * list: callers check isOpenRouterCatalogueLoaded() first.
 */
export function normalizeOpenRouterSelection(modelId: string, models: OpenRouterModelInfo[]): string {
  if (models.length === 0 || models.some((m) => m.id === modelId)) return modelId;
  if (isFreeOpenRouterModel(modelId)) {
    const free = freeOpenRouterModels(models);
    return free.length > 0 ? free[0].id : modelId;
  }
  if (models.some((m) => m.id === DEFAULT_OPENROUTER_MODEL)) return DEFAULT_OPENROUTER_MODEL;
  return models[0].id;
}

/** Free entries for the "Free AI" category: the router first, then the rest. */
export function freeOpenRouterModels(models: OpenRouterModelInfo[]): OpenRouterModelInfo[] {
  const free = models.filter((m) => isFreeOpenRouterModel(m.id));
  return [
    ...free.filter((m) => m.id === OPENROUTER_FREE_ROUTER),
    ...free.filter((m) => m.id !== OPENROUTER_FREE_ROUTER),
  ];
}

// ---------------------------------------------------------------------------
// Model catalogue
// ---------------------------------------------------------------------------

export interface OpenRouterReasoningInfo {
  /** The model always thinks; effort only scales how much. */
  mandatory: boolean;
  /** The model thinks unless told not to (effort 'none' where supported). */
  defaultEnabled: boolean;
  /** Effort names the model accepts; empty when the catalogue does not say. */
  supportedEfforts: string[];
  defaultEffort?: string;
}

export interface OpenRouterModelInfo {
  id: string;
  /** Model name without the vendor prefix, e.g. "GPT-5 Mini". */
  displayName: string;
  /** Vendor label the pickers group by, e.g. "OpenAI". */
  group: string;
  /** Catalogue timestamp (seconds); newest first inside a group. */
  created: number;
  /** USD per 1M tokens; null when unknown or variable (routers). */
  pricing: { input: number; output: number } | null;
  /** `response_format: json_schema` (strict) is honoured by some endpoint. */
  supportsStructuredOutputs: boolean;
  /** `response_format: json_object` is honoured. */
  supportsJsonObject: boolean;
  /** The `reasoning` request parameter is accepted. */
  supportsReasoning: boolean;
  reasoning: OpenRouterReasoningInfo | null;
}

// Vendors listed first in the pickers, in this order; the rest follow
// alphabetically. Labels are the catalogue's own where it has one.
const VENDOR_ORDER = [
  'openai', 'anthropic', 'google', 'x-ai', 'deepseek', 'meta-llama', 'meta',
  'mistralai', 'qwen', 'moonshotai', 'z-ai', 'minimax', 'openrouter',
];
const VENDOR_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  'x-ai': 'xAI',
  deepseek: 'DeepSeek',
  'meta-llama': 'Meta',
  meta: 'Meta',
  mistralai: 'Mistral',
  qwen: 'Qwen',
  moonshotai: 'MoonshotAI',
  'z-ai': 'Z.ai',
  minimax: 'MiniMax',
  openrouter: 'OpenRouter',
};

/** Vendor slug of a model id: "openai/gpt-5-mini" → "openai" (aliases start with "~"). */
export function openRouterVendorOf(modelId: string): string {
  const slash = modelId.indexOf('/');
  return (slash > 0 ? modelId.slice(0, slash) : modelId).replace(/^~/, '');
}

function vendorLabel(slug: string, name: string): string {
  if (VENDOR_LABELS[slug]) return VENDOR_LABELS[slug];
  const colon = name.indexOf(': ');
  if (colon > 0) return name.slice(0, colon).trim();
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

/** "OpenAI: GPT-5 Mini" → "GPT-5 Mini"; names without a vendor prefix stay. */
function stripVendorPrefix(name: string): string {
  const colon = name.indexOf(': ');
  return colon > 0 ? name.slice(colon + 2).trim() : name.trim();
}

/** Readable name for a model id when the catalogue has no entry for it. */
function prettifyModelId(modelId: string): string {
  const afterVendor = modelId.slice(modelId.indexOf('/') + 1).replace(/^~/, '');
  const colon = afterVendor.indexOf(':');
  const tail = colon === -1 ? afterVendor : afterVendor.slice(0, colon);
  const variant = colon === -1 ? '' : ` (${afterVendor.slice(colon + 1)})`;
  const name = tail
    .split('-')
    .map((part) => {
      if (/^(gpt|glm|qwq|llm|ai)$/i.test(part)) return part.toUpperCase();
      if (/^\d+(\.\d+)?b$/i.test(part)) return part.toUpperCase();
      if (/^o\d/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
  return name + variant;
}

function perMillion(perToken: unknown): number | null {
  if (typeof perToken !== 'string' && typeof perToken !== 'number') return null;
  const n = Number(perToken);
  if (!Number.isFinite(n) || n < 0) return null; // "-1" = variable (routers)
  return n * 1_000_000;
}

/**
 * Turn the raw `GET /models` payload into the app's model list: batch-only
 * ids and non-text models dropped, vendor groups in a fixed order, newest
 * first inside a group. Exported for tests.
 */
export function parseOpenRouterCatalogue(raw: unknown): OpenRouterModelInfo[] {
  const data = (raw as { data?: unknown[] } | null)?.data;
  if (!Array.isArray(data)) return [];
  const models: OpenRouterModelInfo[] = [];
  for (const entry of data) {
    const m = entry as Record<string, unknown>;
    const id = typeof m.id === 'string' ? m.id : '';
    if (!id || id.endsWith(':batch')) continue;
    const arch = (m.architecture ?? {}) as { input_modalities?: unknown; output_modalities?: unknown };
    const inputs = Array.isArray(arch.input_modalities) ? arch.input_modalities : ['text'];
    const outputs = Array.isArray(arch.output_modalities) ? arch.output_modalities : ['text'];
    if (!inputs.includes('text') || !outputs.includes('text')) continue;
    const name = typeof m.name === 'string' && m.name ? m.name : id;
    const slug = openRouterVendorOf(id);
    const params = Array.isArray(m.supported_parameters) ? (m.supported_parameters as string[]) : [];
    const pricing = (m.pricing ?? {}) as { prompt?: unknown; completion?: unknown };
    const input = perMillion(pricing.prompt);
    const output = perMillion(pricing.completion);
    const r = m.reasoning as Record<string, unknown> | undefined;
    models.push({
      id,
      displayName: stripVendorPrefix(name),
      group: vendorLabel(slug, name),
      created: typeof m.created === 'number' ? m.created : 0,
      pricing: input !== null && output !== null ? { input, output } : null,
      supportsStructuredOutputs: params.includes('structured_outputs'),
      supportsJsonObject: params.includes('response_format'),
      supportsReasoning: params.includes('reasoning'),
      reasoning: r && typeof r === 'object'
        ? {
            mandatory: r.mandatory === true,
            defaultEnabled: r.default_enabled === true,
            supportedEfforts: Array.isArray(r.supported_efforts)
              ? (r.supported_efforts as unknown[]).filter((e): e is string => typeof e === 'string')
              : [],
            defaultEffort: typeof r.default_effort === 'string' ? r.default_effort : undefined,
          }
        : null,
    });
  }
  const rank = (id: string): number => {
    const i = VENDOR_ORDER.indexOf(openRouterVendorOf(id));
    return i === -1 ? VENDOR_ORDER.length : i;
  };
  models.sort(
    (a, b) =>
      rank(a.id) - rank(b.id) ||
      a.group.localeCompare(b.group) ||
      b.created - a.created ||
      a.displayName.localeCompare(b.displayName)
  );
  return models;
}

/** "$0.25 · $2 /M" for the pickers; null for free or variable pricing. */
export function formatOpenRouterPrice(info: OpenRouterModelInfo): string | null {
  if (!info.pricing) return null;
  const { input, output } = info.pricing;
  if (input === 0 && output === 0) return null;
  const fmt = (x: number): string => {
    const s = x >= 100 ? x.toFixed(0) : x >= 1 ? x.toFixed(2) : x.toFixed(3);
    return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
  };
  return `$${fmt(input)} · $${fmt(output)} /M`;
}

// Cached catalogue (public endpoint: no key needed, so a key change does not
// invalidate it; only the bot instances are dropped then).
let cachedModels: OpenRouterModelInfo[] | null = null;
let modelsFetchPromise: Promise<OpenRouterModelInfo[]> | null = null;

// Used when the catalogue cannot be fetched: capabilities as of 2026-09.
const FALLBACK_MODELS: OpenRouterModelInfo[] = [
  {
    id: 'openai/gpt-5.6-luna', displayName: 'GPT-5.6 Luna', group: 'OpenAI', created: 0,
    pricing: { input: 0.2, output: 1.2 },
    supportsStructuredOutputs: true, supportsJsonObject: true, supportsReasoning: true,
    reasoning: { mandatory: true, defaultEnabled: true, supportedEfforts: ['high', 'medium', 'low', 'minimal'], defaultEffort: 'medium' },
  },
  {
    id: 'openai/gpt-5-mini', displayName: 'GPT-5 Mini', group: 'OpenAI', created: 0,
    pricing: { input: 0.25, output: 2 },
    supportsStructuredOutputs: true, supportsJsonObject: true, supportsReasoning: true,
    reasoning: { mandatory: true, defaultEnabled: true, supportedEfforts: ['high', 'medium', 'low', 'minimal'], defaultEffort: 'medium' },
  },
  {
    id: 'anthropic/claude-sonnet-5', displayName: 'Claude Sonnet 5', group: 'Anthropic', created: 0,
    pricing: { input: 2, output: 10 },
    supportsStructuredOutputs: true, supportsJsonObject: true, supportsReasoning: true,
    reasoning: { mandatory: false, defaultEnabled: true, supportedEfforts: ['max', 'xhigh', 'high', 'medium', 'low'], defaultEffort: 'high' },
  },
  {
    id: 'google/gemini-3.5-flash', displayName: 'Gemini 3.5 Flash', group: 'Google', created: 0,
    pricing: { input: 1.5, output: 9 },
    supportsStructuredOutputs: true, supportsJsonObject: true, supportsReasoning: true,
    reasoning: { mandatory: true, defaultEnabled: true, supportedEfforts: ['high', 'medium', 'low', 'minimal'], defaultEffort: 'medium' },
  },
  // The free router stays available in the Free AI category even when the
  // catalogue cannot be fetched.
  {
    id: OPENROUTER_FREE_ROUTER, displayName: 'Free Models Router', group: 'OpenRouter', created: 0,
    pricing: { input: 0, output: 0 },
    supportsStructuredOutputs: true, supportsJsonObject: true, supportsReasoning: true,
    reasoning: null,
  },
];

/**
 * Fetch the OpenRouter model catalogue (public, no key needed). Cached after
 * the first successful fetch; a failed fetch returns a small built-in list
 * without caching so the next call tries again.
 */
export async function fetchOpenRouterModels(): Promise<OpenRouterModelInfo[]> {
  if (cachedModels !== null) return cachedModels;
  if (modelsFetchPromise !== null) return modelsFetchPromise;
  modelsFetchPromise = (async () => {
    try {
      const response = await fetch(`${OPENROUTER_API_URL}/models`, { headers: attributionHeaders() });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const models = parseOpenRouterCatalogue(await response.json());
      if (models.length === 0) throw new Error('empty catalogue');
      cachedModels = models;
      return models;
    } catch (error) {
      console.error('Failed to fetch OpenRouter models:', error);
      return FALLBACK_MODELS;
    } finally {
      modelsFetchPromise = null;
    }
  })();
  return modelsFetchPromise;
}

/** Cached catalogue (empty until fetched). */
export function getCachedOpenRouterModels(): OpenRouterModelInfo[] {
  return cachedModels || [];
}

/**
 * True once the real catalogue has been fetched. False before that and
 * after a failed fetch, when fetchOpenRouterModels() handed out the small
 * built-in list — a list to pick from, never one to judge a saved
 * selection against.
 */
export function isOpenRouterCatalogueLoaded(): boolean {
  return cachedModels !== null;
}

/** One model's catalogue entry, or null when unknown / not fetched yet. */
export function getCachedOpenRouterModel(modelId: string): OpenRouterModelInfo | null {
  const models = cachedModels ?? FALLBACK_MODELS;
  return models.find((m) => m.id === modelId) ?? null;
}

/** Display name for a model id: the catalogue's, or a readable form of the id. */
export function openRouterModelDisplayName(modelId: string): string {
  return getCachedOpenRouterModel(modelId)?.displayName ?? prettifyModelId(modelId);
}

/** Forget the cached catalogue (tests, manual refresh). */
export function clearOpenRouterModelCache(): void {
  cachedModels = null;
}

/** Check if an OpenRouter API key is available AND valid */
export function isOpenRouterAvailable(): boolean {
  return !!getOpenRouterApiKey() && isOpenRouterKeyValid();
}

// Nothing to clear provider-side on a key change (the catalogue is public);
// the bots register their own instance-cache clearers. Registered anyway so
// a future key-scoped cache has a single place to hook into.
registerApiKeyCacheClearer('openrouter', () => undefined);

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  /** Returned by reasoning models; passed back unchanged on later turns. */
  reasoning_details?: unknown[];
}

export interface OpenRouterChatParams {
  model: string;
  messages: OpenRouterMessage[];
  /** JSON schema the answer must follow (sent where the model honours it). */
  schema: { name: string; schema: Record<string, unknown> };
  thinkingLevel: AiThinkingLevel;
}

export interface OpenRouterUsage {
  promptTokens: number;
  responseTokens: number;
  thoughtTokens: number;
  totalTokens: number;
  cachedTokens: number;
  cacheCreationTokens: number;
  /** What the request cost, in USD: OpenRouter credits plus, for BYOK
   *  requests, the vendor's own charge. Undefined when not reported. */
  costUsd: number | undefined;
}

export interface OpenRouterChatResult {
  /** The assistant text (JSON for our prompts); '' when the model sent none. */
  text: string;
  /** Visible reasoning, when the model returned any. */
  reasoning: string;
  /** Opaque reasoning blocks to echo back in the next assistant message. */
  reasoningDetails: unknown[] | null;
  finishReason: string | null;
  /** The model that actually answered (routers may substitute). */
  model: string | null;
  usage: OpenRouterUsage;
}

/** An error reported by OpenRouter (HTTP status or an error payload). */
export class OpenRouterError extends Error {
  readonly status: number | undefined;
  readonly metadata: unknown;
  constructor(message: string, status?: number, metadata?: unknown) {
    super(status ? `${message} (HTTP ${status})` : message);
    this.name = 'OpenRouterError';
    this.status = status;
    this.metadata = metadata;
  }
}

/**
 * The request was abandoned on purpose (the round or game it belonged to
 * is over, the key changed, the game unmounted). Not an API failure: the
 * bots never record anything for it and the apps show no error badge.
 */
export class OpenRouterCancelledError extends OpenRouterError {
  constructor() {
    super('The request was cancelled');
    this.name = 'OpenRouterCancelledError';
  }
}

const EFFORT_RANK: Record<string, number> = {
  none: 0, minimal: 1, low: 2, medium: 3, high: 4, xhigh: 5, max: 6,
};

/** The `reasoning` request parameter: an effort level, or explicitly off. */
export type OpenRouterReasoningParam = { effort: string } | { enabled: false };

/** True when the catalogue says the model always reasons (it can only be dialled down). */
export function isMandatoryReasoningModel(info: OpenRouterModelInfo | null | undefined): boolean {
  return !!info?.supportsReasoning && !!info.reasoning?.mandatory;
}

/**
 * Map the app's thinking knob onto the `reasoning` request parameter, or
 * null to leave it out.
 * - unknown model (catalogue not loaded): ask for the knob's effort — models
 *   that do not reason ignore the parameter — and leave 'off' to the default;
 * - the knob 'off' switches reasoning off explicitly (`enabled: false`, or
 *   effort 'none' where the model lists it); models that always reason get
 *   the lowest effort they accept instead — the UI calls that "minimum";
 * - 'medium' / 'high' pick the nearest supported effort; a tie goes to the
 *   higher one, so "balanced" never collapses into "off" on a model that
 *   offers, say, only max / high / low.
 */
export function resolveReasoning(
  level: AiThinkingLevel,
  info: OpenRouterModelInfo | null | undefined
): OpenRouterReasoningParam | null {
  if (!info) return level === 'off' ? null : { effort: level };
  if (!info.supportsReasoning) return null;
  const meta = info.reasoning;
  const efforts = (meta?.supportedEfforts ?? []).filter((e) => e in EFFORT_RANK);
  if (level === 'off') {
    if (meta?.mandatory) {
      return efforts.length > 0 ? { effort: nearestEffort('none', efforts, 'lower') } : null;
    }
    return efforts.includes('none') ? { effort: 'none' } : { enabled: false };
  }
  if (efforts.length === 0) return { effort: level };
  return { effort: nearestEffort(level, efforts, 'higher') };
}

function nearestEffort(wanted: string, efforts: string[], tieBreak: 'lower' | 'higher'): string {
  const target = EFFORT_RANK[wanted];
  let best = efforts[0];
  let bestDistance = Infinity;
  for (const effort of efforts) {
    const rank = EFFORT_RANK[effort];
    const distance = Math.abs(rank - target);
    const wins =
      distance < bestDistance ||
      (distance === bestDistance &&
        (tieBreak === 'lower' ? rank < EFFORT_RANK[best] : rank > EFFORT_RANK[best]));
    if (wins) {
      best = effort;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Anthropic prompt caching through OpenRouter: Claude only caches where a
 * `cache_control` breakpoint sits, sent on a content part in the
 * OpenAI-compatible message format. Two breakpoints: the system prompt
 * (identical for every turn and every game, so it is read from cache at
 * 0.1x input price after the first write) and, in a multi-turn
 * conversation, the latest message, so each turn re-reads the whole
 * earlier exchange from cache and writes only the new tail (1.25x). A
 * single-turn request marks the system prompt only: its user prompt is
 * unique and would just pay the write surcharge. Other vendors cache on
 * their own (OpenAI, Gemini, DeepSeek) and ignore this. The reads and
 * writes come back in usage (cached_tokens / cache_write_tokens) and the
 * exact cost already reflects them. Exported for tests.
 */
export function withAnthropicCacheBreakpoints(
  model: string,
  messages: OpenRouterMessage[]
): unknown[] {
  if (openRouterVendorOf(model) !== 'anthropic') return messages;
  const breakpoint = { type: 'ephemeral' as const };
  const lastIndex = messages.length - 1;
  const multiTurn = messages.length > 2;
  return messages.map((message, index) => {
    const mark =
      message.role === 'system' ||
      (multiTurn && index === lastIndex && message.role === 'user');
    if (!mark) return message;
    const { content, ...rest } = message;
    return { ...rest, content: [{ type: 'text', text: content, cache_control: breakpoint }] };
  });
}

/**
 * The JSON body for a chat completion, shaped by what the catalogue says the
 * model supports: strict JSON schema (routed only to endpoints that honour
 * it), plain JSON mode, or nothing — the prompts ask for JSON anyway and the
 * bots parse defensively. Exported for tests.
 */
export function buildOpenRouterRequestBody(
  params: OpenRouterChatParams,
  info: OpenRouterModelInfo | null = getCachedOpenRouterModel(params.model)
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: params.model,
    messages: withAnthropicCacheBreakpoints(params.model, params.messages),
  };
  if (info?.supportsStructuredOutputs) {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: params.schema.name, strict: true, schema: params.schema.schema },
    };
    body.provider = { require_parameters: true };
  } else if (info?.supportsJsonObject) {
    body.response_format = { type: 'json_object' };
  }
  const reasoning = resolveReasoning(params.thinkingLevel, info);
  if (reasoning) body.reasoning = reasoning;
  return body;
}

function errorMessageOf(json: unknown): string | null {
  const error = (json as { error?: { message?: unknown } } | null)?.error;
  if (error && typeof error === 'object' && typeof error.message === 'string') return error.message;
  return null;
}

function errorMetadataOf(json: unknown): unknown {
  return (json as { error?: { metadata?: unknown } } | null)?.error?.metadata;
}

/**
 * Human-readable error text: OpenRouter's message plus, when it relayed an
 * upstream failure, the provider's name and its own message (metadata.raw),
 * so "Provider returned error" says which provider said what. A 429 on a
 * free model gets the explanation players need most: free endpoints share
 * a public quota, it is not their credit balance.
 */
export function describeOpenRouterError(json: unknown, status: number | undefined, modelId?: string): string {
  const parts: string[] = [errorMessageOf(json) ?? 'OpenRouter request failed'];
  const meta = errorMetadataOf(json) as { provider_name?: unknown; raw?: unknown } | undefined;
  if (meta && typeof meta === 'object') {
    if (typeof meta.provider_name === 'string' && meta.provider_name) parts.push(`from ${meta.provider_name}`);
    const raw = meta.raw;
    let upstream: string | null = null;
    if (typeof raw === 'string') upstream = raw;
    else if (raw && typeof raw === 'object') {
      const r = raw as { error?: { message?: unknown }; message?: unknown };
      const m = r.error?.message ?? r.message;
      upstream = typeof m === 'string' ? m : JSON.stringify(raw);
    }
    if (upstream) {
      const trimmed = upstream.trim();
      if (trimmed && !parts[0].includes(trimmed)) parts.push(trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed);
    }
  }
  if (status === 429 && modelId?.endsWith(':free')) {
    parts.push('free models share a public quota; wait a bit or pick another model');
  }
  return parts.join(' — ');
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string'
        ? (part as { text: string }).text
        : ''))
      .join('');
  }
  return '';
}

function numberOr0(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Read a chat-completion payload into the app's shape. Throws an
 * OpenRouterError for error payloads (OpenRouter can answer 200 with an
 * `error` body, or a choice whose finish_reason is 'error'). Exported for
 * tests.
 */
export function parseOpenRouterResponse(json: unknown): OpenRouterChatResult {
  if (errorMessageOf(json) !== null) {
    const code = (json as { error: { code?: unknown } }).error.code;
    const status = typeof code === 'number' ? code : undefined;
    throw new OpenRouterError(describeOpenRouterError(json, status), status, errorMetadataOf(json));
  }
  const payload = json as {
    model?: unknown;
    choices?: Array<{
      finish_reason?: unknown;
      error?: { message?: unknown };
      message?: { content?: unknown; reasoning?: unknown; reasoning_details?: unknown };
    }>;
    usage?: {
      prompt_tokens?: unknown;
      completion_tokens?: unknown;
      total_tokens?: unknown;
      cost?: unknown;
      cost_details?: { upstream_inference_cost?: unknown };
      prompt_tokens_details?: { cached_tokens?: unknown; cache_write_tokens?: unknown };
      completion_tokens_details?: { reasoning_tokens?: unknown };
    };
  };
  const choice = payload?.choices?.[0];
  if (!choice) throw new OpenRouterError('No completion in the OpenRouter response');
  if (choice.finish_reason === 'error' || choice.error) {
    const message = typeof choice.error?.message === 'string' ? choice.error.message : 'The model provider failed mid-response';
    throw new OpenRouterError(message);
  }
  const message = choice.message ?? {};
  const details = Array.isArray(message.reasoning_details) ? message.reasoning_details : null;
  let reasoning = typeof message.reasoning === 'string' ? message.reasoning : '';
  if (!reasoning && details) {
    reasoning = details
      .map((d) => {
        const block = d as { type?: unknown; text?: unknown; summary?: unknown };
        if (typeof block.text === 'string') return block.text;
        if (typeof block.summary === 'string') return block.summary;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  const usage = payload.usage;
  const prompt = numberOr0(usage?.prompt_tokens);
  const completion = numberOr0(usage?.completion_tokens);
  const cost = usage?.cost;
  const upstream = usage?.cost_details?.upstream_inference_cost;
  return {
    text: textOf(message.content),
    reasoning,
    reasoningDetails: details,
    finishReason: typeof choice.finish_reason === 'string' ? choice.finish_reason : null,
    model: typeof payload.model === 'string' ? payload.model : null,
    usage: {
      promptTokens: prompt,
      responseTokens: completion,
      thoughtTokens: numberOr0(usage?.completion_tokens_details?.reasoning_tokens),
      totalTokens: numberOr0(usage?.total_tokens) || prompt + completion,
      cachedTokens: numberOr0(usage?.prompt_tokens_details?.cached_tokens),
      cacheCreationTokens: numberOr0(usage?.prompt_tokens_details?.cache_write_tokens),
      costUsd: typeof cost === 'number' && Number.isFinite(cost)
        ? cost + numberOr0(upstream)
        : undefined,
    },
  };
}

/**
 * Pull the move JSON out of a model answer: plain JSON first, then a fenced
 * block, then the outermost {...} in the text (models without JSON mode
 * sometimes add prose around it). Null when nothing parses.
 */
export function extractJsonObject(text: string): Record<string, unknown> | null {
  const attempts: string[] = [text.trim()];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) attempts.push(fenced[1].trim());
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) attempts.push(text.slice(first, last + 1));
  for (const candidate of attempts) {
    if (!candidate) continue;
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      // try the next shape
    }
  }
  return null;
}

// Attribution headers: OpenRouter lists apps by these on its site. Both the
// current and the older title header name are sent (both are allowed by its
// CORS policy), the referer names the game's site even inside the iOS app.
function attributionHeaders(): Record<string, string> {
  const site = import.meta.env.VITE_SITE_URL || 'https://playscopa.net';
  const title = import.meta.env.VITE_APP_NAME || 'Scopa AI';
  return { 'HTTP-Referer': site, 'X-Title': title, 'X-OpenRouter-Title': title };
}

const RETRY_STATUSES = new Set([408, 429, 502, 503]);
const MAX_ATTEMPTS = 3;
/** A deep-thinking model on a large prompt can take a couple of minutes. */
const DEFAULT_TIMEOUT_MS = 300_000;

function retryDelayMs(response: Response, attempt: number): number {
  const header = Number(response.headers.get('retry-after'));
  if (Number.isFinite(header) && header > 0 && header <= 10) return header * 1000;
  return 1000 * attempt;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function postJson(
  url: string,
  apiKey: string,
  body: unknown,
  options: { signal?: AbortSignal; timeoutMs?: number }
): Promise<unknown> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  for (let attempt = 1; ; attempt++) {
    if (options.signal?.aborted) throw new OpenRouterCancelledError();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onAbort);
    try {
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            ...attributionHeaders(),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (err) {
        if (options.signal?.aborted) throw new OpenRouterCancelledError();
        if (controller.signal.aborted) throw new OpenRouterError('The request to OpenRouter timed out');
        // Network failure: worth a retry.
        if (attempt < MAX_ATTEMPTS) {
          await sleep(1000 * attempt);
          continue;
        }
        throw new OpenRouterError(`Could not reach OpenRouter (${err instanceof Error ? err.message : String(err)})`);
      }
      const text = await response.text();
      if (options.signal?.aborted) throw new OpenRouterCancelledError();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (!response.ok) {
        if (RETRY_STATUSES.has(response.status) && attempt < MAX_ATTEMPTS) {
          await sleep(retryDelayMs(response, attempt));
          continue;
        }
        const modelId = (body as { model?: unknown } | null)?.model;
        throw new OpenRouterError(
          describeOpenRouterError(json, response.status, typeof modelId === 'string' ? modelId : undefined),
          response.status,
          errorMetadataOf(json)
        );
      }
      if (json === null) throw new OpenRouterError('Empty or non-JSON response from OpenRouter', response.status);
      return json;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
    }
  }
}

/**
 * One chat completion. Throws OpenRouterError (message ready for the UI's
 * error badge) on HTTP errors, error payloads, timeouts and network failure;
 * 408/429/502/503 and network failures are retried twice with backoff.
 */
export async function openRouterChat(
  apiKey: string,
  params: OpenRouterChatParams,
  options: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<OpenRouterChatResult> {
  const body = buildOpenRouterRequestBody(params);
  const json = await postJson(`${OPENROUTER_API_URL}/chat/completions`, apiKey, body, options);
  return parseOpenRouterResponse(json);
}

// Re-export for symmetry with the other providers
export { getOpenRouterApiKey };
