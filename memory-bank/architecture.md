# Scopa WebApp - Architecture

**Last Updated:** 2026-01-02 (Phase 30: Expert AI & Background Simulation)

---

## Overview

Scopa is a static single-page application built with React, TypeScript, and Vite. No backend required - all game logic runs client-side, and LLM API calls go directly from browser to providers.

---

## Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.3.x | UI framework |
| TypeScript | 5.6.x | Type safety |
| Vite | 6.x | Build tool & dev server |
| Framer Motion | 11.x | Card animations |
| Terser | 5.x | Production minification |
| Vitest | 3.x | Unit testing |

---

## Project Structure

```
scopa-ai-claude/
├── index.html              # Entry HTML, loads /src/main.tsx
├── package.json            # Dependencies & scripts
├── vite.config.ts          # Vite configuration
├── tsconfig.json           # TypeScript config (src files)
├── tsconfig.node.json      # TypeScript config (build tools)
├── eslint.config.js        # ESLint configuration
│
├── public/                 # Static assets (copied to dist/)
│   ├── cards/
│   │   └── napoletane/     # Neapolitan deck (WebP format)
│   │       ├── *.webp      # 40 card faces + back (~780KB total)
│   │       └── suits/      # Suit SVGs from Wikimedia Commons
│   │           ├── coins.svg, cups.svg, swords.svg, clubs.svg
│   ├── sounds/             # Audio files (future)
│   └── vite.svg            # Favicon
│
├── local/                  # Development files (gitignored)
│   ├── napoletane*.svg     # Source sprite sheets (~105MB)
│   ├── individual*/        # Extracted standalone SVGs
│   └── napolitane-back.png # Source card back image
│
├── src/
│   ├── main.tsx            # React entry point, renders App
│   ├── App.tsx             # Root component
│   ├── index.css           # Global styles & CSS variables
│   ├── vite-env.d.ts       # Vite type declarations
│   │
│   ├── components/         # React UI components
│   │   ├── Card/           # Card display component
│   │   ├── Table/          # Game table, hands, captured piles
│   │   ├── UI/             # Scoreboard, modals, controls
│   │   └── Layout/         # Page layout components
│   │
│   ├── game/               # Game logic (pure TypeScript)
│   │   ├── types.ts        # Card, GameState, Move, RoundScore interfaces
│   │   ├── types.test.ts   # Type validation tests
│   │   ├── constants.ts    # SUITS, PRIME_VALUES, game rules
│   │   ├── constants.test.ts # Constants tests
│   │   ├── deck.ts         # Deck creation, shuffling, dealing
│   │   ├── deck.test.ts    # Deck tests (21 tests)
│   │   ├── rules.ts        # Capture detection, move validation, execution
│   │   ├── rules.test.ts   # Rules tests (33 tests)
│   │   ├── scoring.ts      # Round scoring (cards, coins, prime, etc.)
│   │   ├── scoring.test.ts # Scoring tests (24 tests)
│   │   ├── reducer.ts      # Game state reducer and actions
│   │   └── reducer.test.ts # Reducer tests (29 tests)
│   │
│   ├── ai/                 # AI opponent implementations
│   │   ├── index.ts        # AI exports and registry
│   │   ├── types.ts        # AIPlayer, AsyncAIPlayer, AIContext, LLMAIContext
│   │   ├── prompts.ts      # Shared prompts for LLM AIs
│   │   ├── random.ts       # Random AI (Scimmietta)
│   │   ├── heuristic.ts    # Greedy heuristic AI (Furbo)
│   │   ├── expert.ts       # Expert AI (ISMCTS with determinization)
│   │   ├── gemini.ts       # Gemini LLM AI (multi-turn chat)
│   │   ├── gemini-singleturn.ts  # Gemini single-turn mode
│   │   ├── openai.ts       # OpenAI GPT AI (Responses API, conversation state)
│   │   ├── openai-singleturn.ts  # OpenAI single-turn mode
│   │   ├── claude.ts       # Claude AI (Messages API, local conversation state)
│   │   └── claude-singleturn.ts  # Claude single-turn mode
│   │
│   ├── workers/            # Web Workers for background processing
│   │   └── gameSimulation.worker.ts  # Background CPU vs CPU simulation
│   │
│   ├── hooks/              # React hooks
│   │   ├── useGame.ts      # Main game state hook
│   │   ├── useSettings.ts  # Settings with localStorage
│   │   └── useGameWorker.ts # Web Worker management for background simulation
│   │
│   └── utils/              # Utility functions
│       └── (storage.ts, cards.ts)
│
├── dist/                   # Production build output
│   ├── index.html          # Built HTML with relative paths
│   ├── assets/             # Bundled JS/CSS with hashes
│   ├── cards/              # Copied from public/
│   └── sounds/             # Copied from public/
│
└── memory-bank/            # Design documentation
    ├── architecture.md     # This file
    ├── progress.md         # Development tracking
    ├── game-design-document.md
    ├── tech-stack.md
    └── implementation-plan.md
```

---

## Key Files Explained

### Configuration Files

| File | Purpose |
|------|---------|
| `vite.config.ts` | Sets `base: './'` for relative paths, enables terser minification, splits framer-motion into separate chunk |
| `tsconfig.json` | Strict TypeScript for src/, targets ES2020, uses React JSX transform |
| `tsconfig.node.json` | TypeScript for build config files, uses `composite: true` for project references |

### Source Files

