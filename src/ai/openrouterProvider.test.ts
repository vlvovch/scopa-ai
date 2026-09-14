// The OpenRouter provider layer: catalogue parsing, the thinking-knob →
// effort mapping, capability-gated request bodies, response/usage parsing
// and the fetch client's error and retry behaviour. Everything here is
// what both games' bots rely on; a wrong request shape is a hard 400 from
// OpenRouter, a wrong usage mapping shows the player a wrong cost.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseOpenRouterCatalogue,
  formatOpenRouterPrice,
  resolveReasoning,
  normalizeOpenRouterSelection,
  isOpenRouterCatalogueLoaded,
  isMandatoryReasoningModel,
  OpenRouterCancelledError,
  buildOpenRouterRequestBody,
  withAnthropicCacheBreakpoints,
  parseOpenRouterResponse,
  extractJsonObject,
  openRouterChat,
  fetchOpenRouterModels,
  clearOpenRouterModelCache,
  getCachedOpenRouterModels,
  getCachedOpenRouterModel,
  openRouterModelDisplayName,
  describeOpenRouterError,
  isFreeOpenRouterModel,
  freeOpenRouterModels,
  OpenRouterError,
  type OpenRouterModelInfo,
} from './openrouterProvider';

vi.mock('../hooks/useSettings', () => ({
  getOpenRouterApiKey: () => 'sk-or-test',
  isOpenRouterKeyValid: () => true,
}));

const rawModel = (overrides: Record<string, unknown>) => ({
  id: 'vendor/model',
  name: 'Vendor: Model',
  created: 100,
  architecture: { input_modalities: ['text'], output_modalities: ['text'] },
  pricing: { prompt: '0.000001', completion: '0.000002' },
  supported_parameters: ['max_tokens', 'response_format', 'structured_outputs', 'reasoning'],
  ...overrides,
});

const catalogue = {
  data: [
    rawModel({ id: 'qwen/qwen3', name: 'Qwen: Qwen3', created: 5, reasoning: { mandatory: false } }),
    rawModel({ id: 'openai/gpt-5-mini:batch', name: 'OpenAI: GPT-5 Mini (batch)' }),
    rawModel({
      id: 'openai/gpt-5-mini',
      name: 'OpenAI: GPT-5 Mini',
      created: 10,
      pricing: { prompt: '0.00000025', completion: '0.000002' },
      reasoning: { mandatory: true, default_enabled: true, supported_efforts: ['high', 'medium', 'low', 'minimal'], default_effort: 'medium' },
    }),
    rawModel({ id: 'openai/gpt-6', name: 'OpenAI: GPT-6', created: 20, supported_parameters: ['response_format'] }),
    rawModel({ id: 'aion-labs/aion', name: 'AionLabs: Aion', created: 50, supported_parameters: [] }),
    rawModel({ id: 'anthropic/claude-opus-5', name: 'Claude Opus 5', created: 30 }),
    rawModel({ id: 'openrouter/auto', name: 'Auto Router', pricing: { prompt: '-1', completion: '-1' } }),
    rawModel({ id: 'some/tts', name: 'Some: TTS', architecture: { input_modalities: ['text'], output_modalities: ['audio'] } }),
    rawModel({ id: 'nex-agi/mini:free', name: 'Nex AGI: Mini (free)', pricing: { prompt: '0', completion: '0' } }),
  ],
};

