# OpenAI GPT AI Player - Implementation Plan

**Created:** 2026-01-01
**Status:** Draft

---

## Overview

Implement an OpenAI GPT AI player following the same patterns as the existing Gemini AI implementation. The player will use the OpenAI Chat Completions API with structured JSON outputs for move selection.

---

## Research Summary

### Key Findings from OpenAI Documentation

1. **SDK Package**: `openai` npm package (official TypeScript/JavaScript SDK)
2. **Browser Support**: `dangerouslyAllowBrowser: true` option enables client-side usage
3. **Structured Outputs**: `response_format: { type: "json_schema", json_schema: { ... } }` with `strict: true`
4. **Token Usage**: Response includes `usage.prompt_tokens`, `usage.completion_tokens`, `usage.total_tokens`
5. **List Models**: `client.models.list()` endpoint available

### Available Models (2025)

| Model Family | Models | Notes |
|--------------|--------|-------|
| **GPT-4.1** | gpt-4.1, gpt-4.1-mini, gpt-4.1-nano | Latest flagship, up to 1M context |
| **GPT-4o** | gpt-4o, gpt-4o-mini | Multimodal, good for structured outputs |
| **o-series** | o3, o4-mini, o1-pro, o3-mini | Reasoning models |
| **GPT-5** | gpt-5, gpt-5-mini, gpt-5.1, gpt-5.2 | Latest reasoning flagship |

### Structured Outputs Format

```typescript
response_format: {
  type: "json_schema",
  json_schema: {
    name: "move_selection",
    schema: {
      type: "object",
      properties: {
        moveIndex: { type: "integer" },
        reasoning: { type: "string" }
      },
      required: ["moveIndex", "reasoning"],
      additionalProperties: false
    },
    strict: true
  }
}
```

### Token Usage Response

```typescript
response.usage: {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
    audio_tokens?: number;
  };
  completion_tokens_details?: {
    reasoning_tokens?: number;
    audio_tokens?: number;
  };
}
```

---

## Architecture

### File Structure

```
src/ai/
├── openai.ts              # Main OpenAI AI implementation
├── openai-singleturn.ts   # Single-turn variant (optional future)
├── types.ts               # (existing) Add OpenAI token stats types
└── index.ts               # (update) Export OpenAI AI
```

### Key Differences from Gemini

| Aspect | Gemini | OpenAI |
|--------|--------|--------|
| SDK Package | `@google/genai` | `openai` |
| Browser Header | (built-in CORS) | `dangerouslyAllowBrowser: true` |
| Chat Sessions | `ai.chats.create()` | Maintain messages array manually |
| Structured Output | `responseMimeType` + `responseSchema` | `response_format.json_schema` |
| Token Fields | `promptTokenCount`, `candidatesTokenCount`, `thoughtsTokenCount` | `prompt_tokens`, `completion_tokens`, `reasoning_tokens` |
| Model List | `ai.models.list()` | `client.models.list()` |

---

## Implementation Steps

### Step 1: Install OpenAI SDK

**Task:** Add OpenAI package to project dependencies.

```bash
npm install openai
```

**Validation:**
- Package appears in `package.json` dependencies
- TypeScript can import `OpenAI` from `'openai'`

---

### Step 2: Create Token Stats Types

**Task:** Define OpenAI-specific token statistics interface.

**File:** `src/ai/openai.ts`

```typescript
export interface OpenAIModelInfo {
  id: string;
  displayName: string;
}

export interface OpenAITokenStats {
  promptTokens: number;
  responseTokens: number;
  reasoningTokens: number;  // For o-series models
  totalTokens: number;
  cachedTokens: number;
  requestCount: number;
  // Round-specific stats
  roundPromptTokens: number;
  roundResponseTokens: number;
  roundReasoningTokens: number;
  roundTotalTokens: number;
  roundRequestCount: number;
  // Model info
  modelId: string;
  modelDisplayName: string;
  // Timing stats
  totalTimeMs: number;
  lastTurnTimeMs: number;
  minTurnTimeMs: number;
  maxTurnTimeMs: number;
  roundTotalTimeMs: number;
}

export interface OpenAITokenDelta {
  promptTokens: number;
  responseTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  turnTimeMs: number;
}
```

