# Scopa WebApp - Development Progress

**Last Updated:** 2026-01-01

---

## Phase 1: Project Setup

- [x] Step 1.1: Initialize Project - Completed 2024-12-29
- [x] Step 1.2: Configure Vite for Static Deployment - Completed 2024-12-29
- [x] Step 1.3: Create Directory Structure - Completed 2024-12-29
- [x] Step 1.4: Set Up CSS Variables and Base Styles - Completed 2024-12-29

**Notes:**
- Project initialized manually (not via `npm create vite`) due to existing directory content
- Added `terser` as dev dependency (required for Vite v3+ minification)
- Added `emitDeclarationOnly: true` to tsconfig.node.json for TypeScript project references compatibility
- Validation: dev server runs, production build works via `npm run preview`, CSS variables accessible in DevTools

---

## Phase 2: Core Game Types and Constants

- [x] Step 2.1: Define Card Types - Completed 2024-12-29
- [x] Step 2.2: Define Game State Types - Completed 2024-12-29
- [x] Step 2.3: Define Move Types - Completed 2024-12-29
- [x] Step 2.4: Define Game Constants - Completed 2024-12-29

**Notes:**
- Created `src/game/types.ts` with all type definitions
- Created `src/game/constants.ts` with game constants
- Added Vitest testing framework
- 23 unit tests passing (`npm test`)

---

## Phase 3: Deck Management

- [x] Step 3.1: Implement Deck Creation - Completed 2024-12-29
- [x] Step 3.2: Implement Deck Shuffling - Completed 2024-12-29
- [x] Step 3.3: Implement Card Dealing - Completed 2024-12-29
- [x] Step 3.4: Implement Initial Deal Validation - Completed 2024-12-29

**Notes:**
- Created `src/game/deck.ts` with all deck functions
- Fisher-Yates shuffle algorithm, immutable operations
- 21 new tests, 44 total tests passing

---

## Phase 4: Game Rules Engine

- [x] Step 4.1: Implement Single Card Capture Detection - Completed 2024-12-29
- [x] Step 4.2: Implement Sum Capture Detection - Completed 2024-12-29
- [x] Step 4.3: Implement Valid Moves Generator - Completed 2024-12-29
- [x] Step 4.4: Implement Move Validation - Completed 2024-12-29
- [x] Step 4.5: Implement Move Execution - Completed 2024-12-29

**Notes:**
- Created `src/game/rules.ts` with all rules functions
- Single card priority rule enforced in getValidMoves
- Mandatory capture rule validated in isValidMove
- executeMove is immutable (does not mutate state)
- 33 new tests, 77 total tests passing

---

## Phase 5: Scoring System

- [x] Step 5.1: Implement Card Count Scoring - Completed 2024-12-29
- [x] Step 5.2: Implement Coins Count Scoring - Completed 2024-12-29
- [x] Step 5.3: Implement Sette Bello Scoring - Completed 2024-12-29
- [x] Step 5.4: Implement Prime Calculation - Completed 2024-12-29
- [x] Step 5.5: Implement Prime Scoring - Completed 2024-12-29
- [x] Step 5.6: Implement Round Scoring - Completed 2024-12-29

**Notes:**
- Created `src/game/scoring.ts` with all scoring functions
- Prime returns null if player missing any suit
- calculateRoundScore provides complete RoundScore breakdown
- 24 new tests, 101 total tests passing

---

## Phase 6: Game State Management

- [x] Step 6.1: Create Game Reducer Actions - Completed 2024-12-29
- [x] Step 6.2: Implement Initial State Creator - Completed 2024-12-29
- [x] Step 6.3: Implement Game Start Logic - Completed 2024-12-29
- [x] Step 6.4: Implement Play Card Logic - Completed 2024-12-29
- [x] Step 6.5: Implement Re-deal Logic - Completed 2024-12-29
- [x] Step 6.6: Implement Round End Logic - Completed 2024-12-29
- [x] Step 6.7: Implement Next Round Logic - Completed 2024-12-29
- [x] Step 6.8: Create useGame Hook - Completed 2024-12-29

**Notes:**
- Created `src/game/reducer.ts` with gameReducer and all action handlers
- Created `src/hooks/useGame.ts` React hook with stable callbacks
- Automatic re-deal when hands empty and deck has cards
- Remaining table cards go to last capture player at round end
- 29 new tests, 130 total tests passing

---

## Phase 7: Basic UI Components