describe('parseOpenRouterCatalogue', () => {
  const models = parseOpenRouterCatalogue(catalogue);
  const ids = models.map((m) => m.id);

  it('drops batch-only ids and models that do not answer in text', () => {
    expect(ids).not.toContain('openai/gpt-5-mini:batch');
    expect(ids).not.toContain('some/tts');
  });

  it('orders the big vendors first, newest first inside a vendor, then the rest alphabetically', () => {
    expect(ids).toEqual([
      'openai/gpt-6',
      'openai/gpt-5-mini',
      'anthropic/claude-opus-5',
      'qwen/qwen3',
      'openrouter/auto',
      'aion-labs/aion',
      'nex-agi/mini:free',
    ]);
  });

  it('strips the vendor prefix from names and labels groups by vendor', () => {
    const mini = models.find((m) => m.id === 'openai/gpt-5-mini')!;
    expect(mini.displayName).toBe('GPT-5 Mini');
    expect(mini.group).toBe('OpenAI');
    // a name without a prefix keeps the vendor from the id
    const opus = models.find((m) => m.id === 'anthropic/claude-opus-5')!;
    expect(opus.displayName).toBe('Claude Opus 5');
    expect(opus.group).toBe('Anthropic');
    // an unknown vendor takes the label from the name
    expect(models.find((m) => m.id === 'aion-labs/aion')!.group).toBe('AionLabs');
  });

  it('converts per-token prices to per-million and marks variable pricing unknown', () => {
    expect(models.find((m) => m.id === 'openai/gpt-5-mini')!.pricing).toEqual({ input: 0.25, output: 2 });
    expect(models.find((m) => m.id === 'openrouter/auto')!.pricing).toBeNull();
    expect(models.find((m) => m.id === 'nex-agi/mini:free')!.pricing).toEqual({ input: 0, output: 0 });
  });

  it('reads the capability flags and the reasoning block', () => {
    const mini = models.find((m) => m.id === 'openai/gpt-5-mini')!;
    expect(mini.supportsStructuredOutputs).toBe(true);
    expect(mini.supportsJsonObject).toBe(true);
    expect(mini.supportsReasoning).toBe(true);
    expect(mini.reasoning).toEqual({
      mandatory: true,
      defaultEnabled: true,
      supportedEfforts: ['high', 'medium', 'low', 'minimal'],
      defaultEffort: 'medium',
    });
    const gpt6 = models.find((m) => m.id === 'openai/gpt-6')!;
    expect(gpt6.supportsStructuredOutputs).toBe(false);
    expect(gpt6.supportsJsonObject).toBe(true);
    expect(gpt6.supportsReasoning).toBe(false);
    expect(gpt6.reasoning).toBeNull();
    expect(models.find((m) => m.id === 'qwen/qwen3')!.reasoning).toEqual({
      mandatory: false,
      defaultEnabled: false,
      supportedEfforts: [],
      defaultEffort: undefined,
    });
  });

  it('returns nothing for a payload that is not a catalogue', () => {
    expect(parseOpenRouterCatalogue(null)).toEqual([]);
    expect(parseOpenRouterCatalogue({ error: 'x' })).toEqual([]);
  });
});

describe('formatOpenRouterPrice', () => {
  const info = (pricing: OpenRouterModelInfo['pricing']): OpenRouterModelInfo => ({
    id: 'x/y', displayName: 'Y', group: 'X', created: 0, pricing,
    supportsStructuredOutputs: false, supportsJsonObject: false, supportsReasoning: false, reasoning: null,
  });
  it('prints per-million prices compactly', () => {
    expect(formatOpenRouterPrice(info({ input: 0.25, output: 2 }))).toBe('$0.25 · $2 /M');
    expect(formatOpenRouterPrice(info({ input: 1.5, output: 9 }))).toBe('$1.5 · $9 /M');
    expect(formatOpenRouterPrice(info({ input: 0.000696, output: 150 }))).toBe('$0.001 · $150 /M');
  });
  it('is empty for free and variable pricing', () => {
    expect(formatOpenRouterPrice(info({ input: 0, output: 0 }))).toBeNull();
    expect(formatOpenRouterPrice(info(null))).toBeNull();
  });
});

const infoWith = (over: Partial<OpenRouterModelInfo>): OpenRouterModelInfo => ({
  id: 'x/y', displayName: 'Y', group: 'X', created: 0, pricing: null,
  supportsStructuredOutputs: true, supportsJsonObject: true, supportsReasoning: true, reasoning: null,
  ...over,
});

