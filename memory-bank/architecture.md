# Scopa WebApp - Architecture

**Last Updated:** 2025-12-30

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
│   │   └── useSettings.ts  # Settings with localStorage
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

## UI Components (src/components/)

### Card Component

| File | Purpose |
|------|---------|
| `Card/Card.tsx` | Card wrapper with selection states, renders CardImage or CardBack |
| `Card/CardImage.tsx` | SVG-based Neapolitan card graphics (faces + backs) |
| `Card/Card.module.css` | Card styling, hover/selected/highlighted states |

**Neapolitan Card Design:**
- Pure SVG, no external images required
- 70×105 viewBox (2:3 aspect ratio)
- Suit colors: Coins=#DAA520 (gold), Cups=#C41E3A (crimson), Swords=#4169E1 (blue), Clubs=#228B22 (green)
- Face cards: Fante (8), Cavallo (9), Re (10) with Italian labels
- Card back: Navy blue (#1a237e) with gold ornamental pattern

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
| `UI/ScoreBoard.tsx` | Shows scores, round number, target score, turn indicator |
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
- ScoreBoard shows AI names with "(CPU)" suffix (e.g., "Furbo (CPU)" vs "Scimmia (CPU)")
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
- Settings: `defaultTargetScore`, `animationSpeed`, `showCardValues`
- Auto-saves on any change

**SettingsModal:**
- Target score selection (11, 16, 21)
- Animation speed (fast, normal, slow)
- Show card values toggle

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

**Custom SVG Icons (Phase 15):**
- CardsIcon: 3 fanned cards (cream with gray borders)
- CoinIcon: Single gold coin with radial gradient and concentric circles
- SetteBelloIcon: Card showing 7 gold coins in 2-1-2-2 pattern
- PrimieraIcon: Gold 5-pointed star with gradient
- ScopaIcon: Emoji broom (🧹)
- Icons left-aligned with category names in flexbox layout

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

All 15 phases implemented:
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

**Future Enhancements:**
- Smarter AI (rule-based or LLM)
- Multiplayer support
- Sound effects
- More card themes
- Game statistics tracking
