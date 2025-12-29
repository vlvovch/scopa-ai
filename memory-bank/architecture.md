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
│   │   └── (rules.ts, scoring.ts, reducer.ts - future)
│   │
│   ├── ai/                 # AI opponent implementations
│   │   └── (random.ts, basic.ts, advanced.ts, llm/)
│   │
│   ├── hooks/              # React hooks
│   │   └── (useGame.ts, useSettings.ts, useAI.ts)
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

## Next Steps

Phase 4 will add:
- `src/game/rules.ts` - Capture detection, move validation, move execution