describe('resolveReasoning', () => {
  it('asks for the knob level on an unknown model, and nothing when off', () => {
    expect(resolveReasoning('high', null)).toEqual({ effort: 'high' });
    expect(resolveReasoning('medium', undefined)).toEqual({ effort: 'medium' });
    expect(resolveReasoning('off', null)).toBeNull();
  });

  it('never sends the parameter to a model that does not accept it', () => {
    const info = infoWith({ supportsReasoning: false });
    expect(resolveReasoning('high', info)).toBeNull();
    expect(resolveReasoning('off', info)).toBeNull();
  });

  it('switches reasoning off explicitly where it is optional', () => {
    const claude = infoWith({ reasoning: { mandatory: false, defaultEnabled: true, supportedEfforts: ['max', 'xhigh', 'high', 'medium', 'low'] } });
    expect(resolveReasoning('off', claude)).toEqual({ enabled: false });
    expect(resolveReasoning('high', claude)).toEqual({ effort: 'high' });
    const gpt55 = infoWith({ reasoning: { mandatory: false, defaultEnabled: true, supportedEfforts: ['xhigh', 'high', 'medium', 'low', 'none'] } });
    expect(resolveReasoning('off', gpt55)).toEqual({ effort: 'none' });
    const qwen = infoWith({ reasoning: { mandatory: false, defaultEnabled: false, supportedEfforts: [] } });
    expect(resolveReasoning('off', qwen)).toEqual({ enabled: false });
    expect(resolveReasoning('high', qwen)).toEqual({ effort: 'high' });
    const noMeta = infoWith({ reasoning: null });
    expect(resolveReasoning('off', noMeta)).toEqual({ enabled: false });
    expect(resolveReasoning('medium', noMeta)).toEqual({ effort: 'medium' });
    expect(isMandatoryReasoningModel(claude)).toBe(false);
  });

  it('dials a model that always reasons down to its minimum instead', () => {
    const gpt5 = infoWith({ reasoning: { mandatory: true, defaultEnabled: true, supportedEfforts: ['high', 'medium', 'low', 'minimal'] } });
    expect(resolveReasoning('off', gpt5)).toEqual({ effort: 'minimal' });
    expect(resolveReasoning('medium', gpt5)).toEqual({ effort: 'medium' });
    expect(resolveReasoning('high', gpt5)).toEqual({ effort: 'high' });
    expect(isMandatoryReasoningModel(gpt5)).toBe(true);
    const noEfforts = infoWith({ reasoning: { mandatory: true, defaultEnabled: true, supportedEfforts: [] } });
    expect(resolveReasoning('off', noEfforts)).toBeNull();
    expect(resolveReasoning('high', noEfforts)).toEqual({ effort: 'high' });
  });

  it('picks the nearest supported effort, upwards on a tie for medium/high', () => {
    const deepseek = infoWith({ reasoning: { mandatory: false, defaultEnabled: true, supportedEfforts: ['max', 'high', 'low'] } });
    expect(resolveReasoning('medium', deepseek)).toEqual({ effort: 'high' });
    const xhighOnly = infoWith({ reasoning: { mandatory: true, defaultEnabled: true, supportedEfforts: ['xhigh', 'high'] } });
    expect(resolveReasoning('medium', xhighOnly)).toEqual({ effort: 'high' });
    expect(resolveReasoning('off', xhighOnly)).toEqual({ effort: 'high' });
  });
});

describe('normalizeOpenRouterSelection', () => {
  const models = parseOpenRouterCatalogue({
    data: [
      rawModel({ id: 'openai/gpt-5-mini', name: 'OpenAI: GPT-5 Mini', created: 9 }),
      rawModel({ id: 'anthropic/claude-opus-5', name: 'Claude Opus 5', created: 8 }),
      rawModel({ id: 'openrouter/free', name: 'Free Models Router', created: 1, pricing: { prompt: '0', completion: '0' } }),
      rawModel({ id: 'nex-agi/mini:free', name: 'Nex AGI: Mini (free)', created: 7, pricing: { prompt: '0', completion: '0' } }),
    ],
  });
  it('keeps ids the catalogue has and maps retired ones to the default', () => {
    expect(normalizeOpenRouterSelection('anthropic/claude-opus-5', models)).toBe('anthropic/claude-opus-5');
    expect(normalizeOpenRouterSelection('openai/gpt-4o-mini-retired', models)).toBe('openai/gpt-5-mini');
  });
  it('maps a retired free id to the first free entry', () => {
    expect(normalizeOpenRouterSelection('google/old-model:free', models)).toBe('openrouter/free');
  });
  it('never turns a free selection into a paid model', () => {
    const paidOnly = models.filter((m) => !m.id.endsWith(':free') && m.id !== 'openrouter/free');
    expect(normalizeOpenRouterSelection('openrouter/free', paidOnly)).toBe('openrouter/free');
    expect(normalizeOpenRouterSelection('google/old-model:free', paidOnly)).toBe('google/old-model:free');
  });
  it('leaves the id alone while the catalogue is not loaded', () => {
    expect(normalizeOpenRouterSelection('anything/at-all', [])).toBe('anything/at-all');
  });
});