- [x] Step 7.1: Create Card Component - Completed 2024-12-29
- [x] Step 7.2: Create Card Back Design (Neapolitan Style) - Completed 2024-12-29
- [x] Step 7.3: Create Neapolitan Card Graphics - Completed 2024-12-29
- [x] Step 7.4: Create PlayerHand Component - Completed 2024-12-29
- [x] Step 7.5: Create TableCards Component - Completed 2024-12-29
- [x] Step 7.6: Create CapturedPile Component - Completed 2024-12-29
- [x] Step 7.7: Create ScoreBoard Component - Completed 2024-12-29
- [x] Step 7.8: Create GameTable Layout Component - Completed 2024-12-29

**Notes:**
- Card component uses Neapolitan-style SVG graphics (not Unicode/emoji)
- CardImage.tsx contains pure SVG components for card faces and backs
- Suit colors: Coins=Gold, Cups=Crimson, Swords=Blue, Clubs=Green
- Face cards display Italian names: Fante (Jack), Cavallo (Knight), Re (King)
- CSS hover/selected states properly layered to avoid conflicts
- 130 total tests passing (no UI unit tests yet)

---

## Phase 8: Game Flow Integration

- [x] Step 8.1: Wire Up Human Player Input - Completed 2024-12-29
- [x] Step 8.2: Implement Move Confirmation UX - Completed 2024-12-29
- [x] Step 8.3: Implement CPU Turn Execution - Completed 2024-12-29
- [x] Step 8.4: Create RoundEndScreen Component - Completed 2024-12-29
- [x] Step 8.5: Create GameEndScreen Component - Completed 2024-12-29
- [x] Step 8.6: Create StartScreen Component - Completed 2024-12-29

**Notes:**
- Human input: Click card to select, click table cards to capture, double-click or "Place Card" button to place
- Single card captures auto-execute on click; multi-card captures require "Capture" button confirmation
- Sum display shows selected table cards total vs played card value
- CPU uses random AI with 500-1000ms delay for thinking feel
- RoundEndScreen shows detailed score breakdown (cards, coins, sette bello, prime, scopas)
- GameEndScreen announces winner with final scores and round count
- StartScreen allows target score selection (11, 16, or 21)
- Added `lastRoundScores` to GameState for displaying round breakdown
- 130 total tests passing

---

## Phase 9: Basic Animations

- [x] Step 9.1: Add Card Deal Animation - Completed 2024-12-29
- [x] Step 9.2: Add Card Play Animation - Completed 2024-12-29
- [x] Step 9.3: Add Capture Animation - Completed 2024-12-29
- [x] Step 9.4: Add Scopa Celebration Animation - Completed 2024-12-29
- [x] Step 9.5: Add Turn Indicator Animation - Completed 2024-12-29

**Notes:**
- Using Framer Motion for all animations
- Card component now uses motion.div with spring animations
- PlayerHand uses AnimatePresence with staggered delays for dealing
- TableCards uses AnimatePresence for card entry/exit
- ScopaCelebration component shows "SCOPA!" with sparkle effects when table is cleared
- Cards have hover/tap animations for interactivity
- 130 tests passing

---

## Phase 10: Settings and Polish

- [x] Step 10.1: Implement Settings Storage - Completed 2024-12-29
- [x] Step 10.2: Create Settings Modal - Completed 2024-12-29
- [x] Step 10.3: Add Game Controls - Completed 2024-12-29
- [x] Step 10.4: Add Loading States - Completed 2024-12-29
- [x] Step 10.5: Add Error Handling - Completed 2024-12-29

**Notes:**
- useSettings hook manages settings in localStorage
- Settings: defaultTargetScore, animationSpeed, showCardValues
- SettingsModal with toggle and option buttons
- GameControls component with new game and settings buttons
- New game confirmation dialog prevents accidental loss of progress
- 130 tests passing

---

## Phase 11: UI Enhancements

- [x] Step 11.1: Enhanced Captured Pile Display - Completed 2024-12-29
- [x] Step 11.2: Add Drag and Drop for Human Player - Completed 2024-12-29
- [x] Step 11.3: Add CPU Card Play Animation - Completed 2024-12-29

**Notes:**
- CapturedPile now shows: card count, denari (coins) count, scopa count, sette bello indicator
- Human cards are draggable to table for playing (drag and drop as alternative to click)
- CPU turn shows animated card reveal (flip from face-down), moves to table, capture indicator
- Table area highlights when dragging a card
- 130 tests passing

---

## Phase 12: UX Polish and Enhancements