| File | Purpose |
|------|---------|
| `src/main.tsx` | Creates React root, renders `<App />` in StrictMode |
| `src/App.tsx` | Root component, will contain game state and main layout |
| `src/index.css` | CSS variables for theming, CSS reset, base body styles |

---

## CSS Variables

Defined in `src/index.css` under `:root`:

| Variable | Value | Purpose |
|----------|-------|---------|
| `--color-table` | `#1B5E20` | Green felt background |
| `--color-card-back` | `#1a237e` | Navy card backs |
| `--color-accent` | `#D4AF37` | Gold highlights |
| `--color-text-primary` | `#ffffff` | Main text |
| `--color-text-secondary` | `rgba(255,255,255,0.7)` | Subdued text |
| `--space-{n}` | `4px * n` | Spacing scale |
| `--duration-fast/normal/slow` | `150/300/500ms` | Animation timing |
| `--card-width/height` | `70px/115px` | Card dimensions (matches SVG proportions) |
| `--card-border-radius` | `6px` | Card corner radius |
| `--card-img-scale` | `100%` | Card face image scale (clips border if >100%) |
| `--card-img-offset` | `0%` | Card face image margin offset (negative to center) |
| `--card-back-scale` | `100%` | Card back image scale |
| `--card-back-offset` | `0%` | Card back image margin offset |

---

## Build & Development

```bash
npm run dev        # Start dev server (hot reload)
npm run build      # Production build to dist/
npm run preview    # Serve production build locally
npm run lint       # Run ESLint
npm test           # Run unit tests once
npm run test:watch # Run tests in watch mode
```

### Production Build

- Output: `dist/` folder
- All asset paths are relative (`./assets/...`)
- Can be deployed to any subdirectory
- Framer Motion split into separate chunk for caching

---

## Architectural Decisions

1. **No state management library** - `useReducer` sufficient for single-player game
2. **CSS Modules for components** - Scoped styles without runtime overhead
3. **Pure game logic** - `src/game/` contains no React, fully testable
4. **Direct LLM API calls** - No backend proxy, user provides API keys

---

## Game Logic Types (src/game/)

### types.ts

| Type | Description |
|------|-------------|
| `Suit` | `'coins' \| 'cups' \| 'swords' \| 'clubs'` |
| `CardValue` | `1 \| 2 \| ... \| 10` |
| `Card` | `{ suit, value, id }` - id format: `'{suit}-{value}'` |
| `PlayerId` | `'human' \| 'cpu'` |
| `GameStatus` | `'idle' \| 'dealing' \| 'playing' \| 'roundEnd' \| 'gameEnd'` |
| `PlayerState` | `{ hand, captured, scopaCount, scopaCaptures }` |
| `RoundState` | `{ deck, table, currentPlayer, dealer, lastCapture }` |
| `GameState` | Complete game state with players, scores, round info, lastRoundScores |
| `Move` | `{ player, cardPlayed, capturedCards, isScopa }` |
| `RoundScore` | `{ cards, coins, setteBello, prime, scopas, total, counts }` |

### constants.ts

| Constant | Value | Description |
|----------|-------|-------------|
| `SUITS` | `['coins', 'cups', 'swords', 'clubs']` | All suits |
| `CARD_VALUES` | `[1, 2, ..., 10]` | All card values |
| `PRIME_VALUES` | `{7: 21, 6: 18, 1: 16, ...}` | Prime scoring values |
| `DEFAULT_TARGET_SCORE` | `11` | Points to win |
| `CARDS_PER_HAND` | `3` | Cards dealt per hand |
| `INITIAL_TABLE_CARDS` | `4` | Cards on table at start |
| `DECK_SIZE` | `40` | Total cards in deck |

---

## Deck Functions (src/game/deck.ts)

| Function | Signature | Description |
|----------|-----------|-------------|
| `createDeck` | `() => Card[]` | Creates 40-card deck with IDs like `'coins-7'` |
| `shuffleDeck` | `(deck: Card[]) => Card[]` | Fisher-Yates shuffle, returns new array |
| `dealCards` | `(deck, count) => { dealt, remaining }` | Deals from top, immutable |
| `isValidInitialDeal` | `(tableCards: Card[]) => boolean` | Returns false if 3+ kings |

---

## Rules Functions (src/game/rules.ts)

| Function | Signature | Description |
|----------|-----------|-------------|
| `findSingleCaptures` | `(playedCard, tableCards) => Card[]` | Find all table cards matching played card value |
| `findSumCaptures` | `(playedCard, tableCards) => Card[][]` | Find all 2+ card combinations summing to value |
| `getValidMoves` | `(card, tableCards, player) => Move[]` | Get all legal moves (single priority enforced) |
| `isValidMove` | `(move, hand, tableCards) => boolean` | Validate move legality (mandatory capture) |
| `executeMove` | `(state, move) => GameState` | Apply move, return new state (immutable) |

**Key Rules Implemented:**
- Single card captures take priority over sum captures
- Mandatory capture: cannot place if capture is possible
- Scopa: clearing the table awards bonus point

---

## Scoring Functions (src/game/scoring.ts)

| Function | Signature | Description |
|----------|-----------|-------------|
| `scoreCards` | `(human, cpu) => CategoryScore` | Point for most cards (tie = 0) |
| `scoreCoins` | `(human, cpu) => CategoryScore` | Point for most coins suit |
| `scoreSetteBello` | `(human, cpu) => CategoryScore` | Point for 7 of coins |
| `calculatePrime` | `(captured) => number \| null` | Sum of best card per suit (null if missing suit) |
| `scorePrime` | `(human, cpu) => CategoryScore` | Point for higher prime |
| `calculateRoundScore` | `(state) => { human, cpu }` | Complete RoundScore for both players |