const params = {
  model: 'openai/gpt-5-mini',
  messages: [{ role: 'user' as const, content: 'hi' }],
  schema: { name: 'move_selection', schema: { type: 'object' } },
  thinkingLevel: 'high' as const,
};

describe('buildOpenRouterRequestBody', () => {
  it('sends a strict JSON schema, routed only to endpoints that honour it', () => {
    const body = buildOpenRouterRequestBody(params, infoWith({}));
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'move_selection', strict: true, schema: { type: 'object' } },
    });
    expect(body.provider).toEqual({ require_parameters: true });
    expect(body.reasoning).toEqual({ effort: 'high' });
    expect(body.messages).toBe(params.messages);
    expect(body.model).toBe('openai/gpt-5-mini');
  });

  it('falls back to JSON mode, then to nothing, by capability', () => {
    const jsonMode = buildOpenRouterRequestBody(params, infoWith({ supportsStructuredOutputs: false }));
    expect(jsonMode.response_format).toEqual({ type: 'json_object' });
    expect(jsonMode.provider).toBeUndefined();
    const plain = buildOpenRouterRequestBody(params, infoWith({ supportsStructuredOutputs: false, supportsJsonObject: false, supportsReasoning: false }));
    expect(plain.response_format).toBeUndefined();
    expect(plain.reasoning).toBeUndefined();
    const off = buildOpenRouterRequestBody({ ...params, thinkingLevel: 'off' }, infoWith({ reasoning: { mandatory: false, defaultEnabled: true, supportedEfforts: ['high', 'low'] } }));
    expect(off.reasoning).toEqual({ enabled: false });
  });

  it('sends no format at all for a model the catalogue does not know', () => {
    const body = buildOpenRouterRequestBody(params, null);
    expect(body.response_format).toBeUndefined();
    expect(body.provider).toBeUndefined();
    expect(body.reasoning).toEqual({ effort: 'high' });
    expect(buildOpenRouterRequestBody({ ...params, thinkingLevel: 'off' }, null).reasoning).toBeUndefined();
  });
});

describe('withAnthropicCacheBreakpoints', () => {
  const system = { role: 'system' as const, content: 'rules' };
  const u1 = { role: 'user' as const, content: 'turn 1' };
  const a1 = { role: 'assistant' as const, content: '{"moveIndex":0}', reasoning_details: [{ type: 'reasoning.text', text: 't' }] };
  const u2 = { role: 'user' as const, content: 'turn 2' };
  const part = (text: string) => [{ type: 'text', text, cache_control: { type: 'ephemeral' } }];

  it('marks the system prompt and the latest user turn of a multi-turn conversation', () => {
    const out = withAnthropicCacheBreakpoints('anthropic/claude-sonnet-5', [system, u1, a1, u2]);
    expect(out).toEqual([
      { role: 'system', content: part('rules') },
      u1,
      a1,
      { role: 'user', content: part('turn 2') },
    ]);
  });

  it('marks only the system prompt for a single-turn request (its prompt is never reused)', () => {
    expect(withAnthropicCacheBreakpoints('~anthropic/claude-sonnet-latest', [system, u1])).toEqual([
      { role: 'system', content: part('rules') },
      u1,
    ]);
  });

  it('leaves other vendors alone', () => {
    const messages = [system, u1, a1, u2];
    expect(withAnthropicCacheBreakpoints('openai/gpt-5-mini', messages)).toBe(messages);
    expect(withAnthropicCacheBreakpoints('openrouter/free', messages)).toBe(messages);
  });

  it('is applied by the request builder', () => {
    const body = buildOpenRouterRequestBody({ ...params, model: 'anthropic/claude-sonnet-5', messages: [system, u1, a1, u2] }, null);
    const sent = body.messages as Array<{ role: string; content: unknown }>;
    expect(sent[0].content).toEqual(part('rules'));
    expect(sent[3].content).toEqual(part('turn 2'));
    expect(sent[1]).toBe(u1);
    expect((buildOpenRouterRequestBody(params, null).messages as unknown[])).toBe(params.messages);
  });
});

