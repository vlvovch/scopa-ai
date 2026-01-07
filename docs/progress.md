# Scopa WebApp - Development Progress

**Last Updated:** 2026-01-06

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

## Phase 27: Claude Anthropic API Integration

- [x] Step 27.1: Install @anthropic-ai/sdk package - Completed 2026-01-01
- [x] Step 27.2: Create Claude AI multi-turn implementation - Completed 2026-01-01
- [x] Step 27.3: Create Claude AI single-turn implementation - Completed 2026-01-01
- [x] Step 27.4: Update AI index exports with Claude types and helpers - Completed 2026-01-01
- [x] Step 27.5: Add Claude icon to AIPlayerLabel component - Completed 2026-01-01
- [x] Step 27.6: Add Claude provider option to StartScreen - Completed 2026-01-01
- [x] Step 27.7: Add claudeModel to settings hook - Completed 2026-01-01
- [x] Step 27.8: Integrate Claude AI into App.tsx game flow - Completed 2026-01-01

**Notes:**
- Created `src/ai/claude.ts` using Anthropic Messages API with local conversation state
- Created `src/ai/claude-singleturn.ts` for single-turn mode with full history
- Uses **tool use (function calling)** for structured JSON output:
  - `select_move` tool with JSON schema for `moveIndex` and `reasoning`
  - `tool_choice: { type: 'tool', name: 'select_move' }` forces structured output
- Key difference from OpenAI: conversation state managed locally via `messages[]` array (not server-side)
- Messages array flow:
  1. Push user message with game state
  2. Call API with full messages array
  3. Parse `tool_use` response block for move selection
  4. Push assistant response to maintain context
  5. `startRound()` clears messages for fresh conversation
- Token stats tracked: input, output, cache creation, cache read tokens
- Models fetched dynamically via `client.beta.models.list()` API
- Default model: `claude-sonnet-4-5-20250929`
- API key loaded from `VITE_CLAUDE_API_KEY` environment variable
- Same system instruction as Gemini/OpenAI (full Scopa rules, scoring, prime values)
- Graceful fallback to heuristic AI if API key not available
- 135 tests passing

---

## Phase 28: Brand Icons & Custom Dropdown

- [x] Step 28.1: Fix Claude API tool_result requirement - Completed 2026-01-01
- [x] Step 28.2: Create official Claude logo SVG icon - Completed 2026-01-01
- [x] Step 28.3: Add brand colors to all AI icons - Completed 2026-01-01
- [x] Step 28.4: Create GeminiIcon component with brand color - Completed 2026-01-01
- [x] Step 28.5: Create CustomDropdown component for SVG icons - Completed 2026-01-01
- [x] Step 28.6: Integrate CustomDropdown into StartScreen - Completed 2026-01-01

**Notes:**
- Fixed Claude API 400 error: After assistant uses `tool_use`, must send `tool_result` in next message
  - Added `tool_result` block after each assistant response to acknowledge the tool call
  - Message flow: user → assistant (tool_use) → user (tool_result) → user (next prompt) → ...