- [x] Step 12.1: Add Dealer Deck Display - Completed 2025-12-30
- [x] Step 12.2: Improve CPU Card Animation - Completed 2025-12-30
- [x] Step 12.3: Fix Card Drag Responsiveness - Completed 2025-12-30
- [x] Step 12.4: Enhanced Round Summary - Completed 2025-12-30
- [x] Step 12.5: Add Sette Bello Celebration - Completed 2025-12-30
- [x] Step 12.6: Add Selection Visual Feedback - Completed 2025-12-30
- [x] Step 12.7: Scopa Card Tracking and Highlighting - Completed 2025-12-30

**Notes:**
- DealerDeck component shows remaining deck with visual stack, switches sides based on dealer
- CPU animation uses 3D flip with two faces (CardBack front, CardImage back), proper reveal-then-move sequence
- Fixed card drag getting stuck by removing y animation conflicts and setting dragElastic to 1
- Round summary now shows Italian names (Carte Lungo, Denari, Primiera, Scopa) with actual counts
- RoundScore extended with `counts` object for display values
- Card columns on sides of round summary show captured cards in capture order
- Hover over category row highlights relevant cards (all for Carte, coins for Denari, 7 of coins for Sette Bello, best prime cards per suit for Primiera, scopa captures for Scopa)
- 6 cards per row in summary grid
- Sette Bello celebration with gold coin theme and particle effects
- 250ms delay before auto-executing single card captures for visual feedback
- PlayerState extended with `scopaCaptures: Card[][]` to track which cards formed scopas
- 130 tests passing

---

## Phase 13: AI Refactoring and Enhancements

- [x] Step 13.1: Create AI Module Structure - Completed 2025-12-30
- [x] Step 13.2: Implement Random AI - Completed 2025-12-30
- [x] Step 13.3: Implement Heuristic (Greedy) AI - Completed 2025-12-30
- [x] Step 13.4: Add AI Selection to Settings - Completed 2025-12-30
- [x] Step 13.5: Fix Last-Hand Scopa Exception - Completed 2025-12-30
- [x] Step 13.6: Show Round Summary Before Game End - Completed 2025-12-30
- [x] Step 13.7: Add AI Selection to Start Screen - Completed 2025-12-30
- [x] Step 13.8: Display AI Name on ScoreBoard - Completed 2025-12-30
- [x] Step 13.9: Implement CPU vs CPU Spectator Mode - Completed 2025-12-30

**Notes:**
- Refactored AI logic from App.tsx into dedicated `src/ai/` module
- Created `AIPlayer` interface with `selectMove(context)` method
- Random AI: Selects random card and random valid move (original behavior)
- Heuristic AI: Greedy strategy with priority-based move scoring:
  - Scopa (+1000): Clearing the table
  - Sette Bello (+500): Capturing 7 of coins
  - Denari (+50 each): Capturing coins for majority
  - Primiera (+30/+20/+15): High prime value cards (7s, 6s, aces)
  - Card count (+5 per card): More captures as tiebreaker
  - Placing strategy: Avoids giving away coins and 7s
- Added `cpuAI` setting to select opponent (Random or Greedy)
- Heuristic AI is now the default opponent
- Fixed bug: Scopa on last hand of round no longer counts (cards still captured)
- Fixed flow: Round summary now shown before game end screen
- Added `isGameOver` flag to GameState for proper flow control
- StartScreen now allows selecting opponent (Scimmia or Furbo) before starting game
- ScoreBoard displays selected AI name instead of generic "CPU"
- CPU vs CPU spectator mode: watch two AIs play against each other
  - Game mode selection on StartScreen (Play vs Watch)
  - Dual AI selectors for spectator mode (pick both players)
  - Pause/Resume button during spectator mode
  - ScoreBoard shows both AI names instead of "You" and "CPU"
- 130 tests passing

---

## Phase 14: Watch Mode Improvements

- [x] Step 14.1: Update ScoreBoard player names with (CPU) suffix - Completed 2025-12-30
- [x] Step 14.2: Hide both hands in watch mode (face-down) - Completed 2025-12-30
- [x] Step 14.3: Add card animation for both players in watch mode - Completed 2025-12-30
- [x] Step 14.4: Unified animation with flip, move, and capture phases - Completed 2025-12-30
- [x] Step 14.5: Fix StartScreen UI layout for watch mode - Completed 2025-12-30
- [x] Step 14.6: Fix all "You" and "CPU" references for watch mode - Completed 2025-12-30
- [x] Step 14.7: Enhanced capture animation with levitating cards - Completed 2025-12-30
- [x] Step 14.8: Captured cards fly toward pile animation - Completed 2025-12-30
- [x] Step 14.9: Dealer dealing cards animation - Completed 2025-12-30
- [x] Step 14.10: Improved animation visibility and timing - Completed 2025-12-30
- [x] Step 14.11: Fixed Sette Bello celebration detection - Completed 2025-12-30