describe('parseOpenRouterResponse', () => {
  const ok = {
    model: 'openai/gpt-5-mini',
    choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '{"moveIndex":1,"reasoning":"x"}', reasoning: 'thought' } }],
    usage: {
      prompt_tokens: 300, completion_tokens: 50, total_tokens: 350, cost: 0.0012, is_byok: false,
      prompt_tokens_details: { cached_tokens: 20, cache_write_tokens: 5 },
      completion_tokens_details: { reasoning_tokens: 10 },
    },
  };

  it('maps content, reasoning, the answering model and the usage block', () => {
    const r = parseOpenRouterResponse(ok);
    expect(r.text).toBe('{"moveIndex":1,"reasoning":"x"}');
    expect(r.reasoning).toBe('thought');
    expect(r.reasoningDetails).toBeNull();
    expect(r.finishReason).toBe('stop');
    expect(r.model).toBe('openai/gpt-5-mini');
    expect(r.usage).toEqual({
      promptTokens: 300, responseTokens: 50, thoughtTokens: 10, totalTokens: 350,
      cachedTokens: 20, cacheCreationTokens: 5, costUsd: 0.0012,
    });
  });

  it('adds the upstream charge of a BYOK request to the cost', () => {
    const r = parseOpenRouterResponse({
      ...ok,
      usage: { ...ok.usage, cost: 0.0001, cost_details: { upstream_inference_cost: 0.002 }, is_byok: true },
    });
    expect(r.usage.costUsd).toBeCloseTo(0.0021, 10);
  });

  it('leaves the cost undefined when it is not reported, and totals tokens itself', () => {
    const r = parseOpenRouterResponse({ ...ok, usage: { prompt_tokens: 10, completion_tokens: 5 } });
    expect(r.usage.costUsd).toBeUndefined();
    expect(r.usage.totalTokens).toBe(15);
    expect(r.usage.cachedTokens).toBe(0);
  });

  it('joins content parts and takes reasoning from reasoning_details when there is no string', () => {
    const details = [
      { type: 'reasoning.summary', summary: 'first' },
      { type: 'reasoning.encrypted', data: 'zzz' },
      { type: 'reasoning.text', text: 'second' },
    ];
    const r = parseOpenRouterResponse({
      choices: [{ message: { content: [{ type: 'text', text: '{"a":' }, { type: 'text', text: '1}' }], reasoning_details: details } }],
    });
    expect(r.text).toBe('{"a":1}');
    expect(r.reasoning).toBe('first\nsecond');
    expect(r.reasoningDetails).toBe(details);
  });

  it('turns error payloads into OpenRouterError, even on a 200', () => {
    expect(() => parseOpenRouterResponse({ error: { code: 402, message: 'Insufficient credits' } }))
      .toThrowError(/Insufficient credits \(HTTP 402\)/);
    expect(() => parseOpenRouterResponse({ choices: [] })).toThrow(OpenRouterError);
    expect(() => parseOpenRouterResponse({ choices: [{ finish_reason: 'error', error: { message: 'provider died' } }] }))
      .toThrowError(/provider died/);
  });
});

describe('extractJsonObject', () => {
  it('reads plain, fenced and prose-wrapped JSON', () => {
    expect(extractJsonObject('{"moveIndex":2,"reasoning":"r"}')).toEqual({ moveIndex: 2, reasoning: 'r' });
    expect(extractJsonObject('```json\n{"moveIndex": 0}\n```')).toEqual({ moveIndex: 0 });
    expect(extractJsonObject('Sure! Here is my move:\n{"moveIndex": 1, "reasoning": "take {the} 7"}\nDone.'))
      .toEqual({ moveIndex: 1, reasoning: 'take {the} 7' });
  });
  it('is null for anything that is not an object', () => {
    expect(extractJsonObject('no json here')).toBeNull();
    expect(extractJsonObject('[1,2]')).toBeNull();
    expect(extractJsonObject('')).toBeNull();
  });
});