**Validation:**
- Types compile without errors
- Structure matches Gemini token stats pattern

---

### Step 3: Implement Model Fetching

**Task:** Create function to fetch available OpenAI models.

```typescript
const DEFAULT_MODEL = 'gpt-4o-mini';

let cachedModels: OpenAIModelInfo[] | null = null;
let modelsFetchPromise: Promise<OpenAIModelInfo[]> | null = null;

// Allowlist pattern for chat models
const ALLOWED_PATTERN = /^(gpt-4\.1|gpt-4o|gpt-4-turbo|gpt-5|o[134])(-mini|-nano|-pro)?(-\d{4}-\d{2}-\d{2})?$/;

export async function fetchOpenAIModels(): Promise<OpenAIModelInfo[]> {
  if (cachedModels !== null) return cachedModels;
  if (modelsFetchPromise !== null) return modelsFetchPromise;

  const apiKey = getOpenAIApiKey();
  if (!apiKey) return [];

  modelsFetchPromise = (async () => {
    try {
      const client = new OpenAI({
        apiKey,
        dangerouslyAllowBrowser: true
      });

      const models: OpenAIModelInfo[] = [];
      const response = await client.models.list();

      for (const model of response.data) {
        if (ALLOWED_PATTERN.test(model.id)) {
          models.push({
            id: model.id,
            displayName: formatModelName(model.id)
          });
        }
      }

      // Sort by version descending
      models.sort((a, b) => b.id.localeCompare(a.id));

      cachedModels = models;
      return models;
    } catch (error) {
      console.error('Failed to fetch OpenAI models:', error);
      return [
        { id: 'gpt-4o-mini', displayName: 'GPT-4o Mini' },
        { id: 'gpt-4o', displayName: 'GPT-4o' },
        { id: 'gpt-4.1-mini', displayName: 'GPT-4.1 Mini' },
      ];
    } finally {
      modelsFetchPromise = null;
    }
  })();

  return modelsFetchPromise;
}
```

**Validation:**
- Returns list of models when API key available
- Falls back to defaults on error
- Filters to only chat-capable models

---

### Step 4: Implement OpenAI AI Class

**Task:** Create the main OpenAI AI player class.

```typescript
class OpenAIAI implements AsyncAIPlayer {
  readonly name: string;
  readonly isAsync = true as const;

  private client: OpenAI;
  private model: string;
  private modelDisplayName: string;
  private messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
  public lastReasoning: string = '';
  public tokenStats: OpenAITokenStats;
  public lastDelta: OpenAITokenDelta;

  constructor(apiKey: string, model: string = DEFAULT_MODEL) {
    this.client = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true
    });
    this.model = model;
    this.modelDisplayName = formatModelName(model);
    this.name = this.modelDisplayName;
    // Initialize token stats...
  }

  startRound(): void {
    this.resetRoundStats();
    // Initialize messages with system instruction
    this.messages = [{
      role: 'system',
      content: SYSTEM_INSTRUCTION
    }];
  }

  endRound(): void {
    this.messages = [];
  }

  async selectMove(context: LLMAIContext): Promise<Move> {
    // Build prompt, call API with structured output, parse response
  }
}
```

**Validation:**
- Class implements `AsyncAIPlayer` interface
- `startRound()` initializes fresh conversation
- `selectMove()` returns valid moves

---

### Step 5: Implement API Call with Structured Output

**Task:** Implement the `selectMove` method with structured JSON output.

