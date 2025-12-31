# Scopa WebApp - Development Progress

**Last Updated:** 2025-12-30

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

**Notes:**
- Changed deal detection from `useEffect` to `useLayoutEffect` to prevent flash of cards before animation
- Two-phase dealing for round start: table phase (4 cards) → pause (300ms) → hands phase (6 cards)
- Mid-round dealing skips directly to hands phase
- Added `celebrationActive` state to track full celebration lifecycle (including exit animations)
- Fixed Card component's `dragProps` to properly check `!disabled` for drag blocking
- Custom SVG icons in RoundEndScreen: CardsIcon (3 fanned cards), CoinIcon (gold coin with gradients), SetteBelloIcon (card with 2-1-2-2 coin pattern), PrimieraIcon (gold star), ScopaIcon (emoji broom)
- Capture indicator now appears on capturing player's side: top for CPU, bottom for human
- 130 tests passing

---

## MVP Complete!

The Scopa game is now fully playable with:
- Complete game rules (capture, sum capture, mandatory capture, scopa scoring)
- Neapolitan card graphics
- Selectable AI opponents (Random or Greedy heuristic)
- Animated card interactions (3D flip CPU card reveal, drag and drop)
- Enhanced round summary with Italian names, counts, captured card display, and hover highlighting
- Custom SVG icons for score categories
- Two-phase dealing animation (table cards first, then player hands)
- Sette Bello celebration animation
- Dealer deck display that switches sides
- Round and game end screens with detailed scoring breakdown
- Settings persistence (including AI selection)
- New game and settings controls