**Notes:**
- ScoreBoard now shows AI names with "(CPU)" suffix in spectator mode (e.g., "Furbo (CPU)")
- Both hands are now face-down (invisible) in watch mode for suspense
- Unified card animation works for both players:
  - Card flips (reveals) near the player's hand position
  - Card moves to the table center
  - Captured table cards levitate (scale up, glow) during capture
  - Captured cards fly toward the player's pile (up for CPU, down for human)
  - If capturing, played card animates toward the capture pile
- New DealingAnimation component shows cards flying from deck to hands
  - 6 cards fly in succession (alternating between players)
  - Animation direction based on dealer position
  - Cards stagger with 120ms delays for natural feel
  - Duration 0.5s per card, 1.2s total animation
- Celebration animations improved:
  - Scopa and Sette Bello now show player names in spectator mode
  - Sette Bello has 200ms delay to appear after capture animation starts
  - Both celebrations now last 1.8s (increased from 1.5s)
  - Sette Bello z-index increased to 210 to appear above other animations
- Animation positions are player-aware: CPU animates from top, human from bottom
- Renamed `cpuAnimatingCard` state to `animatingCard` with `player` field for generalization
- Fixed StartScreen UI: increased container width to 500px, vertical button layout for AI selection
- All UI components now accept player name props for spectator mode:
  - CapturedPile: `playerLabel` prop
  - RoundEndScreen: `player1Name` and `player2Name` props
  - GameEndScreen: `player1Name` and `player2Name` props
- TableCards: added `capturingCardIds` prop for levitation animation
- 130 tests passing

---

## Phase 15: Animation Timing and UI Polish

- [x] Step 15.1: Fix dealing animation timing with useLayoutEffect - Completed 2025-12-30
- [x] Step 15.2: Implement two-phase round start dealing - Completed 2025-12-30
- [x] Step 15.3: Fix celebration blocking during animations - Completed 2025-12-30
- [x] Step 15.4: Custom SVG icons for score categories - Completed 2025-12-30
- [x] Step 15.5: Capture indicator player-side positioning - Completed 2025-12-30
- [x] Step 15.6: Integrate authentic Wikimedia Neapolitan suit graphics - Completed 2025-12-30

**Notes:**
- Changed deal detection from `useEffect` to `useLayoutEffect` to prevent flash of cards before animation
- Two-phase dealing for round start: table phase (4 cards) → pause (300ms) → hands phase (6 cards)
- Mid-round dealing skips directly to hands phase
- Added `celebrationActive` state to track full celebration lifecycle (including exit animations)
- Fixed Card component's `dragProps` to properly check `!disabled` for drag blocking
- Custom SVG icons in RoundEndScreen: CardsIcon (3 fanned cards), CoinIcon (authentic denari), SetteBelloIcon (card with 7 authentic coins), PrimieraIcon (gold star), ScopaIcon (emoji broom)
- Capture indicator now appears on capturing player's side: top for CPU, bottom for human
- Integrated authentic Neapolitan suit graphics from Wikimedia Commons (public domain):
  - Downloaded SVG files to `public/suits/`: coins.svg, cups.svg, swords.svg, clubs.svg
  - CardImage.tsx now uses `<image>` elements to reference external SVG files
  - RoundEndScreen icons also use authentic coin graphics
- 130 tests passing

---

## Phase 16: Authentic Neapolitan Card Graphics

- [x] Step 16.1: Extract card SVGs from sprite sheet - Completed 2025-12-30
- [x] Step 16.2: Fix scrolling on start screen - Completed 2025-12-30
- [x] Step 16.3: Fix drag-to-capture with new card images - Completed 2025-12-30
- [x] Step 16.4: Fix coins face cards extraction - Completed 2025-12-30

**Notes:**
- Integrated authentic Neapolitan playing card graphics from `napoletane.nonumbers.svg` sprite sheet
- Extracted 40 standalone SVG files to `public/cards/individual/`:
  - Format: `{suit}-{value}.svg` (e.g., `coins-7.svg`, `clubs-10.svg`)
  - Each file ~300-600KB, 23.3MB total (vs referencing 34MB sprite)
  - Standalone files render much faster than sprite references