```typescript
async selectMove(context: LLMAIContext): Promise<Move> {
  const { hand, table, player, validMoves } = context;

  if (hand.length === 0) throw new Error('Cannot select move with empty hand');
  if (validMoves.length === 0) throw new Error('No valid moves available');

  if (!this.messages.length) this.startRound();

  if (validMoves.length === 1) {
    // Handle single move case (still track for context)
    const prompt = buildPrompt(context);
    this.messages.push({ role: 'user', content: prompt });
    this.lastReasoning = 'Only one move available.';
    return validMoves[0];
  }

  try {
    const prompt = buildPrompt(context);
    this.messages.push({ role: 'user', content: prompt });

    const startTime = performance.now();
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: this.messages,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'move_selection',
          schema: {
            type: 'object',
            properties: {
              moveIndex: { type: 'integer' },
              reasoning: { type: 'string' }
            },
            required: ['moveIndex', 'reasoning'],
            additionalProperties: false
          },
          strict: true
        }
      }
    });
    const turnTime = performance.now() - startTime;

    this.updateTokenStats(response.usage);
    this.updateTimingStats(turnTime);

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from AI');

    const result = JSON.parse(content);
    this.lastReasoning = result.reasoning || '';

    // Add assistant response to messages for context
    this.messages.push({ role: 'assistant', content });

    if (typeof result.moveIndex === 'number' &&
        result.moveIndex >= 0 &&
        result.moveIndex < validMoves.length) {
      console.log(`[OpenAI] ${this.lastReasoning}`);
      return validMoves[result.moveIndex];
    }

    console.warn(`[OpenAI] Invalid moveIndex ${result.moveIndex}, using first valid move`);
    return validMoves[0];
  } catch (error) {
    console.error('OpenAI AI error, falling back to random:', error);
    this.lastReasoning = 'Error occurred, random fallback.';
    return randomAI.selectMove({ hand, table, player });
  }
}
```

**Validation:**
- Structured output schema enforced
- Token stats tracked from response
- Falls back to random on error
- Maintains conversation history

---

### Step 6: Add Helper Functions and Exports

**Task:** Create factory functions and exports matching Gemini pattern.

```typescript
export function isOpenAIAvailable(): boolean {
  return !!import.meta.env.VITE_OPENAI_API_KEY;
}

export function getOpenAIApiKey(): string | null {
  return import.meta.env.VITE_OPENAI_API_KEY || null;
}

export function createOpenAI(model: string = DEFAULT_MODEL): AsyncAIPlayer | null {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    console.warn('OpenAI API key not found. Set VITE_OPENAI_API_KEY in .env.local');
    return null;
  }
  return new OpenAIAI(apiKey, model);
}

// Cached instance management
let cachedInstance: AsyncAIPlayer | null = null;
let cachedModelId: string | null = null;

export function getOpenAI(model: string = DEFAULT_MODEL): AsyncAIPlayer | null {
  if (!isOpenAIAvailable()) return null;
  if (cachedInstance !== null && cachedModelId === model) return cachedInstance;
  cachedInstance = createOpenAI(model);
  cachedModelId = model;
  return cachedInstance;
}

// Token stats accessors
export function getOpenAITokenStats(): OpenAITokenStats | null { /* ... */ }
export function getOpenAITokenDelta(): OpenAITokenDelta | null { /* ... */ }
export function resetOpenAITokenStats(): void { /* ... */ }
export function startOpenAIRound(): void { /* ... */ }
export function endOpenAIRound(): void { /* ... */ }
```

**Validation:**
- All functions exported correctly
- Caching works as expected
- Token stats accessible from cached instance

---

### Step 7: Update AI Index Exports

**Task:** Update `src/ai/index.ts` to export OpenAI AI.