- Created `ClaudeIcon.tsx` using official Claude logo SVG from Bootstrap Icons
- Added brand colors to all AI icon components:
  - Gemini: Google Blue (#4285F4)
  - OpenAI: OpenAI Green (#10A37F)
  - Claude: Anthropic Coral (#D97757)
- Created `GeminiIcon.tsx` as separate component (was inline in AIPlayerLabel)
- Created `CustomDropdown.tsx` - custom dropdown that can render SVG icons:
  - Native `<select>/<option>` only supports text, not HTML/SVG
  - Features: keyboard navigation, click outside to close, checkmark on selected
  - Matches native dropdown styling (same background, border, border-radius)
- Updated StartScreen to use CustomDropdown for AI provider selection
- 135 tests passing

---

## Phase 29: Extended Thinking for Claude & Gemini

- [x] Step 29.1: Replace Claude tool use with structured outputs (output_format) - Completed 2026-01-02
- [x] Step 29.2: Add Claude extended thinking with 10000 token budget - Completed 2026-01-02
- [x] Step 29.3: Skip Claude thinking when only one valid move - Completed 2026-01-02
- [x] Step 29.4: Add PersonIcon for human player in ScoreBoard - Completed 2026-01-02
- [x] Step 29.5: Research thinking token tracking (Claude doesn't expose it) - Completed 2026-01-02
- [x] Step 29.6: Add Gemini dynamic thinking with per-message config - Completed 2026-01-02
- [x] Step 29.7: Add thinking to Claude single-turn mode - Completed 2026-01-02

**Notes:**

**Claude Extended Thinking:**
- Replaced tool use with `output_format` structured outputs:
  - Tool use was incompatible with extended thinking (forced tool_choice not allowed)
  - `output_format` with JSON schema works seamlessly with extended thinking
  - Uses beta API: `client.beta.messages.create()` with `betas: ['structured-outputs-2025-11-13']`
- Extended thinking enabled for both multi-turn and single-turn:
  - `thinking: { type: 'enabled', budget_tokens: 10000 }`
  - Multi-turn skips thinking for single-move turns (optimization)
  - Single-turn skips API call entirely for single-move turns
- Anthropic API does NOT provide separate `thinking_tokens` field
  - Thinking tokens included in `output_tokens` (billed together)
  - Removed thoughtTokens tracking from ClaudeTokenStats

**Gemini Extended Thinking:**
- Added dynamic thinking via `thinkingConfig: { thinkingBudget }` per-message
- Multi-turn: `-1` (dynamic) for multiple moves, `0` (disabled) for single moves
- Single-turn: `-1` (dynamic) always, skips API call for single moves
- Thinking tokens tracked via `usageMetadata.thoughtsTokenCount` (already implemented)

**UI:**
- Added PersonIcon component for human player display
- Simple SVG person silhouette matching AI icon styling
- 135 tests passing

---

## Phase 30: Expert AI & Background Simulation

- [x] Step 30.1: Port Expert AI with ISMCTS from local project - Completed 2026-01-02
- [x] Step 30.2: Create Web Worker for background CPU simulation - Completed 2026-01-02
- [x] Step 30.3: Add instant animation mode for fast simulations - Completed 2026-01-02
- [x] Step 30.4: Add auto-advance spectator setting - Completed 2026-01-02
- [x] Step 30.5: Enhanced GameEndScreen with category breakdown and round history - Completed 2026-01-02
- [x] Step 30.6: Add cumulative category totals tracking - Completed 2026-01-02
- [x] Step 30.7: UI polish (sticky header fix, equal score box heights) - Completed 2026-01-02

**Notes:**

**Expert AI (ISMCTS):**
- Ported `expert.ts` from separate project implementing Information Set Monte Carlo Tree Search
- Uses determinization to handle hidden information (opponent's hand, deck)
- Alpha-beta pruning for move evaluation within determinized states
- Evaluation weights: scopaDiff×120, denariDiff×18, cardDiff×4, primiera×8, setteBello×120
- Configurable time budget (default 30ms for worker, adjustable for main thread)
- Registered as "Esperto" (🧠) in AI_PLAYERS and AI_INFO

**Web Worker Background Simulation:**
- Created `src/workers/gameSimulation.worker.ts` for unthrottled background execution
- Created `src/hooks/useGameWorker.ts` React hook for worker management
- Worker only used for **instant mode** with sync AIs (random, heuristic, expert)
- Browsers throttle setTimeout in hidden tabs; Web Workers are not throttled
- Batched state updates (every 20 moves) to reduce overhead in instant mode
- Worker handles full game loop: playing → roundEnd → NEXT_ROUND → gameEnd
- `workerFinalState` persists game end state for summary display

**Animation & Timing:**
- Added "instant" animation speed option (10ms delays, skip celebrations)
- Auto-advance spectator setting: 2-second countdown then auto-continue
- RoundEndScreen shows countdown button "Next Round in Xs" when enabled

**GameEndScreen Enhancements:**
- Category breakdown table: Carte, Denari, Sette Bello, Primiera, Scope
- Round-by-round history table with running totals (last 10,000 rounds)
- `categoryTotals` tracked separately in GameState (never truncated)
- Breakdown totals always add up correctly even for 1000+ round games
- Sticky table header fix using `border-collapse: separate`
- Equal height score boxes using transparent border trick

**UI Polish:**
- Fixed "You Wins!" → "You Win!" grammar
- Score divider "-" vertically centered with `align-self: center`
- Round history limited to 10,000 entries (configurable)

- 135 tests passing

---

## Phase 31: CLI Simulation Tool

- [x] Step 31.1: Create tsconfig.cli.json for Node.js TypeScript compilation - Completed 2026-01-03
- [x] Step 31.2: Implement standalone CLI simulation script - Completed 2026-01-03
- [x] Step 31.3: Add LLM AI support (Gemini, OpenAI, Claude) - Completed 2026-01-03
- [x] Step 31.4: Add CLI argument parsing and help - Completed 2026-01-03
- [x] Step 31.5: Add JSON output for results - Completed 2026-01-03
- [x] Step 31.6: Add game state persistence to localStorage - Completed 2026-01-03

**Notes:**

**CLI Simulation Tool (`scripts/simulate.ts`):**
- Standalone Node.js script for running AI vs AI simulations
- Designed for long-running LLM simulations on remote servers (Contabo, etc.)
- Works with `screen`, `tmux`, or `nohup` for background execution
- Uses `tsx` runtime for direct TypeScript execution

**Usage:**
```bash
# Run with npm script
npm run simulate -- -p1=heuristic -p2=random -g=100

# Or directly with tsx
npx tsx scripts/simulate.ts --player1=gemini --player2=expert --games=50

# Background execution on server
nohup npm run simulate -- -p1=gemini -p2=claude -g=1000 > results.log 2>&1 &

# With screen for interactive monitoring
screen -S scopa-sim
npm run simulate -- -p1=openai -m1=gpt-4o -p2=expert -g=100 -v
# Ctrl+A, D to detach
```

**CLI Options:**
- `--player1, -p1`: AI type for player 1 (random, heuristic, expert, gemini, openai, claude)
- `--player2, -p2`: AI type for player 2
- `--model1, -m1`: Model for player 1 (for LLM AIs)
- `--model2, -m2`: Model for player 2 (for LLM AIs)
- `--games, -g`: Number of games (default: 10)
- `--target, -t`: Target score per game (default: 11)
- `--thinking`: Enable/disable thinking for LLMs (default: true)
- `--verbose, -v`: Show round-by-round output
- `--output, -o`: Save results to JSON file

**Environment Variables:**
- `GEMINI_API_KEY`: Google Gemini API key
- `OPENAI_API_KEY`: OpenAI API key
- `ANTHROPIC_API_KEY`: Anthropic Claude API key

**Output Statistics:**
- Win/loss/tie counts and percentages
- Average scores per player
- Average rounds per game
- For LLM AIs: API call count, total tokens, average time per call

**Game State Persistence:**
- Game state automatically saved to localStorage during play
- Survives browser refresh, tab closure, laptop sleep
- Spectator AI selections also persisted
- Cleared when game is reset to idle

**Technical Notes:**
- Self-contained script with all game logic (no imports from src/)
- Uses same LLM SDKs: @google/genai, openai, @anthropic-ai/sdk
- Expert AI uses simplified ISMCTS (1000 iterations with heuristic scoring)
- Multi-turn conversation mode for LLMs (fresh session each round)

---

## Phase 32: Sound Effects & Game Statistics

- [x] Step 32.1: Add sound effects system with useSound hook - Completed 2026-01-06
- [x] Step 32.2: Add sound toggle to settings - Completed 2026-01-06
- [x] Step 32.3: Create new app icon (Sette Bello coin) - Completed 2026-01-06
- [x] Step 32.4: Change Esperto icon to snake - Completed 2026-01-06
- [x] Step 32.5: Implement game statistics tracking - Completed 2026-01-06
- [x] Step 32.6: Create StatsModal with opponent summary and game history - Completed 2026-01-06
- [x] Step 32.7: Improve custom target score input styling - Completed 2026-01-06

**Notes:**

**Sound Effects System:**
- Created `src/hooks/useSound.ts` hook for audio playback
- Audio files from Kenney.nl Casino Audio pack (CC0 license) in `public/sounds/`
- Sound types: `deal`, `play`, `capture`, `slide`, `scopa`, `setteBello`
- Sound triggers integrated at key game events:
  - Deal: when cards are dealt (table + hands)
  - Play: when a card is placed without capture
  - Capture: when cards are captured
  - Scopa: when scopa celebration triggers
  - Sette Bello: when 7 of Coins is captured
- Simple on/off toggle in Settings (no volume slider - uses system volume)
- Random variant selection for natural feel (except deal which uses single file)

**App Icon:**
- Created `public/scopa-icon.svg` - gold coin with number 7 (Sette Bello theme)
- Updated `index.html` to use new favicon instead of vite.svg

**Esperto Icon Change:**
- Changed Esperto (Expert AI) icon from 🧠 (brain) to 🐍 (snake)
- Updated in `src/ai/index.ts` and `src/components/UI/AIPlayerLabel.tsx`

**Game Statistics System:**
- Created `src/hooks/useStats.ts` for localStorage-persisted statistics
- Tracks: opponent type, model, scores, rounds played, timestamp
- Stats recorded only for Player vs CPU games (not spectator mode)
- Created `src/components/UI/StatsModal.tsx` with two views:
  - Summary view: W-L record and win % for each opponent
  - Detail view: game history with date, time, score, result
- CPU players (Scimmietta, Furbo, Esperto) always shown
- LLM players only shown if games were played against them
- Added Stats button (bar chart icon) to GameControls
- "Clear All" button with confirmation to reset stats

**UI Polish:**
- Custom target score input now has distinct underline style (dashed border)
- Differentiates it from preset buttons (11, 16, 21)
- Solid gold underline when selected/focused

- 135 tests passing

---

## Phase 33: Sound Enhancements & Stats Improvements

- [x] Step 33.1: Add victory sound for game end - Completed 2026-01-06
- [x] Step 33.2: Add coin sound for denari captures - Completed 2026-01-06
- [x] Step 33.3: Add broom sweep sound for Scopa celebration - Completed 2026-01-06
- [x] Step 33.4: Fix Sette Bello double-trigger issue - Completed 2026-01-06
- [x] Step 33.5: Improve stats modal game history UI - Completed 2026-01-06
- [x] Step 33.6: Add AI mode tracking to game stats - Completed 2026-01-06
- [x] Step 33.7: Make captured pile cards face down - Completed 2026-01-06

**Notes:**

**Sound Effects Enhancements:**
- Added `victory` sound type for game end celebration (chips-stack sounds)
- Added `coin` sound type for denari captures using `coin-dropped-81172.mp3`
- Coin sound triggers when:
  - Any captured cards have coins suit, OR
  - The played card has coins suit (and captures something)
- Added `broom-sweep.mp3` for Scopa celebration (cut to first sweep, ~0.65s)
- Differentiated celebration sounds:
  - `chips-stack-1.ogg` - coin capture
  - `chips-stack-4.ogg` - scopa, setteBello celebrations
  - Both variants for victory (random selection)

**Sette Bello Fix:**
- Fixed double-trigger bug where celebration could fire twice
- Added `!setteBelloCelebration.show` guard to both detection effects
- Moved ref update to happen immediately (before setTimeout) in capture effect
- Two effects now properly mutually exclusive:
  - Capture during play effect (in captured pile)
  - Round end effect (still on table, awarded to last capture player)

**Stats Modal Improvements:**
- Fixed alignment of DATE, SCORE, RESULT columns
- Smaller font (0.75rem for rows, 0.6875rem for headers)
- Date and time on one line (was two lines before)
- Added match counter (#1, #2, etc.) column
- Reverse chronological order (newest games first)
- Fixed Back button character (← instead of ‹)
- Grid now 4 columns: # | Date/Time | Score | W/L

**AI Mode Tracking:**
- Added `isMultiTurn` and `useThinking` fields to GameRecord
- Updated `recordGame()` to accept AI mode parameters
- Mode determined from AI type and settings:
  - `isMultiTurn`: true for 'gemini'/'openai'/'claude', false for '-singleturn' variants
  - `useThinking`: from `settings.useThinking` for LLM opponents
- Display in game history:
  - 💬 = Multi-turn mode (chat with context)
  - 1️⃣ = Single-turn mode (full history each turn)
  - 🧠 = Thinking/reasoning enabled (appended after turn mode)
- Tooltip shows full description on hover
- Only displayed for LLM opponents (not CPU AIs)

**Captured Pile:**
- Cards in captured pile now display face down
- Added `faceDown` prop to Card component in CapturedPile

- 135 tests passing

---

## Phase 34: General Bug Fixes

- [x] Step 34.1: Fix Sette Bello infinite loop at round end - Completed 2026-01-06

**Notes:**

**Sette Bello Infinite Loop Fix:**
- Fixed a bug where the Sette Bello celebration would enter an infinite loop if captured at the end of the round.
- The issue caused by race condition between two effects: one setting ownership for round-end awarding, and another resetting it based on play-time capture piles (which are empty on table cards).
- Added guard clause to prevent resetting ownership tracking when in `roundEnd` status.

---

## Phase 35: BYOK API Key Management & Deployment

- [x] Step 35.1: Create API key validation functions (validateApiKey.ts) - Completed 2026-01-06
- [x] Step 35.2: Add validation status display in SettingsModal - Completed 2026-01-06
- [x] Step 35.3: Add validity flags to GameSettings - Completed 2026-01-06
- [x] Step 35.4: Implement cache clearing when API keys change - Completed 2026-01-06
- [x] Step 35.5: Make AI modules re-throw errors for App.tsx handling - Completed 2026-01-06
- [x] Step 35.6: Add error badge display in TokenStatsDisplay - Completed 2026-01-06
- [x] Step 35.7: Fix race condition with aiAvailability from React state - Completed 2026-01-06
- [x] Step 35.8: Add AI hint when no providers available on StartScreen - Completed 2026-01-06
- [x] Step 35.9: Add API key security warning popup - Completed 2026-01-06
- [x] Step 35.10: Create Caddy deployment configuration - Completed 2026-01-06
- [x] Step 35.11: Create deployment automation script - Completed 2026-01-06

**Notes:**

**API Key Validation:**
- Created `src/ai/validateApiKey.ts` with validation functions:
  - `validateGeminiKey()`: Makes API call to list models endpoint
  - `validateOpenAIKey()`: Makes API call with Bearer token
  - `validateClaudeKey()`: Format check only (sk-ant- prefix) due to CORS restrictions
- Validation status type: `'idle' | 'validating' | 'valid' | 'invalid'`
- SettingsModal shows status indicator next to each API key input
- Debounced validation (500ms) to avoid excessive API calls while typing

**Settings Structure:**
- Added validity flags: `geminiKeyValid`, `openaiKeyValid`, `claudeKeyValid`
- Added validity check functions: `isGeminiKeyValid()`, `isOpenAIKeyValid()`, `isClaudeKeyValid()`
- `isXXXAvailable()` functions now check both key existence AND validity
- Keys marked invalid until validation completes

**Cache Invalidation:**
- Added `clearXXXCache()` functions to all 6 AI modules
- Exported from `ai/index.ts`
- Called in SettingsModal when API key changes
- Ensures new key is used immediately on next AI request

**Error Handling:**
- AI modules now re-throw errors instead of swallowing them
- App.tsx catches errors and displays via TokenStatsDisplay error badge
- Falls back to heuristic AI when LLM API call fails
- Error badge is clickable to dismiss

**Race Condition Fix:**
- Problem: StartScreen read from localStorage, but updates happen in useEffect AFTER render
- Solution: Pass `aiAvailability` as props computed from React state in App.tsx
- AI availability now synchronized with React render cycle

**AI Hint:**
- Shows "Want to play against AI? Add API keys in Settings" when no providers available
- Settings link opens the settings modal directly
- Only displayed when `onOpenSettings` prop is provided

**Security Warning:**
- Popup appears on first API key input each session
- Explains: local storage only, no server transmission, direct browser-to-provider calls
- Dismissal stored in sessionStorage (reappears next session)

- 135 tests passing

---

## Phase 36: UI Polish & Rules Modal

- [x] Step 36.1: Fix ScoreBoard layout shift (remove bold on current player) - Completed 2026-01-06
- [x] Step 36.2: Add PersonIcon to RoundEndScreen - Completed 2026-01-06
- [x] Step 36.3: Add PersonIcon to GameEndScreen - Completed 2026-01-06
- [x] Step 36.4: Create RulesModal component with comprehensive Scopa rules - Completed 2026-01-06
- [x] Step 36.5: Add rules button to GameControls - Completed 2026-01-06
- [x] Step 36.6: Add "View Full Rules" link to StartScreen - Completed 2026-01-06
- [x] Step 36.7: Add footer to GameLayout (in-game) - Completed 2026-01-06
- [x] Step 36.8: Update footer styling (smaller, bold links) - Completed 2026-01-06
- [x] Step 36.9: Make footer position:fixed for zoom compatibility - Completed 2026-01-06
- [x] Step 36.10: Fix PlayerHand layout shift (min-width) - Completed 2026-01-06
- [x] Step 36.11: Increase "Your turn" label spacing - Completed 2026-01-06

**Notes:**

**Rules Modal:**
- Created `RulesModal.tsx` with comprehensive Scopa rules
- Accessible from GameControls (question mark button) and StartScreen ("View Full Rules" link)
- Covers: deck composition, setup, gameplay rules, mandatory capture, single card priority, scopa, scoring, primiera values
- Scrollable content with styled sections and tables

**Layout Stability Fixes:**
- ScoreBoard: Removed `font-weight: bold` from `.current` class - only color changes now
- PlayerHand: Added `min-width: 340px` to prevent shrinking when cards are played
- Controls: Added `marginLeft: 16px` for better spacing from hand

**PersonIcon Consistency:**
- Added to RoundEndScreen `renderPlayer1Name()` for human player display
- Added to GameEndScreen `renderPlayer1Name()` and `player1Short` for table headers
- Now consistent across ScoreBoard, RoundEndScreen, and GameEndScreen

**Footer:**
- Updated format: `© 2026 Volodymyr Vovchenko. Built with help from Claude Code`
- Styling: 11px font, bold links, 50% opacity, gold hover
- GameLayout footer: `position: fixed` at bottom for zoom compatibility
- StartScreen footer: Same styling, inline with existing layout

---

## MVP Complete!

The Scopa game is now fully playable with:
- Complete game rules (capture, sum capture, mandatory capture, scopa scoring)
- Neapolitan card graphics (Siciliane suits available, card faces pending)
- Selectable AI opponents (Random, Heuristic, Expert ISMCTS, Gemini LLM, OpenAI GPT, or Anthropic Claude)
- Expert AI using Information Set Monte Carlo Tree Search with determinization
- Gemini AI with multi-turn chat sessions, token tracking, and model selection
- OpenAI GPT AI with Responses API (server-side conversation state), structured outputs, and reasoning tokens
- Claude AI with Messages API, extended thinking (10k tokens), and structured outputs
- Official AI brand icons with brand colors (Gemini blue, OpenAI green, Claude coral)
- Custom dropdown component for AI provider selection with SVG icons
- PersonIcon for human player display (matches AI icon styling)
- Animated card interactions (3D flip CPU card reveal, drag and drop)
- Enhanced round summary with Italian names, counts, captured card display, and hover highlighting
- Deck-aware custom SVG icons for score categories
- Two-phase dealing animation (table cards first, then player hands)
- Sette Bello celebration animation
- Dealer deck display that switches sides
- Round and game end screens with detailed scoring breakdown
- Enhanced GameEndScreen with category breakdown and round-by-round history
- Web Worker for unthrottled background CPU simulation (instant mode)
- Auto-advance spectator mode with configurable delays
- Instant animation mode for fast simulations
- Settings persistence (including AI selection and deck choice)
- Game state persistence (survives browser refresh/laptop sleep)
- New game and settings controls
- Compact, polished StartScreen UI
- Token usage display for LLM AI games (Gemini, OpenAI, and Claude)
- CLI simulation tool for long-running server-side AI battles
- Sound effects for card dealing, playing, capturing, and celebrations
- Distinct sounds: coin drop for denari, broom sweep for scopa, chips for victory
- Game statistics tracking with W-L records against each opponent
- AI mode tracking in stats (multi-turn/single-turn, thinking enabled)
- Custom Sette Bello app icon (gold coin with 7)
- Face-down cards in captured piles for cleaner visual
- BYOK (Bring Your Own Key) support with API key validation
- Cache invalidation when API keys change
- Error badge display with fallback to heuristic AI
- AI availability computed from React state (race condition fix)
- AI hint on StartScreen when no providers available
- In-game rules modal with comprehensive Scopa rules
- Consistent PersonIcon across all screens (ScoreBoard, RoundEndScreen, GameEndScreen)
- Copyright footer on StartScreen and in-game (position:fixed for zoom compatibility)
- Layout stability improvements (no shift on turn change or card play)
- Mobile-optimized responsive design (see Phase 37)

---

## Phase 37: Mobile Optimization

- [x] Step 37.1: Add responsive card CSS variables with clamp() - Completed 2026-01-06
- [x] Step 37.2: Fix PlayerHand min-width overflow issue - Completed 2026-01-06
- [x] Step 37.3: Add phone breakpoints (600px, 480px, 380px) - Completed 2026-01-06
- [x] Step 37.4: Add touch-action CSS and iOS safe area insets - Completed 2026-01-06
- [x] Step 37.5: Optimize ScoreBoard for mobile - Completed 2026-01-06
- [x] Step 37.6: Fix TableCards min-width for mobile - Completed 2026-01-06
- [x] Step 37.7: Optimize StartScreen for narrow phones - Completed 2026-01-06
- [x] Step 37.8: Optimize modals (Settings, RoundEnd, GameEnd) - Completed 2026-01-06
- [x] Step 37.9: Add responsive styles to CapturedPile and GameControls - Completed 2026-01-06
- [x] Step 37.10: Update viewport meta for iOS safe areas - Completed 2026-01-06

**Notes:**

**Responsive Card Sizing:**
- Cards now scale fluidly using CSS `clamp()`:
  - 600px: `clamp(52px, 17vw, 70px)` width
  - 480px: `clamp(48px, 16vw, 60px)` width
  - 380px: `clamp(44px, 15vw, 52px)` width
- Height maintains 2:3 ratio automatically
- Border radius scales down on smaller screens

**New Breakpoints:**
- 600px: Large phones, landscape mode
- 480px: Standard phones (iPhone, Android)
- 380px: Small phones (iPhone SE, older Android)

**Touch Optimizations:**
- `touch-action: manipulation` prevents 300ms tap delay
- Applied to buttons, links, and card elements
- iOS safe area insets via `env(safe-area-inset-*)` for notch/home bar
- `viewport-fit=cover` in meta tag for edge-to-edge support

**Fixed Overflow Issues:**
- `PlayerHand`: Changed `min-width: 340px` → `min(340px, 90vw)`
- `TableCards`: Changed `min-width: 280px` → `min(280px, 85vw)`
- `ScoreBoard`: `min-width: auto` on mobile
- `GameLayout.controlsArea`: `min-width: auto` on mobile

**Component-Specific Optimizations:**
- ScoreBoard: Smaller fonts, reduced padding on mobile
- StartScreen: Stacked spectator setup, smaller buttons/inputs
- Modals: Full-width on mobile, smaller padding, adjusted fonts
- CapturedPile: Smaller badges and stats text
- GameControls: Larger touch targets (40px) on mobile

**Files Modified:**
- `src/index.css` - Global responsive variables and touch-action
- `src/components/Layout/GameLayout.module.css`
- `src/components/Table/PlayerHand.module.css`
- `src/components/Table/TableCards.module.css`
- `src/components/Table/CapturedPile.module.css`
- `src/components/UI/ScoreBoard.module.css`
- `src/components/UI/StartScreen.module.css`
- `src/components/UI/SettingsModal.module.css`
- `src/components/UI/RoundEndScreen.module.css`
- `src/components/UI/GameEndScreen.module.css`
- `src/components/UI/GameControls.module.css`
- `index.html` - viewport-fit=cover

- 135 tests passing

---

## Phase 38: Browser Zoom Tolerance (100-125%)

- [x] Step 38.1: Add PWA support with service worker and manifest - Completed 2026-01-07
- [x] Step 38.2: Reduce card dimensions for 125% zoom tolerance - Completed 2026-01-07
- [x] Step 38.3: Reduce padding and spacing throughout layout - Completed 2026-01-07
- [x] Step 38.4: Use clamp() with viewport units for flexible sizing - Completed 2026-01-07

**Notes:**

**PWA Support:**
- Added `manifest.json` with app metadata and icons (192px, 512px)
- Created `sw.js` service worker with cache-first strategy for offline support
- Added apple-touch-icon and theme-color meta tags to index.html
- Offline play works for non-LLM opponents (Random, Heuristic, Expert)
- File permissions set to 644 for web server readability
- Caddy server requires explicit MIME types:
  - `manifest.json` → `application/manifest+json`
  - `sw.js` → `application/javascript`

**Zoom Tolerance:**
- Browser zoom scales CSS pixels but not viewport units - 125% zoom = 25% larger visually
- Reduced base card dimensions to fit at 125% zoom:
  - Width: 70px → 66px (at 125% zoom renders as ~82px)
  - Height: 115px → 108px (at 125% zoom renders as ~135px)
- Card dimensions now use clamp(): `clamp(48px, 8.5vh, 66px)` width, `clamp(78px, 14vh, 108px)` height
- Reduced padding throughout:
  - GameLayout: space-2 padding, 18px bottom padding
  - Hand margins: 2px (was 4px)
  - CapturedPile: 2px gap, space-1 padding
- Used clamp() with viewport units for flexible component sizing:
  - ScoreBoard min-width: `clamp(140px, 16vw, 200px)`
  - Controls min-height/width: `clamp(40px, 5vh, 50px)` / `clamp(150px, 16vw, 200px)`
  - Table area min-height: `calc(var(--card-height) + 16px)`

**Files Modified:**
- `src/index.css` - Card dimensions with clamp()
- `src/components/Layout/GameLayout.module.css` - Reduced padding and margins
- `src/components/Table/PlayerHand.module.css` - Reduced gap and padding
- `src/components/Table/TableCards.module.css` - Reduced gap and padding
- `src/components/Table/CapturedPile.module.css` - Reduced gap and padding
- `src/components/UI/ScoreBoard.module.css` - Viewport-relative min-width
- `index.html` - PWA manifest link, service worker registration
- `public/manifest.json` - PWA manifest (new)
- `public/sw.js` - Service worker (new)

- 135 tests passing