- Card ID mapping from sprite:
  - French suits → Italian suits: diamond→coins, heart→cups, spade→swords, club→clubs
  - Face cards: jack→8 (Fante), queen→9 (Cavallo), king→10 (Re)
- Special handling for coins suit: Used `jack_diamond`, `queen_diamond`, `king_diamond` for values 8-10 (not numeric `8_diamond` etc.)
- CardImage.tsx simplified to use `<img>` tags with external SVG files
- Added `pointerEvents: 'none'` and `draggable={false}` to img element to preserve drag functionality
- Fixed body overflow CSS to allow vertical scrolling on start screen
- 130 tests passing

---

## Phase 17: Card Styling Improvements

- [x] Step 17.1: Consolidate card image scaling CSS variables - Completed 2025-12-30
- [x] Step 17.2: Use CSS variables in CardImage and CardBack components - Completed 2025-12-30
- [x] Step 17.3: Update card aspect ratio to match SVG cards - Completed 2025-12-30

**Notes:**
- Added CSS variables for card image scaling (border clipping):
  - `--card-img-scale`: Scale factor to clip SVG's built-in border
  - `--card-img-offset`: Negative margin to center the scaled image
- Card border clipping now uses variables in three places:
  - `Card.module.css` (`.card > img`)
  - `CpuCardAnimation.module.css` (`.cardFace > img`)
  - `RoundEndScreen.module.css` (`.miniCard img`)
- CardImage component no longer sets inline width/height (uses parent container sizing)
- CardBack SVG now uses `preserveAspectRatio="none"` to adapt to CSS variable dimensions
- CardBack dimensions now use CSS variables: `--card-width`, `--card-height`
- Updated card aspect ratio from 70x105 to 70x115 to better match authentic SVG card proportions
- CpuCardAnimation `.flipContainer` now uses CSS variables for dimensions
- 130 tests passing

---

## Phase 19: Multiple Deck Support & UI Polish

- [x] Step 19.1: Fix StartScreen card deck button sizing - Completed 2025-12-31
- [x] Step 19.2: Reduce StartScreen font/control sizes for compact layout - Completed 2025-12-31
- [x] Step 19.3: Download authentic Siciliane suit SVGs from Wikimedia Commons - Completed 2025-12-31
- [x] Step 19.4: Make RoundEndScreen icons deck-aware - Completed 2025-12-31
- [x] Step 19.5: Pause CPU vs CPU match when settings modal opens - Completed 2025-12-31
- [x] Step 19.6: Implement animation speed setting - Completed 2025-12-31
- [x] Step 19.7: Fix ScoreBoard player order to match game layout - Completed 2025-12-31

**Notes:**
- Fixed card deck selection buttons being cut off ("Napole" instead of "Napoletane")
- Added missing `.deckOption` CSS class with `width: auto` and `min-width: 90px`
- Reduced overall UI sizes: title 3.5rem→2.75rem, buttons 60px→52px, container 500px→420px
- Downloaded Siciliane suit SVGs from Wikimedia Commons (Tarocco Siciliano, public domain):
  - coins.svg (148KB), cups.svg (162KB), swords.svg (29KB), clubs.svg (129KB)
- Updated `CoinIcon` and `SetteBelloIcon` in RoundEndScreen to use `useDeck()` context
- Icons now dynamically load `./cards/${deckType}/suits/coins.svg` based on selected deck
- Settings modal now pauses spectator mode and restores previous pause state on close
- Animation speed setting now functional with multipliers: fast (0.5x), normal (1x), slow (2x)
- `getAnimationDelay()` helper applies speed to CPU thinking, flip, move, and capture delays
- ScoreBoard now shows CPU first (top of game board), human second (bottom of game board)
- 130 tests passing

---

## Phase 20: LLM AI Integration (Gemini)

- [x] Step 20.1: Create async AI player interface - Completed 2025-12-31
- [x] Step 20.2: Implement Gemini AI player using @google/genai SDK - Completed 2025-12-31
- [x] Step 20.3: Add LLMAIContext with extended game state - Completed 2025-12-31
- [x] Step 20.4: Implement multi-turn chat sessions per round - Completed 2025-12-31
- [x] Step 20.5: Add token usage tracking and statistics - Completed 2025-12-31
- [x] Step 20.6: Create TokenStatsDisplay component with hover popup - Completed 2025-12-31
- [x] Step 20.7: Add model selection and dynamic model fetching - Completed 2025-12-31
- [x] Step 20.8: Integrate Gemini AI into game flow - Completed 2025-12-31