```typescript
// Add imports
import {
  getOpenAI, isOpenAIAvailable, createOpenAI,
  fetchOpenAIModels, getCachedOpenAIModels, getDefaultOpenAIModel,
  getOpenAITokenStats, getOpenAITokenDelta, resetOpenAITokenStats,
  startOpenAIRound, endOpenAIRound,
  type OpenAIModelInfo, type OpenAITokenStats, type OpenAITokenDelta
} from './openai';

// Add to exports
export {
  getOpenAI, isOpenAIAvailable, createOpenAI,
  fetchOpenAIModels, getCachedOpenAIModels, getDefaultOpenAIModel,
  getOpenAITokenStats, getOpenAITokenDelta, resetOpenAITokenStats,
  startOpenAIRound, endOpenAIRound
};
export type { OpenAIModelInfo, OpenAITokenStats, OpenAITokenDelta };

// Update ExtendedAIType
export type ExtendedAIType = AIType | 'gemini' | 'gemini-singleturn' | 'openai' | 'openai-singleturn';

// Update AI_INFO
export const AI_INFO: Record<ExtendedAIType, { name: string; description: string; isAsync?: boolean; icon: string }> = {
  // ... existing entries ...
  openai: { name: 'GPT 💬', description: 'OpenAI GPT with multi-turn chat', isAsync: true, icon: '🤖' },
  'openai-singleturn': { name: 'GPT 1️⃣', description: 'OpenAI GPT with single requests', isAsync: true, icon: '🤖' },
};

// Update getAvailableAITypes
export function getAvailableAITypes(): ExtendedAIType[] {
  const types: ExtendedAIType[] = ['random', 'heuristic'];
  if (isGeminiAvailable()) {
    types.push('gemini');
    types.push('gemini-singleturn');
  }
  if (isOpenAIAvailable()) {
    types.push('openai');
    types.push('openai-singleturn');
  }
  return types;
}

// Add helper
export function isOpenAIAIType(aiType: ExtendedAIType): boolean {
  return aiType === 'openai' || aiType === 'openai-singleturn';
}
```

**Validation:**
- OpenAI appears in available AI types when key set
- All exports accessible from `@/ai`

---

### Step 8: Update App Integration

**Task:** Integrate OpenAI AI into game flow in `App.tsx`.

Updates needed:
1. Import OpenAI functions
2. Add OpenAI model selection to settings/start screen
3. Handle OpenAI player selection in `getCpuAI()` function
4. Track OpenAI token stats alongside Gemini

```typescript
// In getCpuAI function
if (aiType === 'openai' || aiType === 'openai-singleturn') {
  const ai = getOpenAI(openaiModel);
  if (ai) return ai;
  // Fallback to heuristic
  return heuristicAI;
}
```

**Validation:**
- OpenAI can be selected as opponent
- Token stats display correctly for OpenAI games
- Game flow works identically to Gemini

---

### Step 9: Update Settings/UI Components

**Task:** Add OpenAI model selection UI.

Updates to `SettingsModal.tsx` and `StartScreen.tsx`:
1. Add OpenAI model dropdown (similar to Gemini)
2. Fetch and display available OpenAI models
3. Store selected model in settings

Updates to `useSettings.ts`:
```typescript
interface Settings {
  // ... existing fields ...
  openaiModel: string;
}
```

**Validation:**
- OpenAI model can be selected in settings
- Selection persists across sessions
- Models fetch on first open

---

### Step 10: Create Single-Turn Variant (Optional)

**Task:** Implement `openai-singleturn.ts` for stateless single-turn mode.

Same pattern as `gemini-singleturn.ts`:
- Send full game history with each request
- No conversation state maintained
- Useful for comparison/debugging

**Validation:**
- Single-turn mode works without conversation history
- Both modes produce valid moves

---

## Environment Variables

Add to `.env.local`:
```
VITE_OPENAI_API_KEY=sk-...
```

---

## Testing Checklist

- [ ] OpenAI SDK installs and imports correctly
- [ ] API key detection works (`isOpenAIAvailable()`)
- [ ] Model list fetches successfully
- [ ] Structured output response parses correctly
- [ ] Token stats track accurately
- [ ] Multi-turn conversation maintains context
- [ ] Fallback to random on API errors
- [ ] UI shows OpenAI as selectable opponent
- [ ] Model selection persists in settings
- [ ] Game plays correctly with OpenAI opponent
- [ ] Spectator mode works with OpenAI vs Gemini

---

## Sources

- [OpenAI Structured Outputs Guide](https://platform.openai.com/docs/guides/structured-outputs)
- [OpenAI Chat Completions API](https://platform.openai.com/docs/api-reference/chat)
- [OpenAI Models Documentation](https://platform.openai.com/docs/models)
- [OpenAI Node.js SDK](https://github.com/openai/openai-node)
- [OpenAI npm package](https://www.npmjs.com/package/openai)