describe('openRouterChat', () => {
  const fetchMock = vi.fn();
  const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
  const success = {
    choices: [{ finish_reason: 'stop', message: { content: '{"moveIndex":0,"reasoning":"ok"}' } }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost: 0.00001 },
  };

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('posts the bearer key, the attribution headers and the built body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, success));
    const result = await openRouterChat('sk-or-test', params);
    expect(result.text).toBe('{"moveIndex":0,"reasoning":"ok"}');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer sk-or-test');
    expect(init.headers['HTTP-Referer']).toMatch(/^https?:\/\//);
    expect(init.headers['X-Title']).toBeTruthy();
    expect(init.headers['X-OpenRouter-Title']).toBe(init.headers['X-Title']);
    const body = JSON.parse(init.body);
    expect(body.model).toBe('openai/gpt-5-mini');
    expect(body.messages).toEqual(params.messages);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('retries a rate limit (honouring Retry-After) and then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(429, { error: { code: 429, message: 'slow down' } }, { 'retry-after': '2' }))
      .mockResolvedValueOnce(jsonResponse(200, success));
    const promise = openRouterChat('sk-or-test', params);
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const result = await promise;
    expect(result.usage.costUsd).toBe(0.00001);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after three attempts on a persistent 503', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(503, { error: { code: 503, message: 'no provider' } }));
    const promise = openRouterChat('sk-or-test', params);
    const expectation = expect(promise).rejects.toThrowError(/no provider \(HTTP 503\)/);
    await vi.runAllTimersAsync();
    await expectation;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry a billing or auth error and keeps the status in the message', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(402, { error: { code: 402, message: 'Insufficient credits' } }));
    await expect(openRouterChat('sk-or-test', params)).rejects.toThrowError(/Insufficient credits \(HTTP 402\)/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: { code: 401, message: 'No auth' } }));
    await expect(openRouterChat('sk-or-test', params)).rejects.toBeInstanceOf(OpenRouterError);
  });

  it('rejects an error body that came with a 200', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { error: { code: 400, message: 'bad schema' } }));
    await expect(openRouterChat('sk-or-test', params)).rejects.toThrowError(/bad schema/);
  });

  it('retries a network failure and reports it when it persists', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const promise = openRouterChat('sk-or-test', params);
    const expectation = expect(promise).rejects.toThrowError(/Could not reach OpenRouter/);
    await vi.runAllTimersAsync();
    await expectation;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('reports a caller-side abort as a cancellation, with no retry', async () => {
    fetchMock.mockImplementation((_url: string, init: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })
    );
    const controller = new AbortController();
    const promise = openRouterChat('sk-or-test', params, { signal: controller.signal });
    const expectation = expect(promise).rejects.toBeInstanceOf(OpenRouterCancelledError);
    controller.abort();
    await vi.runAllTimersAsync();
    await expectation;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // already aborted before the call: no fetch at all
    await expect(openRouterChat('sk-or-test', params, { signal: controller.signal })).rejects.toBeInstanceOf(OpenRouterCancelledError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('times out a request that never answers', async () => {
    fetchMock.mockImplementation((_url: string, init: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })
    );
    const promise = openRouterChat('sk-or-test', params, { timeoutMs: 50 });
    const expectation = expect(promise).rejects.toThrowError(/timed out/);
    await vi.advanceTimersByTimeAsync(60);
    await expectation;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('fetchOpenRouterModels', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    clearOpenRouterModelCache();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    clearOpenRouterModelCache();
  });

  it('fetches the public catalogue once and serves it from the cache after that', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(catalogue), { status: 200 }));
    expect(isOpenRouterCatalogueLoaded()).toBe(false);
    const first = await fetchOpenRouterModels();
    expect(isOpenRouterCatalogueLoaded()).toBe(true);
    expect(first.map((m) => m.id)).toContain('openai/gpt-5-mini');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/models');
    // no key goes out for the public catalogue
    expect(fetchMock.mock.calls[0][1]?.headers?.Authorization).toBeUndefined();
    const second = await fetchOpenRouterModels();
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getCachedOpenRouterModels()).toBe(first);
    expect(getCachedOpenRouterModel('openai/gpt-5-mini')?.displayName).toBe('GPT-5 Mini');
    expect(openRouterModelDisplayName('openai/gpt-5-mini')).toBe('GPT-5 Mini');
  });

  it('answers with the built-in list when the catalogue is unreachable, without caching it', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    const models = await fetchOpenRouterModels();
    expect(models.map((m) => m.id)).toContain('openai/gpt-5-mini');
    expect(getCachedOpenRouterModels()).toEqual([]);
    // the fallback is a list to pick from, not a catalogue to normalize against
    expect(isOpenRouterCatalogueLoaded()).toBe(false);
    // and it keeps the free router reachable from the Free AI category
    expect(models.map((m) => m.id)).toContain('openrouter/free');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(catalogue), { status: 200 }));
    await fetchOpenRouterModels();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getCachedOpenRouterModels().length).toBeGreaterThan(3);
  });

  it('names an unknown model readably from its id', () => {
    expect(openRouterModelDisplayName('deepseek/deepseek-v4.1-flash')).toBe('Deepseek V4.1 Flash');
    expect(openRouterModelDisplayName('~openai/gpt-sol-latest')).toBe('GPT Sol Latest');
    expect(openRouterModelDisplayName('google/gemma-4-31b-it:free')).toBe('Gemma 4 31B It (free)');
  });
});