**Notes:**
- Created `AsyncAIPlayer` interface with `isAsync: true` discriminator for type-safe async handling
- `LLMAIContext` extends `AIContext` with: scores, targetScore, roundNumber, opponentHandCount, selfCapturedCount, opponentCapturedCount, deckCount, lastOpponentMove, validMoves
- Gemini AI uses `@google/genai` SDK with structured JSON output schema
- System instruction contains full Scopa rules, scoring categories, and prime values
- Chat sessions maintain conversation history within a round for context continuity
- `startRound()` creates fresh chat session; `endRound()` clears it
- Token stats tracked: promptTokens, responseTokens, thoughtTokens, totalTokens, cachedTokens, requestCount
- `TokenStatsDisplay` shows compact icon with total tokens; hover reveals detailed breakdown table
- Delta tracking shows per-turn token usage changes
- Model list fetched dynamically via `ai.models.list()` with fallback to hardcoded defaults
- Default model: `gemini-2.5-flash`
- API key loaded from `VITE_GEMINI_API_KEY` environment variable
- Graceful fallback to random AI on API errors
- AI reasoning logged to console for debugging
- Cached instance pattern prevents redundant AI object creation
- 130 tests passing

---

## Phase 21: Token Stats Enhancements & UI Polish

- [x] Step 21.1: Add round-specific vs cumulative token tracking - Completed 2026-01-01
- [x] Step 21.2: Add timing statistics (last, avg, min/max turn times) - Completed 2026-01-01
- [x] Step 21.3: Position token popup based on player position (top/bottom) - Completed 2026-01-01
- [x] Step 21.4: Support dual token displays for AI vs AI matches - Completed 2026-01-01
- [x] Step 21.5: Show model name in token popup header - Completed 2026-01-01
- [x] Step 21.6: Add (AI)/(CPU) suffix to player names - Completed 2026-01-01
- [x] Step 21.7: Strict model filtering (exclude nano, dated, TTS variants) - Completed 2026-01-01
- [x] Step 21.8: Improve ScoreBoard layout for longer names - Completed 2026-01-01

**Notes:**
- Token stats now track both cumulative (game) and round-specific stats
- Round stats reset at `startRound()`, shown in RoundEndScreen
- Timing stats added: `lastTurnTimeMs`, `totalTimeMs`, `minTurnTimeMs`, `maxTurnTimeMs`, `roundTotalTimeMs`
- Average time calculated from totalTimeMs/requestCount
- Times displayed in seconds (e.g., "1.23s" for <10s, "12.3s" for ≥10s)
- Token popup position: `top` (opens upward) for bottom players, `bottom` (opens downward) for top players
- TokenStatsDisplay accepts `mode` prop: `'round'` or `'game'`
- RoundEndScreen/GameEndScreen accept `player1TokenStats` and `player2TokenStats` separately
- `getAIDisplayName()` helper returns name with correct suffix: "(AI)" for Gemini, "(CPU)" for others
- Model allowlist pattern: `gemini-X[.X]-{flash|flash-lite|pro}[-thinking][-preview]`
- Preview models only shown if non-preview version unavailable
- Renamed "Scimmia" to "Scimmietta" (little monkey)
- ScoreBoard min-width increased to 200px, added gap between name and score
- 135 tests passing

---

## Phase 22: UI Polish & Settings Improvements

- [x] Step 22.1: Fix text alignment issues (player names wrapping) - Completed 2026-01-01
- [x] Step 22.2: Add descriptive AI icons - Completed 2026-01-01
- [x] Step 22.3: Clean up Settings modal - Completed 2026-01-01
- [x] Step 22.4: Add custom target score support - Completed 2026-01-01
- [x] Step 22.5: Prevent AI request re-triggering on pause/unpause - Completed 2026-01-01
- [x] Step 22.6: Use flexible widths for responsive layouts - Completed 2026-01-01

**Notes:**
- Fixed player name text wrapping with `white-space: nowrap` across all components
- New AI icons: ✦ (Gemini sparkle), 🐒 (Scimmietta/monkey), 🦊 (Furbo/fox)
- Single-turn mode icon changed from ⚡ to 1️⃣ (clearer meaning)
- Settings modal cleaned up:
  - Removed "CPU Opponent" (redundant - selected at game start)
  - Removed "Show Card Values" (never implemented)
  - Added "Card Deck" selection (moved from StartScreen)