**Scoring Categories:**
- Cards: Most cards captured (21+ guarantees)
- Coins: Most coins suit (6+ guarantees)
- Sette Bello: 7 of coins (1 point)
- Prime: Best primiera using PRIME_VALUES
- Scopas: 1 point each for clearing table

---

## Game Reducer (src/game/reducer.ts)

**Actions:**
| Action | Payload | Description |
|--------|---------|-------------|
| `START_GAME` | `{ targetScore }` | Initialize new game, deal cards |
| `PLAY_CARD` | `{ move }` | Execute player move, auto re-deal |
| `END_ROUND` | - | Award remaining cards, calculate scores |
| `NEXT_ROUND` | - | Rotate dealer, deal new round |
| `RESET_GAME` | - | Return to idle state |

**Key Functions:**
| Function | Description |
|----------|-------------|
| `createInitialState(targetScore)` | Create fresh GameState |
| `gameReducer(state, action)` | Main reducer function |

**Game Flow:**
1. `START_GAME` → status: 'playing', deal hands + table
2. `PLAY_CARD` → execute move, switch player, auto re-deal if needed
3. When deck + hands empty → status: 'roundEnd'
4. `END_ROUND` → award table to lastCapture, add scores, check win
5. `NEXT_ROUND` or `gameEnd` status

---

## useGame Hook (src/hooks/useGame.ts)

```typescript
const { state, startGame, playCard, endRound, nextRound, resetGame } = useGame();
```

All action dispatchers wrapped in `useCallback` for stable references.

---

## AI System (src/ai/)

### Types (types.ts)

| Type | Description |
|------|-------------|
| `AIContext` | Basic context: `hand`, `table`, `player` |
| `LLMAIContext` | Extended context for LLM AIs with scores, validMoves, lastOpponentMove, etc. |
| `AIPlayer` | Sync AI interface with `selectMove(context): Move` |
| `AsyncAIPlayer` | Async AI interface with `selectMove(context): Promise<Move>`, `startRound()`, `endRound()` |
| `AnyAIPlayer` | Union type `AIPlayer | AsyncAIPlayer` |

### Available AI Players

| AI | Name | Icon | Type | Strategy |
|----|------|------|------|----------|
| `randomAI` | Scimmietta | 🐒 | Sync | Picks random valid move |
| `heuristicAI` | Furbo | 🦊 | Sync | Greedy scoring: Scopa (+1000), Sette Bello (+500), Denari (+50), Prime cards (+30/20/15) |
| `expertAI` | Esperto | 🧠 | Sync | ISMCTS (Information Set Monte Carlo Tree Search) with determinization and alpha-beta pruning |
| `GeminiAI` | Gemini | ✦ (SVG) | Async | LLM-based using Google's Gemini API with structured JSON output |
| `OpenAIAI` | GPT | Blossom (SVG) | Async | LLM-based using OpenAI's Responses API with structured JSON output |
| `ClaudeAI` | Claude | 🔮 | Async | LLM-based using Anthropic's Messages API with tool use for structured output |

**Mode Icons:**
- 💬 = Multi-turn chat (conversation with memory)
- 1️⃣ = Single-turn (full history sent each request)

### AIPlayerLabel Component (UI/AIPlayerLabel.tsx)

Renders AI player names with proper SVG icons in brand colors:

| AI Type | Icon | Brand Color | Component |
|---------|------|-------------|-----------|
| `openai`, `openai-singleturn` | OpenAI blossom SVG | Green (#10A37F) | `<OpenAIIcon />` |
| `gemini`, `gemini-singleturn` | Sparkle SVG | Blue (#4285F4) | `<GeminiIcon />` |
| `claude`, `claude-singleturn` | Claude logo SVG | Coral (#D97757) | `<ClaudeIcon />` |
| `random` | 🐒 emoji | - | `<span>` |
| `heuristic` | 🦊 emoji | - | `<span>` |

**Icon Components (UI/):**
- `OpenAIIcon.tsx` - Official OpenAI blossom logo with brand color
- `GeminiIcon.tsx` - Four-pointed sparkle with Google blue
- `ClaudeIcon.tsx` - Official Claude logo from Bootstrap Icons with Anthropic coral

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `aiType` | `ExtendedAIType` | The AI type |
| `model` | `string` | Model ID for LLM AIs (optional) |
| `showModeIndicator` | `boolean` | Show 💬/1️⃣ suffix (default: true) |

### CustomDropdown Component (UI/CustomDropdown.tsx)

Custom dropdown that renders SVG icons (native `<select>` only supports text).

**Features:**
- Renders actual SVG icons with brand colors in dropdown options
- Keyboard navigation (arrow keys, enter, escape)
- Click outside to close
- Checkmark on selected option
- Matches native dropdown styling

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `options` | `DropdownOption<T>[]` | Array of `{ value, label, icon? }` |
| `value` | `T` | Currently selected value |
| `onChange` | `(value: T) => void` | Selection callback |
| `disabled` | `boolean` | Disable interaction |

Used in StartScreen for AI provider selection (Gemini/OpenAI/Claude).

### Gemini AI (gemini.ts)

**Architecture:**
- Uses `@google/genai` SDK with multi-turn chat sessions
- System instruction contains full Scopa rules, scoring, and prime values
- Structured JSON output schema: `{ moveIndex: number, reasoning: string }`
- Chat session persists within a round for context continuity

**Key Functions:**

| Function | Description |
|----------|-------------|
| `createGeminiAI(model)` | Creates new Gemini AI instance |
| `getGeminiAI(model)` | Gets cached instance (creates if needed) |
| `isGeminiAvailable()` | Checks if API key is configured |
| `fetchGeminiModels()` | Fetches available models from API |
| `getGeminiTokenStats()` | Returns cumulative token usage |
| `getGeminiTokenDelta()` | Returns last turn's token delta |
| `resetGeminiTokenStats()` | Resets token counters (for new game) |
| `startGeminiRound()` | Creates fresh chat session |
| `endGeminiRound()` | Clears chat session |

**Token Stats Tracked:**

| Stat | Description |
|------|-------------|
| `promptTokens` | Input tokens sent to API |
| `responseTokens` | Output tokens received |
| `thoughtTokens` | Thinking tokens (for thinking models) |
| `totalTokens` | Sum of all tokens |
| `cachedTokens` | Tokens served from cache |
| `requestCount` | Number of API calls made |
| `roundPromptTokens` | Round-specific input tokens |
| `roundResponseTokens` | Round-specific output tokens |
| `roundThoughtTokens` | Round-specific thinking tokens |
| `roundTotalTokens` | Round-specific total tokens |
| `roundRequestCount` | Round-specific API calls |
| `modelId` | Model ID (e.g., `gemini-2.5-flash`) |
| `modelDisplayName` | Display name (e.g., `Gemini 2.5 Flash`) |

**Timing Stats Tracked:**

| Stat | Description |
|------|-------------|
| `totalTimeMs` | Cumulative time across all turns |
| `lastTurnTimeMs` | Time for most recent turn |
| `minTurnTimeMs` | Fastest turn time |
| `maxTurnTimeMs` | Slowest turn time |
| `roundTotalTimeMs` | Time for current round only |

**Configuration:**
- API key: `VITE_GEMINI_API_KEY` environment variable
- Default model: `gemini-2.5-flash`
- Fallback: Random AI on API errors
- Model allowlist: `gemini-X[.X]-{flash|flash-lite|pro}[-thinking][-preview]`
- Preview models shown only if non-preview unavailable

### OpenAI AI (openai.ts)

**Architecture:**
- Uses `openai` SDK with `dangerouslyAllowBrowser: true` for client-side usage
- **Responses API with conversation state management** (server-side history)
- No manual message array - conversation ID is stored and passed to each request
- Same system instruction as Gemini (full Scopa rules, scoring, prime values)
- Structured JSON output via `text.format: { type: 'json_schema', name: '...', schema: {...} }`

**Responses API Flow:**
```
1. First request: no conversation param → API creates new conversation
2. Response includes conversation.id → stored in conversationId
3. Next request: conversation: { id: conversationId } → API continues conversation
4. startRound(): clear conversationId → fresh conversation next turn
```

**Key Functions:**

| Function | Description |
|----------|-------------|
| `createOpenAI(model)` | Creates new OpenAI AI instance |
| `getOpenAI(model)` | Gets cached instance (creates if needed) |
| `isOpenAIAvailable()` | Checks if API key is configured |
| `fetchOpenAIModels()` | Fetches available models from API |
| `getOpenAITokenStats()` | Returns cumulative token usage |
| `getOpenAITokenDelta()` | Returns last turn's token delta |
| `resetOpenAITokenStats()` | Resets token counters (for new game) |
| `startOpenAIRound()` | Clears conversationId for fresh state |
| `endOpenAIRound()` | Clears conversationId |

**API Comparison (Chat Completions → Responses):**

| Chat Completions API | Responses API |
|---------------------|---------------|
| `client.chat.completions.create()` | `client.responses.create()` |
| `messages: ChatMessage[]` | `conversation: { id: string }` |
| Manual history management | Server manages history |
| `response_format.json_schema` | `text.format.json_schema` |
| `response.choices[0].message.content` | `response.output_text` |
| `usage.prompt_tokens` | `usage.input_tokens` |
| `usage.completion_tokens` | `usage.output_tokens` |
| `usage.prompt_tokens_details.cached_tokens` | `usage.input_tokens_details.cached_tokens` |
| `usage.completion_tokens_details.reasoning_tokens` | `usage.output_tokens_details.reasoning_tokens` |

**Token Stats Tracked:**

| Stat | Description |
|------|-------------|
| `promptTokens` | Input tokens sent to API |
| `responseTokens` | Output tokens received |
| `reasoningTokens` | Reasoning tokens (for o-series models like o3, o4-mini) |
| `totalTokens` | Sum of all tokens |
| `cachedTokens` | Tokens served from cache |
| `requestCount` | Number of API calls made |
| `roundPromptTokens` | Round-specific input tokens |
| `roundResponseTokens` | Round-specific output tokens |
| `roundReasoningTokens` | Round-specific reasoning tokens |
| `roundTotalTokens` | Round-specific total tokens |
| `roundRequestCount` | Round-specific API calls |

**Configuration:**
- API key: `VITE_OPENAI_API_KEY` environment variable
- Default model: `gpt-4o-mini`
- Fallback: Heuristic AI if API key not available
- Model allowlist patterns: `gpt-4o`, `gpt-4o-mini`, `gpt-4.1[-mini|-nano]`, `gpt-4-turbo`, `gpt-5[.x][-mini]`, `o1`, `o3[-mini]`, `o4-mini`

### OpenAI Single-Turn AI (openai-singleturn.ts)

**Architecture:**
- Uses `openai` SDK with Responses API (same as multi-turn)
- **Single-turn mode**: Each request is independent, no conversation state
- Full move history included in each prompt via `buildSingleTurnPrompt()`
- Maintains local `roundMoveHistory` and `initialTable` for context reconstruction
- Same structured JSON output as multi-turn

**Key Differences from Multi-Turn:**

| Multi-Turn (openai.ts) | Single-Turn (openai-singleturn.ts) |
|------------------------|-----------------------------------|
| Server manages history via `conversation` | No conversation - each request independent |
| Stores `conversationId` between turns | Stores `roundMoveHistory[]` and `initialTable[]` |
| Prompt includes only last opponent move | Prompt includes complete round history |
| Lower token usage (incremental context) | Higher token usage (full history each turn) |

**Key Functions:**

| Function | Description |
|----------|-------------|
| `createOpenAISingleTurnAI(model)` | Creates new single-turn instance |
| `getOpenAISingleTurnAI(model)` | Gets cached instance |
| `getOpenAISingleTurnTokenStats()` | Returns cumulative token usage |
| `getOpenAISingleTurnTokenDelta()` | Returns last turn's delta |
| `startOpenAISingleTurnRound()` | Resets move history for new round |
| `endOpenAISingleTurnRound()` | Clears move history |

### Claude AI (claude.ts)

**Architecture:**
- Uses `@anthropic-ai/sdk` with Messages API (beta endpoint for structured outputs)
- **Local conversation state management** - messages array maintained client-side
- System instruction contains full Scopa rules, scoring, and prime values
- **Structured outputs via `output_format`** - JSON schema for move selection
- **Extended thinking enabled by default** - 10,000 token budget for deeper reasoning
- Messages array persists within a round for context continuity

**Structured Outputs (replaces tool use):**
```typescript
const MOVE_OUTPUT_SCHEMA = {
  type: 'json_schema',
  schema: {
    type: 'object',
    properties: {
      moveIndex: { type: 'integer', description: '0-based index of the selected move' },
      reasoning: { type: 'string', description: 'Brief explanation' }
    },
    required: ['moveIndex', 'reasoning'],
    additionalProperties: false
  }
};

// Uses beta API with structured outputs
const response = await client.beta.messages.create({
  model, max_tokens, system, messages,
  output_format: MOVE_OUTPUT_SCHEMA,
  thinking: { type: 'enabled', budget_tokens: 10000 },
  betas: ['structured-outputs-2025-11-13']
});
```

**Extended Thinking:**
- Enabled by default via `useExtendedThinking` property
- Budget: 10,000 tokens for thinking
- Skipped when only one valid move (optimization)
- Grammar applies only to direct output, not thinking blocks
- Thinking summary stored in `lastThinking` property

**Messages Array Flow:**
```
1. On each turn: push user message to messages[]
2. Send messages[] to beta API with output_format + thinking
3. Parse JSON from text block (guaranteed by schema)
4. Push assistant text response to messages[]
5. startRound(): clear messages[] → fresh conversation
```

**Key Functions:**

| Function | Description |
|----------|-------------|
| `createClaudeAI(model)` | Creates new Claude AI instance |
| `getClaudeAI(model)` | Gets cached instance (creates if needed) |
| `isClaudeAvailable()` | Checks if API key is configured |
| `fetchClaudeModels()` | Fetches available models from beta API |
| `getClaudeTokenStats()` | Returns cumulative token usage |
| `getClaudeTokenDelta()` | Returns last turn's token delta |
| `resetClaudeTokenStats()` | Resets token counters (for new game) |
| `startClaudeRound()` | Clears messages array for fresh state |
| `endClaudeRound()` | Clears messages array |

**API Comparison (OpenAI Responses → Claude Messages):**

| OpenAI Responses API | Claude Messages API |
|---------------------|---------------------|
| `client.responses.create()` | `client.beta.messages.create()` |
| `conversation: { id }` (server-side) | `messages: Message[]` (client-side) |
| Server manages history | Client manages messages array |
| `text.format.json_schema` | `output_format.schema` + `betas` |
| `response.output_text` | `response.content[0].text` (JSON) |
| `usage.input_tokens` | `usage.input_tokens` |
| `usage.output_tokens` | `usage.output_tokens` |
| N/A | `usage.cache_creation_input_tokens` |
| N/A | `usage.cache_read_input_tokens` |
| N/A | Extended thinking (in output_tokens) |

**Token Stats Tracked:**

| Stat | Description |
|------|-------------|
| `promptTokens` | Input tokens sent to API |
| `responseTokens` | Output tokens received (includes thinking tokens) |
| `cacheCreationTokens` | Tokens used to create cache |
| `cachedTokens` | Tokens read from cache (free) |
| `totalTokens` | Sum of all tokens |
| `requestCount` | Number of API calls made |
| `roundPromptTokens` | Round-specific input tokens |
| `roundResponseTokens` | Round-specific output tokens |
| `roundTotalTokens` | Round-specific total tokens |
| `roundRequestCount` | Round-specific API calls |

**Note:** Anthropic API does not provide separate `thinking_tokens` field. Extended thinking tokens are included in `output_tokens` and billed together.

**Configuration:**
- API key: `VITE_CLAUDE_API_KEY` environment variable
- Default model: `claude-sonnet-4-5-20250929`
- Fallback: Heuristic AI if API key not available
- Model filtering: Only `claude-*` models from beta models list

### Claude Single-Turn AI (claude-singleturn.ts)

**Architecture:**
- Uses `@anthropic-ai/sdk` with Messages API (beta endpoint)
- **Single-turn mode**: Each request is independent, no messages array
- Full move history included in each prompt via `buildSingleTurnPrompt()`
- Maintains local `roundMoveHistory` and `initialTable` for context reconstruction
- Same structured outputs (`output_format`) as multi-turn
- **No extended thinking** - single-turn uses standard API for faster responses

**Key Differences from Multi-Turn:**

| Multi-Turn (claude.ts) | Single-Turn (claude-singleturn.ts) |
|------------------------|-----------------------------------|
| Manages `messages[]` between turns | No messages - each request independent |
| Stores conversation context | Stores `roundMoveHistory[]` and `initialTable[]` |
| Prompt includes only last opponent move | Prompt includes complete round history |
| Extended thinking enabled (10k budget) | No extended thinking |
| Lower token usage (incremental context) | Higher token usage (full history each turn) |

**Key Functions:**

| Function | Description |
|----------|-------------|
| `createClaudeSingleTurnAI(model)` | Creates new single-turn instance |
| `getClaudeSingleTurnAI(model)` | Gets cached instance |
| `getClaudeSingleTurnTokenStats()` | Returns cumulative token usage |
| `getClaudeSingleTurnTokenDelta()` | Returns last turn's delta |
| `startClaudeSingleTurnRound()` | Resets move history for new round |
| `endClaudeSingleTurnRound()` | Clears move history |

### TokenStatsDisplay Component

| File | Purpose |
|------|---------|
| `UI/TokenStatsDisplay.tsx` | Compact token icon with hover popup showing detailed stats |
| `UI/TokenStatsDisplay.module.css` | Styling with animated popup transition |

**Props:**

| Prop | Type | Description |
|------|------|-------------|
| `stats` | `GeminiTokenStats \| null` | Token and timing statistics |
| `delta` | `GeminiTokenDelta \| null` | Per-turn delta (optional) |
| `show` | `boolean` | Force display even if no stats |
| `position` | `'top' \| 'bottom'` | Popup direction (`top` = upward) |
| `mode` | `'round' \| 'game'` | Show round-only or cumulative stats |
| `modelName` | `string` | Model name to display when stats not yet available |

**Popup displays:**
- Model name and mode label in header
- Turns, Input, Output, Thought (if >0), Total tokens
- Cached tokens (game mode, if >0)
- Timing: Last turn, Average, Min/Max (game mode)

---

## UI Components (src/components/)

### Card Component

| File | Purpose |
|------|---------|
| `Card/Card.tsx` | Card wrapper with selection states, renders CardImage or CardBack |
| `Card/CardImage.tsx` | WebP-based Neapolitan card graphics (faces + backs) |
| `Card/Card.module.css` | Card styling, hover/selected/highlighted states |

**Neapolitan Card Design:**
- Uses authentic Neapolitan card graphics in WebP format for fast loading
- 40 card WebP files in `public/cards/napoletane/`: `{suit}-{value}.webp`
- Cards converted from SVG sprite at 3x resolution (210×345px) using Lanczos filter
- Total size: ~780KB for all 41 images (40 faces + 1 back)
- Source sprite sheets stored in `local/` (gitignored)
- CardImage.tsx uses `<img>` tags with `pointerEvents: 'none'` and `draggable={false}`
- Card back: Authentic Neapolitan design from `napolitane-back.webp` (44KB)
- Card back uses `--card-back-scale` and `--card-back-offset` CSS variables for sizing
- Card face scaling uses `--card-img-scale` and `--card-img-offset` CSS variables
- Suit SVGs from Wikimedia Commons in `public/cards/napoletane/suits/` for score icons

**Siciliane Deck (Phase 19):**
- Suit SVGs from Wikimedia Commons (Tarocco Siciliano) in `public/cards/siciliane/suits/`
- Files: `coins.svg` (148KB), `cups.svg` (162KB), `swords.svg` (29KB), `clubs.svg` (129KB)
- Source: Category:Sicilian_tarot on Wikimedia Commons (public domain)
- Card faces: placeholder (not yet implemented)

**DeckContext (src/contexts/DeckContext.tsx):**
- Provides current deck type (`napoletane` | `siciliane`) to all components
- `DeckProvider` wraps game screens in App.tsx
- `useDeck()` hook returns current deck type
- Used by CardImage, RoundEndScreen icons, and other deck-aware components

### Table Components

| File | Purpose |
|------|---------|
| `Table/PlayerHand.tsx` | Displays player's hand cards (face up for human, face down for CPU), supports drag |
| `Table/TableCards.tsx` | Displays cards on table with valid target highlighting, drop target for drag, dealer deck |
| `Table/CapturedPile.tsx` | Shows captured cards stack with denari count, scopa markers, sette bello indicator |
| `Table/DealerDeck.tsx` | Shows remaining deck with visual stack effect, card count badge |

### UI Components

| File | Purpose |
|------|---------|
| `UI/PersonIcon.tsx` | SVG person icon for human player (matches AI icon styling) |
| `UI/ScoreBoard.tsx` | Shows scores, round number, target score, turn indicator (CPU first to match board layout) |
| `UI/StartScreen.tsx` | Initial screen with target score selection (11, 16, 21) |
| `UI/RoundEndScreen.tsx` | Score breakdown with Italian names, counts, captured card display with hover highlighting |
| `UI/GameEndScreen.tsx` | Winner announcement with final scores and play again |
| `UI/ScopaCelebration.tsx` | Animated "SCOPA!" overlay with sparkle effects |
| `UI/SetteBelloCelebration.tsx` | Animated gold coin celebration for 7 of coins capture |
| `UI/CpuCardAnimation.tsx` | Card play animation (3D flip reveal, move, capture indicator on player's side) |
| `UI/DealingAnimation.tsx` | Two-phase dealing animation (table cards, then player hands) |
| `UI/SettingsModal.tsx` | Settings panel with target score, animation speed options |
| `UI/GameControls.tsx` | New game and settings icon buttons |

### Layout Components

| File | Purpose |
|------|---------|
| `Layout/GameLayout.tsx` | CSS Grid layout: CPU top, table center, human bottom, piles on sides |

---

## CSS Architecture

**Flexible Width Approach:**
- Modals use `width: fit-content` with `min-width` and `max-width: 90vw`
- Labels use `white-space: nowrap` to prevent wrapping
- No hard-coded max-widths on text - containers grow to fit content
- Ensures long player names (e.g., "Gemini 3 Flash Preview 💬") display fully

**Card Selection States:**
- Default: normal shadow
- Hover (non-selected, non-disabled): translateY(-4px), enhanced shadow
- Selected: translateY(-8px), 3px gold border, enhanced shadow
- Highlighted: pulsing 2-4px gold glow animation

**Layout Grid:**
```
+---------------------------+
|        CPU Hand           |
|      (face down)          |
+-------+-----------+-------+
| CPU   |   Table   | Human |
| Pile  |   Cards   | Pile  |
+-------+-----------+-------+
|       Human Hand          |
|       (face up)           |
+---------------------------+
|      Score Board          |
+---------------------------+
```

---

## Game Flow (Phase 8 - Completed)

**Human Turn:**
1. Human clicks card in hand to select
2. Valid capture targets highlighted on table
3. Click single table card → auto-executes capture
4. Click multiple table cards → shows sum, "Capture" button when valid
5. Double-click or "Place Card" button → places card (when no capture possible)

**CPU Turn:**
- Random AI selects random card and random valid move
- 500-1000ms delay for "thinking" feel
- Auto-executes move, switches back to human

**Round End:**
- Triggers when deck and hands empty
- `endRound()` awards remaining table cards to last capture player
- Calculates and stores `lastRoundScores` for display
- RoundEndScreen shows breakdown: cards, coins, sette bello, prime, scopas

**Game End:**
- Triggers when either player reaches target score after round
- GameEndScreen shows winner and final scores

**Spectator Mode (Watch Mode - Phase 14):**
- Both players are AI-controlled
- Both hands displayed face-down for suspense
- ScoreBoard shows AI names with "(CPU)" suffix, ordered to match board (top player first)
- Card animation for both players:
  - Card flips near player's hand position
  - Moves to table center
  - If capturing, animates toward capture pile
- Pause/Resume controls during spectator mode
- Unified `animatingCard` state tracks current player's animation

---

## Animations (Phase 9 - Completed)

**Framer Motion Integration:**
- Card component uses `motion.div` with spring animations
- PlayerHand uses `AnimatePresence` with staggered delays for deal animation
- TableCards uses `AnimatePresence` for smooth card entry/exit
- Cards have `whileHover` and `whileTap` for interactive feedback

**Scopa Celebration:**
- ScopaCelebration component triggers when table is cleared
- "SCOPA!" text with pulsing glow effect
- 12 sparkle particles animate outward
- Shows for 1.5 seconds then fades

**Card Animation (Phase 11-12, 14):**
- CpuCardAnimation component shows any player's card being played
- Supports both CPU and human players via `player` prop
- Animation phases: reveal (3D flip in place), moving (to table), capturing (toward pile)
- Uses CSS 3D transforms with backface-visibility for true flip effect
- Two-sided card: CardBack on front, CardImage on back, rotateY to reveal
- Card is removed from player's hand immediately when animation starts
- Position is player-aware: CPU animates from top (-120), human from bottom (+120)
- Capture animates card toward player's capture pile before fading
- Capture indicator ("+X captured") appears on capturing player's side: top (25%) for CPU, bottom (25%) for human

**Sette Bello Celebration (Phase 12):**
- SetteBelloCelebration triggers when 7 of coins is captured
- Gold coin icon with spinning animation
- "SETTE BELLO!" text with golden glow
- 8 gold coin particles animate outward
- Shows for 1.5 seconds then fades

**Dealing Animation (Phase 15):**
- DealingAnimation component with two-phase round start dealing
- Phase 1 (table): 4 cards fly to table (~415ms)
- Pause: 300ms gap for visual separation
- Phase 2 (hands): 6 cards fly to players (~575ms)
- Mid-round dealing skips directly to hands phase
- Uses `useLayoutEffect` for deal detection to prevent flash before animation
- `DealMode` type: `'table' | 'pause' | 'hands'`

**Animation Blocking (Phase 15):**
- `celebrationActive` state tracks full celebration lifecycle
- `isAnimationBlocking` computed from `isDealing`, `celebrationActive`, and `animatingCard`
- Cards are non-draggable during any blocking animation
- Uses `onExitComplete` on AnimatePresence for reliable exit detection
- Fallback timeout (2000ms) ensures state reset even if callback fails

---

## Drag and Drop (Phase 11 - Completed)

**Human Card Drag:**
- Cards in human hand are draggable using Framer Motion's drag
- Drag uses `dragSnapToOrigin: true` to return card if not dropped on valid target
- `isDragging` state highlights table area as drop target
- On drop over table: auto-plays if single valid move, otherwise selects card for target picking

**Implementation:**
- Card component accepts `draggable`, `onDragStart`, `onDragEnd` props
- PlayerHand passes drag handlers to human cards
- TableCards uses `forwardRef` to expose DOM element for drop detection
- App.tsx checks drop position against table bounding rect

---

## Settings & Controls (Phase 10 - Completed)

**useSettings Hook:**
- Persists to localStorage under key `scopa-settings`
- Settings: `defaultTargetScore` (number), `animationSpeed`, `cpuAI`, `deck`, `geminiModel`
- Auto-saves on any change

**SettingsModal:**
- Target score selection: preset buttons (11, 16, 21) + custom number input
- Animation speed (fast=0.5x, normal=1x, slow=2x) - affects CPU thinking, flip, move, capture delays
- Card deck selection (Napoletane, Siciliane)
- Opening settings pauses spectator mode; closing restores previous pause state

**GameControls:**
- New game button with confirmation dialog
- Settings button opens modal
- Displayed in scoreboard area

---

## Round End Screen (Phase 12, 15 - Enhanced)

**Score Display:**
- Italian category names: Carte Lungo, Denari, Primiera, Scopa
- Shows actual counts (card count, coin count, prime value) not just 1/0
- Sette Bello shows checkmark (✓) or dash (-)
- Winner of each category highlighted in gold

**Custom SVG Icons (Phase 15, 19):**
- CardsIcon: 3 fanned cards (cream with gray borders)
- CoinIcon: Authentic denari from Wikimedia Commons (deck-aware)
- SetteBelloIcon: Card showing 7 authentic denari coins in 2-1-2-2 pattern (deck-aware)
- PrimieraIcon: Gold 5-pointed star with gradient
- ScopaIcon: Emoji broom (🧹)
- Icons left-aligned with category names in flexbox layout
- CoinIcon and SetteBelloIcon use `useDeck()` context to select correct suit graphics
- Dynamic path: `./cards/${deckType}/suits/coins.svg`

**Captured Cards Display:**
- Card columns on left (human) and right (CPU) sides
- Cards shown in capture order (not sorted)
- 6 cards per row in grid layout (46×69px mini cards)
- Hover over category row to highlight relevant cards:
  - Carte Lungo: all cards
  - Denari: coins suit only
  - Sette Bello: 7 of coins
  - Primiera: best prime card from each suit
  - Scopa: cards that formed scopa captures
- Non-highlighted cards dimmed when hovering

**Scopa Card Tracking:**
- `PlayerState.scopaCaptures: Card[][]` stores cards from each scopa
- Updated in `executeMove` when `isScopa` is true
- Reset in `handleNextRound` when new round starts

---

## MVP Complete!

All 30 phases implemented:
1. Project Setup
2. Core Types & Constants
3. Deck Management
4. Game Rules Engine
5. Scoring System
6. Game State Management
7. UI Components
8. Game Flow Integration
9. Animations
10. Settings & Polish
11. UI Enhancements (Drag & Drop, CPU Animation)
12. UX Polish (Dealer Deck, Enhanced Round Summary, Sette Bello Celebration)
13. AI Refactoring (Random AI, Heuristic AI, AI Selection)
14. Watch Mode (CPU vs CPU Spectator Mode)
15. Animation Timing & UI Polish (Two-phase dealing, Celebration blocking, Custom SVG icons)
16. Authentic Neapolitan Card Graphics (Sprite sheet extraction, standalone SVGs)
17. Card Styling Improvements (CSS variable consolidation, aspect ratio update)
18. Card Asset Optimization (WebP conversion, authentic card back, deck organization)
19. Multiple Deck Support (Siciliane suits, deck-aware UI icons, StartScreen polish)
20. LLM AI Integration (Gemini with chat sessions, token tracking, model selection)
21. Token Stats Enhancements (timing stats, per-player tracking, round vs game modes)
22. UI Polish & Settings (AI icons, flexible widths, custom target score, settings cleanup)
23. OpenAI GPT AI Integration (structured outputs, reasoning tokens, model selection)
24. OpenAI Icon Integration & UI Polish (blossom SVG, AIPlayerLabel, raw model IDs)
25. OpenAI Responses API Migration (server-side conversation state, cleaner code)
26. OpenAI Single-Turn Mode & UI Improvements (single-turn AI, mode toggle button)
27. Claude Anthropic API Integration (Messages API, tool use, multi-turn & single-turn modes)
28. Brand Icons & Custom Dropdown (official logos with brand colors, custom dropdown for SVG icons)
29. Claude Extended Thinking & Structured Outputs (output_format, 10k thinking budget, PersonIcon)
30. Expert AI & Background Simulation (ISMCTS, Web Worker, instant mode, enhanced GameEndScreen)

**Future Enhancements:**
- Multiplayer support
- Sound effects
- More card themes
- Game statistics tracking