describe('describeOpenRouterError', () => {
  it('names the upstream provider and quotes its message', () => {
    const text = describeOpenRouterError(
      { error: { code: 429, message: 'Provider returned error', metadata: { provider_name: 'Google AI Studio', raw: '{"error":{"message":"Resource has been exhausted (e.g. check quota).","status":"RESOURCE_EXHAUSTED"}}' } } },
      429,
      'google/gemma-4-31b-it:free'
    );
    expect(text).toBe(
      'Provider returned error — from Google AI Studio — {"error":{"message":"Resource has been exhausted (e.g. check quota).","status":"RESOURCE_EXHAUSTED"}} — free models share a public quota; wait a bit or pick another model'
    );
  });

  it('reads a structured raw payload and skips the free-model hint for paid models', () => {
    const text = describeOpenRouterError(
      { error: { code: 429, message: 'Provider returned error', metadata: { provider_name: 'DeepInfra', raw: { error: { message: 'Too many requests' } } } } },
      429,
      'google/gemma-4-31b-it'
    );
    expect(text).toBe('Provider returned error — from DeepInfra — Too many requests');
  });

  it('falls back to a generic message and keeps the status in the thrown error', async () => {
    expect(describeOpenRouterError(null, 502)).toBe('OpenRouter request failed');
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: 429, message: 'Provider returned error', metadata: { provider_name: 'Google AI Studio' } } }), { status: 429 })
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    try {
      const promise = openRouterChat('sk-or-test', { ...params, model: 'google/gemma-4-31b-it:free' });
      const expectation = expect(promise).rejects.toThrowError(
        /Provider returned error — from Google AI Studio — free models share a public quota; wait a bit or pick another model \(HTTP 429\)/
      );
      await vi.runAllTimersAsync();
      await expectation;
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});

describe('free models', () => {
  it('recognises the :free variants and the free router', () => {
    expect(isFreeOpenRouterModel('google/gemma-4-31b-it:free')).toBe(true);
    expect(isFreeOpenRouterModel('openrouter/free')).toBe(true);
    expect(isFreeOpenRouterModel('google/gemma-4-31b-it')).toBe(false);
    expect(isFreeOpenRouterModel('openrouter/auto')).toBe(false);
  });

  it('lists the router first, then the free variants, and nothing paid', () => {
    const models = parseOpenRouterCatalogue({
      data: [
        rawModel({ id: 'google/gemma-4-31b-it:free', name: 'Google: Gemma 4 31B (free)', created: 5, pricing: { prompt: '0', completion: '0' } }),
        rawModel({ id: 'openai/gpt-5-mini', name: 'OpenAI: GPT-5 Mini', created: 9 }),
        rawModel({ id: 'openrouter/free', name: 'Free Models Router', created: 1, pricing: { prompt: '0', completion: '0' } }),
        rawModel({ id: 'nex-agi/mini:free', name: 'Nex AGI: Mini (free)', created: 7, pricing: { prompt: '0', completion: '0' } }),
      ],
    });
    expect(freeOpenRouterModels(models).map((m) => m.id)).toEqual([
      'openrouter/free',
      'google/gemma-4-31b-it:free',
      'nex-agi/mini:free',
    ]);
  });
});
