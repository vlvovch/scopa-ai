# Scopa WebApp - Architecture

**Last Updated:** 2024-12-29

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
│   ├── cards/              # Card images (future)
│   ├── sounds/             # Audio files (future)
│   └── vite.svg            # Favicon
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
│   │   └── (random.ts, basic.ts, advanced.ts, llm/)
│   │
│   ├── hooks/              # React hooks
│   │   ├── useGame.ts      # Main game state hook
│   │   └── (useSettings.ts, useAI.ts - future)
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
| `--card-width/height` | `70px/105px` | Card dimensions (2:3 ratio) |

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
| `PlayerState` | `{ hand, captured, scopaCount }` |
| `RoundState` | `{ deck, table, currentPlayer, dealer, lastCapture }` |
| `GameState` | Complete game state with players, scores, round info |
| `Move` | `{ player, cardPlayed, capturedCards, isScopa }` |
| `RoundScore` | `{ cards, coins, setteBello, prime, scopas, total }` |

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

## Next Steps

Phase 7 will add:
- UI components: Card, PlayerHand, TableCards, CapturedPile, ScoreBoard, GameLayout