- Custom target score: number input alongside preset buttons (11, 16, 21)
- Added `aiRequestInFlight` ref to prevent duplicate API calls when opening/closing settings
- Replaced hard-coded max-widths with `width: fit-content` and `max-width: 90vw` for flexible layouts
- Modals and labels now grow to accommodate long names automatically
- 135 tests passing

---

## Phase 23: OpenAI GPT AI Integration

- [x] Step 23.1: Install OpenAI SDK package - Completed 2026-01-01
- [x] Step 23.2: Create OpenAI AI implementation with structured outputs - Completed 2026-01-01
- [x] Step 23.3: Add OpenAI token stats (including reasoning tokens for o-series) - Completed 2026-01-01
- [x] Step 23.4: Implement model fetching with allowlist pattern - Completed 2026-01-01
- [x] Step 23.5: Update AI index exports - Completed 2026-01-01
- [x] Step 23.6: Add openaiModel to settings - Completed 2026-01-01
- [x] Step 23.7: Integrate OpenAI AI into App.tsx - Completed 2026-01-01
- [x] Step 23.8: Add OpenAI model selection to StartScreen - Completed 2026-01-01

**Notes:**
- Created `src/ai/openai.ts` following the same patterns as Gemini implementation
- OpenAI SDK uses `dangerouslyAllowBrowser: true` for client-side usage
- Structured JSON output via `response_format: { type: 'json_schema', json_schema: { ... }, strict: true }`
- Token stats track: promptTokens, responseTokens, reasoningTokens (for o-series), totalTokens, cachedTokens
- Model allowlist patterns support: gpt-4o, gpt-4o-mini, gpt-4.1, gpt-4.1-mini, gpt-4.1-nano, o-series (o1, o3, o4-mini)
- Multi-turn conversation via messages array (maintained across turns within a round)
- Same system instruction as Gemini (full Scopa rules, scoring, prime values)
- Added `isLLMAI()` helper for unified Gemini/OpenAI checks
- Token stats display works for both Gemini and OpenAI (uses unified thoughtTokens/reasoningTokens handling)
- API key loaded from `VITE_OPENAI_API_KEY` environment variable
- Graceful fallback to heuristic AI if API key not available
- 135 tests passing

---

## Phase 24: OpenAI Icon Integration & UI Polish

- [x] Step 24.1: Create OpenAI blossom logo SVG icon - Completed 2026-01-01
- [x] Step 24.2: Create AIPlayerLabel component with proper icons - Completed 2026-01-01
- [x] Step 24.3: Integrate AIPlayerLabel into ScoreBoard, CapturedPile, RoundEndScreen, GameEndScreen - Completed 2026-01-01
- [x] Step 24.4: Fix Gemini single-turn option in StartScreen - Completed 2026-01-01
- [x] Step 24.5: Fix duplicate OpenAI models (remove date-suffixed variants) - Completed 2026-01-01
- [x] Step 24.6: Fix dropdown layout wrapping (3 dropdowns on same row) - Completed 2026-01-01
- [x] Step 24.7: Use raw model IDs as display names - Completed 2026-01-01
- [x] Step 24.8: Add gpt-5-nano to OpenAI model patterns - Completed 2026-01-01
- [x] Step 24.9: Fix TokenStatsDisplay showing "Gemini" for OpenAI - Completed 2026-01-01

**Notes:**
- Created `OpenAIIcon` component with official OpenAI blossom logo SVG
- Created `AIPlayerLabel` component that renders proper icons for each AI type:
  - OpenAI: Blossom SVG icon
  - Gemini: Sparkle SVG icon (✦)
  - Scimmietta: 🐒 emoji
  - Furbo: 🦊 emoji
- Updated UI components to pass AI type/model props and render `AIPlayerLabel`
- HTML `<option>` elements still use text fallback icons (⬡, ✦) since SVG not supported
- Fixed Gemini single-turn missing from dropdown by expanding `AIProvider` type
- AI provider dropdown now shows: "Gemini 💬", "Gemini 1️⃣", "OpenAI 💬"
- Removed date-suffix patterns from OpenAI model regex to prevent duplicates
- Updated model allowlist to include gpt-5-nano: `/^gpt-5(\.\d+)?(-mini|-nano)?$/`
- Model dropdowns now show raw IDs (e.g., "gemini-2.5-flash", "gpt-4o-mini") instead of formatted names
- Fixed dropdown layout: `flex-wrap: nowrap`, container width 420px → 480px
- TokenStatsDisplay now accepts `modelName` prop, displays correct model name from start
- OpenAI brand guidelines allow logo usage with restrictions (non-exclusive, non-transferable, follow guidelines)
- 135 tests passing

---

## Phase 25: OpenAI Responses API Migration

- [x] Step 25.1: Research OpenAI Responses API and SDK types - Completed 2026-01-01
- [x] Step 25.2: Migrate from Chat Completions to Responses API - Completed 2026-01-01
- [x] Step 25.3: Implement server-side conversation state management - Completed 2026-01-01
- [x] Step 25.4: Update token stats for new API response format - Completed 2026-01-01
- [x] Step 25.5: Fix spectator mode model selection sync - Completed 2026-01-01
- [x] Step 25.6: Use authentic SVG coin icons in CapturedPile - Completed 2026-01-01
- [x] Step 25.7: Simplify single-move handling in AI implementations - Completed 2026-01-01

**Notes:**
- Migrated OpenAI implementation from Chat Completions API to new Responses API
- Conversation state now managed server-side via `conversation` parameter:
  - First request: no `conversation` param → API creates new conversation
  - Response includes `conversation.id` → stored locally
  - Subsequent requests: `conversation: { id }` → API continues conversation
  - `startRound()` clears conversation ID for fresh state
- No more manual `messages[]` array management
- API differences:
  - `client.chat.completions.create()` → `client.responses.create()`
  - `response_format.json_schema` → `text.format.json_schema`
  - `response.choices[0].message.content` → `response.output_text`
  - `usage.prompt_tokens` → `usage.input_tokens`
  - `usage.completion_tokens` → `usage.output_tokens`
- Fixed spectator mode bug: changing AI provider now correctly updates model selection
- CapturedPile now uses authentic denari SVG icon instead of "●" character
- Sette Bello indicator uses "7" + coin SVG icon
- Single-move cases: still call API for context continuity, use AI's actual reasoning
- 135 tests passing

---

## Phase 26: OpenAI Single-Turn Mode & UI Improvements

- [x] Step 26.1: Create openai-singleturn AI implementation - Completed 2026-01-01
- [x] Step 26.2: Add conversation mode toggle to StartScreen - Completed 2026-01-01
- [x] Step 26.3: Fix mode selector UI layout (dropdown to toggle button) - Completed 2026-01-01
- [x] Step 26.4: Fix spectator mode layout (provider + mode on same row) - Completed 2026-01-01
- [x] Step 26.5: Update AIPlayerLabel for openai-singleturn type - Completed 2026-01-01

**Notes:**
- Created `src/ai/openai-singleturn.ts` mirroring the Gemini single-turn pattern
- Each request is independent with no server-side conversation state
- Maintains local `roundMoveHistory` and `initialTable` for context reconstruction
- Uses `buildSingleTurnPrompt()` with full round history in each request
- Refactored AI type handling:
  - `AIProvider` now just `'gemini' | 'openai'` (base provider)
  - New `ConversationMode` type: `'conversation' | 'singleturn'`
  - Helper functions: `getConversationMode()`, `getExtendedAIType()`
- Changed mode selector from dropdown to compact toggle button (💬/1️⃣)
- Button title shows descriptive text on hover
- Added `.providerRow` CSS wrapper to keep provider dropdown + mode toggle on same line
- Works correctly in both play mode and spectator mode
- AIPlayerLabel updated with `openai-singleturn` case for icon and text display
- 135 tests passing

---

## MVP Complete!

The Scopa game is now fully playable with:
- Complete game rules (capture, sum capture, mandatory capture, scopa scoring)
- Neapolitan card graphics (Siciliane suits available, card faces pending)
- Selectable AI opponents (Random, Greedy heuristic, Gemini LLM, or OpenAI GPT)
- Gemini AI with multi-turn chat sessions, token tracking, and model selection
- OpenAI GPT AI with Responses API (server-side conversation state), structured outputs, and reasoning tokens
- Animated card interactions (3D flip CPU card reveal, drag and drop)
- Enhanced round summary with Italian names, counts, captured card display, and hover highlighting
- Deck-aware custom SVG icons for score categories
- Two-phase dealing animation (table cards first, then player hands)
- Sette Bello celebration animation
- Dealer deck display that switches sides
- Round and game end screens with detailed scoring breakdown
- Settings persistence (including AI selection and deck choice)
- New game and settings controls
- Compact, polished StartScreen UI
- Token usage display for LLM AI games (both Gemini and OpenAI)
