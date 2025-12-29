# Scopa WebApp - Implementation Plan

**Version:** 1.0  
**Last Updated:** December 2024  
**Scope:** Base Game (MVP)

---

## Overview

This document provides step-by-step implementation instructions for the Scopa WebApp base game. Each step is small, specific, and includes a validation test. Follow the steps in order—each builds on the previous.

**Reference Documents:**
- `game-design-document.md` — Game rules, scoring, UI design
- `tech-stack.md` — Technology choices, project structure

**Target Outcome:** A playable 2-player Scopa game (Human vs CPU) with basic animations, scoring, and a random CPU opponent.

---

## Documentation Updates

Throughout implementation, keep the memory-bank documents updated:

### progress.md
Update after completing each step:
- Mark steps as completed with date
- Note any deviations from the plan
- Record blockers or issues encountered

### architecture.md
Update after completing each phase:
- Document the implemented architecture
- Include file structure created
- Document key interfaces and types
- Note any architectural decisions made

**Template for progress.md entries:**
```markdown
## Phase X: [Name]
- [x] Step X.1: [Name] - Completed YYYY-MM-DD
- [x] Step X.2: [Name] - Completed YYYY-MM-DD
- [ ] Step X.3: [Name] - In progress
Notes: [Any relevant notes]
```

---

## Phase 1: Project Setup

### Step 1.1: Initialize Project

**Task:** Create a new Vite + React + TypeScript project.

**Instructions:**
1. Create a new directory named `scopa`
2. Initialize a Vite project with the React TypeScript template
3. Install Framer Motion as the only additional dependency
4. Verify the development server starts without errors

**Validation Test:**
- Run the development server
- Browser opens to localhost showing the default Vite React page
- No errors in terminal or browser console
- Confirm `package.json` contains exactly 3 runtime dependencies: `react`, `react-dom`, `framer-motion`

---

### Step 1.2: Configure Vite for Static Deployment

**Task:** Configure Vite to output relative paths suitable for subdirectory hosting.

**Instructions:**
1. Open `vite.config.ts`
2. Set `base` to `'./'` for relative asset paths
3. Configure build output directory as `dist`
4. Enable terser minification

**Validation Test:**
- Run production build command
- Verify `dist/` folder is created
- Open `dist/index.html` in browser directly (file:// protocol)
- Page loads without 404 errors for JS/CSS assets

---

### Step 1.3: Create Directory Structure

**Task:** Set up the source code folder structure as defined in tech-stack.md.

**Instructions:**
1. Inside `src/`, create these folders:
   - `components/Card/`
   - `components/Table/`
   - `components/UI/`
   - `components/Layout/`
   - `game/`
   - `ai/`
   - `hooks/`
   - `utils/`
2. Inside `public/`, create these folders:
   - `cards/`
   - `sounds/`
3. Delete default Vite boilerplate files (App.css content, logo.svg, etc.)
4. Create empty `index.css` with a comment placeholder

**Validation Test:**
- Folder structure matches tech-stack.md specification
- Project still compiles and runs without errors
- No unused boilerplate files remain

---

### Step 1.4: Set Up CSS Variables and Base Styles

**Task:** Define CSS custom properties for theming and establish base styles.

**Instructions:**
1. In `src/index.css`, define CSS variables for:
   - Table color (green felt): `--color-table`
   - Card back color (navy): `--color-card-back`
   - Gold accent: `--color-accent`
   - Text colors (primary, secondary)
   - Spacing scale (4px base unit)
   - Animation durations (fast, normal, slow)
2. Add CSS reset (box-sizing, margin/padding reset)
3. Set body background to table color
4. Set default font family to system sans-serif

**Validation Test:**
- Page background displays as green felt color
- CSS variables are accessible (inspect in browser DevTools)
- No default browser margins visible

**📝 Documentation Checkpoint:** Update `progress.md` with completed steps. Update `architecture.md` with project structure and configuration.

---

## Phase 2: Core Game Types and Constants

### Step 2.1: Define Card Types

**Task:** Create TypeScript types for cards, suits, and values.

**Instructions:**
1. Create `src/game/types.ts`
2. Define a `Suit` type as a union of four literal strings: `'coins'`, `'cups'`, `'swords'`, `'clubs'`
3. Define a `CardValue` type as numbers 1 through 10
4. Define a `Card` interface with properties:
   - `suit`: Suit
   - `value`: CardValue
   - `id`: string (unique identifier)
5. Export all types

**Validation Test:**
- TypeScript compiles without errors
- Create a test card object in a temporary file—IDE shows autocomplete for suit and value
- Assigning invalid suit (e.g., `'hearts'`) causes TypeScript error

---

### Step 2.2: Define Game State Types

**Task:** Create TypeScript types for the complete game state.

**Instructions:**
1. In `src/game/types.ts`, add:
2. Define `PlayerId` type as `'human'` | `'cpu'`
3. Define `GameStatus` type as `'idle'` | `'dealing'` | `'playing'` | `'roundEnd'` | `'gameEnd'`
4. Define `PlayerState` interface with:
   - `hand`: array of Cards
   - `captured`: array of Cards
   - `scoppiCount`: number (scopas this round)
5. Define `RoundState` interface with:
   - `deck`: array of Cards
   - `table`: array of Cards
   - `currentPlayer`: PlayerId
   - `dealer`: PlayerId
   - `lastCapture`: PlayerId or null
6. Define `GameState` interface with:
   - `status`: GameStatus
   - `round`: RoundState
   - `players`: object mapping PlayerId to PlayerState
   - `scores`: object mapping PlayerId to number (cumulative scores)
   - `roundNumber`: number
   - `targetScore`: number

**Validation Test:**
- TypeScript compiles without errors
- All type definitions are exported
- Create a mock GameState object—TypeScript validates all nested properties

---

### Step 2.3: Define Move Types

**Task:** Create types for player moves and move history.

**Instructions:**
1. In `src/game/types.ts`, add:
2. Define `Move` interface with:
   - `player`: PlayerId
   - `cardPlayed`: Card
   - `capturedCards`: array of Cards (empty if placing)
   - `isScopa`: boolean
3. Define `MoveType` as `'capture'` | `'place'`

**Validation Test:**
- TypeScript compiles without errors
- A Move with empty `capturedCards` array is valid (represents placing a card)
- A Move with non-empty `capturedCards` and `isScopa: true` is valid

---

### Step 2.4: Define Game Constants

**Task:** Create constants for card values, prime scoring, and game rules.

**Instructions:**
1. Create `src/game/constants.ts`
2. Define `SUITS` as a readonly array of all four suits
3. Define `CARD_VALUES` as a readonly array of numbers 1-10
4. Define `PRIME_VALUES` as a readonly object mapping card values to their prime scores:
   - 7 → 21, 6 → 18, 1 (Ace) → 16, 5 → 15, 4 → 14, 3 → 13, 2 → 12, 8/9/10 → 10
5. Define `DEFAULT_TARGET_SCORE` as 11
6. Define `CARDS_PER_HAND` as 3
7. Define `INITIAL_TABLE_CARDS` as 4

**Validation Test:**
- Constants are exported and accessible
- `PRIME_VALUES[7]` equals 21
- `PRIME_VALUES[10]` equals 10
- `SUITS.length` equals 4

---

## Phase 3: Deck Management

### Step 3.1: Implement Deck Creation

**Task:** Create a function that generates a full 40-card Italian deck.

**Instructions:**
1. Create `src/game/deck.ts`
2. Implement `createDeck()` function that:
   - Iterates over all suits and values (1-10)
   - Creates a Card object for each combination
   - Generates unique ID using **required format**: `'{suit}-{value}'` (e.g., `'coins-7'`, `'swords-1'`)
   - Returns array of 40 cards

**Validation Test:**
- `createDeck()` returns exactly 40 cards
- All cards have unique IDs
- There are exactly 10 cards of each suit
- There are exactly 4 cards of each value
- The 7 of coins has ID exactly `'coins-7'`
- All IDs follow the format `'{suit}-{value}'` where suit is one of: coins, cups, swords, clubs

---

### Step 3.2: Implement Deck Shuffling

**Task:** Create a function to shuffle a deck using Fisher-Yates algorithm.

**Instructions:**
1. In `src/game/deck.ts`, implement `shuffleDeck(deck: Card[]): Card[]`
2. Use Fisher-Yates (Knuth) shuffle algorithm
3. Return a new shuffled array (do not mutate input)
4. Ensure cryptographically unnecessary but statistically random results

**Validation Test:**
- Shuffled deck contains same 40 cards as original
- Shuffled deck is in different order than original (run multiple times to confirm randomness)
- Original deck array is not mutated
- Shuffle two decks—they produce different orderings

---

### Step 3.3: Implement Card Dealing

**Task:** Create a function to deal cards from deck to hands and table.

**Instructions:**
1. In `src/game/deck.ts`, implement `dealCards(deck: Card[], count: number): { dealt: Card[], remaining: Card[] }`
2. Remove `count` cards from the top of the deck
3. Return both the dealt cards and the remaining deck
4. Handle edge case: if deck has fewer cards than requested, deal what's available

**Validation Test:**
- Dealing 3 cards from 40-card deck returns 3 dealt cards and 37 remaining
- Dealt cards are removed from remaining deck
- Dealing from empty deck returns empty dealt array
- Original deck is not mutated

---

### Step 3.4: Implement Initial Deal Validation

**Task:** Create a function to check if initial table cards are valid (not 3+ kings).

**Instructions:**
1. In `src/game/deck.ts`, implement `isValidInitialDeal(tableCards: Card[]): boolean`
2. Count cards with value 10 (kings)
3. Return false if 3 or more kings, true otherwise

**Validation Test:**
- 4 random non-king cards → returns true
- 2 kings and 2 other cards → returns true
- 3 kings and 1 other card → returns false
- 4 kings → returns false

---

## Phase 4: Game Rules Engine

### Step 4.1: Implement Single Card Capture Detection

**Task:** Create a function to find all table cards that match a played card's value.

**Instructions:**
1. Create `src/game/rules.ts`
2. Implement `findSingleCaptures(playedCard: Card, tableCards: Card[]): Card[]`
3. Search table for all cards with the same value as played card
4. Return array of matching cards (empty if none found)
5. When multiple cards match, player must choose one (handled in Step 4.3)

**Validation Test:**
- Playing a 7 with a 7 on table → returns [7]
- Playing a 7 with no 7 on table → returns []
- Playing a 5 with multiple cards but no 5 → returns []
- Playing a King (10) with a King on table → returns [King]
- Playing a 5 with 5♦ and 5♠ on table → returns [5♦, 5♠] (same rank, different suits)

---

### Step 4.2: Implement Sum Capture Detection

**Task:** Create a function to find all combinations of table cards that sum to a played card's value.

**Instructions:**
1. In `src/game/rules.ts`, implement `findSumCaptures(playedCard: Card, tableCards: Card[]): Card[][]`
2. Find all subsets of table cards whose values sum to the played card's value
3. Return array of all valid capture combinations
4. Each combination should have 2 or more cards
5. Use recursive or iterative subset generation

**Validation Test:**
- Playing 7 on table with [3, 4, 2, 5] → returns [[3,4], [2,5]] (all valid sums to 7)
- Playing 6 on table with [1, 2, 3] → returns [[1,2,3]] (only valid combination)
- Playing 2 on table with [5, 6, 7] → returns empty array (no valid sum)
- Playing 10 on table with [1, 2, 3, 4] → returns [[1,2,3,4]] (exactly sums to 10)

---

### Step 4.3: Implement Valid Moves Generator

**Task:** Create a function that returns all valid moves for a player's card.

**Instructions:**
1. In `src/game/rules.ts`, implement `getValidMoves(card: Card, tableCards: Card[]): Move[]`
2. First check for single card captures (this takes priority per rules)
3. If single capture(s) exist, return only those captures (mandatory single-card priority rule)
4. If multiple single cards match (same rank, different suits), return one move per matching card (player chooses)
5. If no single capture, find all sum captures
6. If no captures possible, return a "place" move (empty captured cards)
7. Set `isScopa` to true if capture would clear the table

**Validation Test:**
- Card matching single table card → returns exactly one capture move
- Card matching both single card AND a sum → returns only single card capture (priority rule)
- Card matching two table cards of same rank (e.g., 5♦ and 5♠) → returns two capture moves (one per card, player chooses)
- Card matching multiple sums but no single → returns all sum capture options
- Card with no possible captures → returns one place move with empty captures
- Capture that clears table → move has `isScopa: true`

---

### Step 4.4: Implement Move Validation

**Task:** Create a function to validate if a proposed move is legal.

**Instructions:**
1. In `src/game/rules.ts`, implement `isValidMove(move: Move, hand: Card[], tableCards: Card[]): boolean`
2. Check that the played card is in the player's hand
3. Check that all captured cards are on the table
4. Check that capture values sum correctly (or single match)
5. Check that mandatory capture rule is followed (can't place if capture is possible)

**Validation Test:**
- Valid capture move → returns true
- Move with card not in hand → returns false
- Move capturing cards not on table → returns false
- Place move when capture was possible → returns false
- Valid place move when no capture possible → returns true

---

### Step 4.5: Implement Move Execution

**Task:** Create a function that applies a move to the game state.

**Instructions:**
1. In `src/game/rules.ts`, implement `executeMove(state: GameState, move: Move): GameState`
2. Remove played card from player's hand
3. Remove captured cards from table (if any)
4. If placing, add played card to table
5. If capturing, add played card and captured cards to player's captured pile
6. If scopa, increment player's scoppa count
7. Update `lastCapture` if a capture occurred
8. Return new state (do not mutate input)

**Validation Test:**
- After capture: player's hand reduced by 1, table reduced by captured count, captured pile increased
- After place: player's hand reduced by 1, table increased by 1
- Scopa move: player's scoppa count incremented
- Original state object is not mutated (compare object references)

---

## Phase 5: Scoring System

### Step 5.1: Implement Card Count Scoring

**Task:** Create a function to determine who wins the "most cards" point.

**Instructions:**
1. Create `src/game/scoring.ts`
2. Implement `scoreCards(humanCaptured: Card[], cpuCaptured: Card[]): { human: number, cpu: number }`
3. Player with more cards gets 1 point
4. If tied, neither gets a point (both return 0)

**Validation Test:**
- Human has 21 cards, CPU has 19 → human: 1, cpu: 0
- Human has 20, CPU has 20 → human: 0, cpu: 0
- Human has 18, CPU has 22 → human: 0, cpu: 1

---

### Step 5.2: Implement Coins Count Scoring

**Task:** Create a function to determine who wins the "most coins" point.

**Instructions:**
1. In `src/game/scoring.ts`, implement `scoreCoins(humanCaptured: Card[], cpuCaptured: Card[]): { human: number, cpu: number }`
2. Count cards with suit 'coins' for each player
3. Player with more coins gets 1 point
4. If tied, neither gets a point

**Validation Test:**
- Human has 6 coins, CPU has 4 → human: 1, cpu: 0
- Both have 5 coins → human: 0, cpu: 0
- Human has 3 coins, CPU has 7 → human: 0, cpu: 1

---

### Step 5.3: Implement Sette Bello Scoring

**Task:** Create a function to determine who captured the 7 of coins.

**Instructions:**
1. In `src/game/scoring.ts`, implement `scoreSetteBello(humanCaptured: Card[], cpuCaptured: Card[]): { human: number, cpu: number }`
2. Check which player's captured pile contains the 7 of coins
3. That player gets 1 point

**Validation Test:**
- Human has 7 of coins → human: 1, cpu: 0
- CPU has 7 of coins → human: 0, cpu: 1
- Function correctly identifies card by suit AND value

---

### Step 5.4: Implement Prime Calculation

**Task:** Create a function to calculate a player's prime score.

**Instructions:**
1. In `src/game/scoring.ts`, implement `calculatePrime(captured: Card[]): number | null`
2. For each suit, find the card with highest prime value (using PRIME_VALUES constant)
3. If player has no cards in any suit, return null (cannot compete for prime)
4. Sum the four highest prime values (one per suit)
5. Return the total

**Validation Test:**
- Player with all four 7s → returns 84 (21 × 4)
- Player with 7, 7, 7, 6 (one suit has 6 instead) → returns 81 (21×3 + 18)
- Player missing entire suit → returns null
- Player with only face cards in one suit → that suit contributes 10

---

### Step 5.5: Implement Prime Scoring

**Task:** Create a function to determine who wins the prime point.

**Instructions:**
1. In `src/game/scoring.ts`, implement `scorePrime(humanCaptured: Card[], cpuCaptured: Card[]): { human: number, cpu: number }`
2. Calculate prime for both players
3. If either has null prime, the other wins (if both null, neither wins)
4. Higher prime wins 1 point
5. If tied, neither gets a point

**Validation Test:**
- Human prime 72, CPU prime 68 → human: 1, cpu: 0
- Both have prime 70 → human: 0, cpu: 0
- Human has null prime, CPU has 65 → human: 0, cpu: 1
- Both have null prime → human: 0, cpu: 0

---

### Step 5.6: Implement Round Scoring

**Task:** Create a master function that calculates all round points.

**Instructions:**
1. In `src/game/scoring.ts`, implement `calculateRoundScore(state: GameState): { human: RoundScore, cpu: RoundScore }`
2. Define `RoundScore` interface with: cards, coins, setteBello, prime, scopas, total
3. Call all individual scoring functions
4. Add scopa counts from player state
5. Sum all points for total

**Validation Test:**
- Function returns complete breakdown for both players
- All point categories are numbers (not undefined)
- Totals equal sum of individual categories
- Scopa points correctly pulled from player state

**📝 Documentation Checkpoint:** Update `progress.md` with completed steps. Update `architecture.md` with game engine architecture (types, rules, scoring).

---

## Phase 6: Game State Management

### Step 6.1: Create Game Reducer Actions

**Task:** Define action types for game state transitions.

**Instructions:**
1. Create `src/game/reducer.ts`
2. Define action types as discriminated union:
   - `START_GAME`: Initialize new game with target score
   - `DEAL_CARDS`: Deal cards to players and/or table
   - `PLAY_CARD`: Execute a player move
   - `END_ROUND`: Calculate scores and check for winner
   - `NEXT_ROUND`: Set up for new round
   - `RESET_GAME`: Return to initial state
3. Each action type should include necessary payload

**Validation Test:**
- TypeScript correctly types each action's payload
- Action creators are type-safe (wrong payload type causes error)
- All game state transitions have corresponding action

---

### Step 6.2: Implement Initial State Creator

**Task:** Create function to generate the initial game state.

**Instructions:**
1. In `src/game/reducer.ts`, implement `createInitialState(targetScore: number): GameState`
2. Set status to 'idle'
3. Initialize empty hands and captured piles
4. Set scores to 0
5. Initialize empty deck and table
6. Set round number to 1

**Validation Test:**
- Returns valid GameState object
- Both players have empty hands and captured piles
- Scores are both 0
- Status is 'idle'
- Target score matches parameter

---

### Step 6.3: Implement Game Start Logic

**Task:** Implement reducer logic for starting a new game.

**Instructions:**
1. Handle `START_GAME` action in reducer
2. Create and shuffle deck
3. Deal 3 cards to each player
4. Deal 4 cards to table
5. Validate initial deal (re-deal if 3+ kings)
6. Randomly select first dealer
7. Set current player to dealer's opponent (right of dealer)
8. Set status to 'playing'

**Validation Test:**
- After START_GAME: both players have 3 cards
- Table has 4 cards
- Deck has 30 cards remaining (40 - 6 hands - 4 table = 30)
- Status is 'playing'
- Table never has 3+ kings (may need to verify re-deal logic)

---

### Step 6.4: Implement Play Card Logic

**Task:** Implement reducer logic for playing a card.

**Instructions:**
1. Handle `PLAY_CARD` action in reducer
2. Validate it's the current player's turn
3. Validate move is legal using rules engine
4. Execute the move using rules engine
5. Switch current player to opponent
6. Check if hands are empty and need re-deal
7. Check if round is over (deck empty and hands empty)

**Validation Test:**
- After PLAY_CARD: current player switches
- Played card removed from hand
- Captured cards removed from table (or card added to table if place)
- Invalid move throws error or returns unchanged state

---

### Step 6.5: Implement Re-deal Logic

**Task:** Implement logic to deal new hands when both players' hands are empty.

**Instructions:**
1. In reducer, after PLAY_CARD, check if both hands are empty
2. If deck has cards remaining, deal 3 cards to each player
3. If deck is empty and hands are empty, trigger round end

**Validation Test:**
- When both hands empty and deck has cards: new hands dealt (3 each)
- When both hands empty and deck empty: status changes to 'roundEnd'
- Re-deal does not add cards to table

---

### Step 6.6: Implement Round End Logic

**Task:** Implement reducer logic for ending a round.

**Instructions:**
1. Handle `END_ROUND` action in reducer
2. Award remaining table cards to last capture player
3. Calculate round scores
4. Add round scores to cumulative scores
5. Check if any player reached target score
6. Set status to 'roundEnd' or 'gameEnd' accordingly

**Validation Test:**
- Remaining table cards go to last capture player
- Scores correctly accumulated
- Game ends when either player reaches target
- If both reach target, higher score wins
- Status correctly set based on game end condition

---

### Step 6.7: Implement Next Round Logic

**Task:** Implement reducer logic for starting a new round.

**Instructions:**
1. Handle `NEXT_ROUND` action in reducer
2. Reset hands and captured piles
3. Reset scopa counts
4. Rotate dealer to other player
5. Create and shuffle new deck
6. Deal new hands and table cards
7. Increment round number
8. Set status to 'playing'

**Validation Test:**
- Dealer rotates from previous round
- Scores preserved from previous round
- New full deck dealt
- Round number incremented
- Status is 'playing'

---

### Step 6.8: Create useGame Hook

**Task:** Create a React hook that manages game state and exposes actions.

**Instructions:**
1. Create `src/hooks/useGame.ts`
2. Use `useReducer` with game reducer and initial state
3. Expose state and action dispatcher functions:
   - `startGame(targetScore)`
   - `playCard(move)`
   - `endRound()`
   - `nextRound()`
   - `resetGame()`
4. Wrap dispatchers with `useCallback` for stable references

**Validation Test:**
- Hook returns current state and all action functions
- Calling `startGame()` updates state correctly
- State updates trigger re-render
- Action functions are stable (don't change between renders)

---

## Phase 7: Basic UI Components

### Step 7.1: Create Card Component

**Task:** Create a component that displays a single card (face up or face down).

**Instructions:**
1. Create `src/components/Card/Card.tsx`
2. Accept props: `card: Card | null`, `faceDown: boolean`, `onClick`, `selected`, `highlighted`
3. If `faceDown` or `card` is null, render card back
4. Otherwise, render card face showing suit and value
5. Use CSS modules for styling
6. Display value in corner(s) and suit symbol in center
7. Apply visual states for selected/highlighted

**Validation Test:**
- Card renders without errors
- Face-down card shows back design
- Face-up card shows correct suit and value
- Clicking card triggers onClick callback
- Selected state visually distinct
- Highlighted state visually distinct

---

### Step 7.2: Create Card Back Design

**Task:** Design and implement the card back appearance.

**Instructions:**
1. In Card component styles, create card back design
2. Use CSS patterns or gradients (no external images required for MVP)
3. Design should be navy/dark blue with subtle pattern
4. Maintain consistent card dimensions (2:3 ratio recommended)

**Validation Test:**
- Card back is visually distinct from card faces
- Pattern/design is centered and doesn't overflow
- Looks good at various sizes

---

### Step 7.3: Create Suit Symbols

**Task:** Create visual representations for each suit.

**Instructions:**
1. Create suit symbol components or use Unicode symbols:
   - Coins: 🪙 or ◉ or custom SVG
   - Cups: 🏆 or custom SVG
   - Swords: ⚔ or custom SVG  
   - Clubs: ♣ or custom SVG
2. Apply suit-specific colors (coins=gold, cups=blue, swords=gray, clubs=green)
3. Ensure symbols scale appropriately

**Validation Test:**
- All four suits render distinctly
- Symbols are recognizable at card size
- Colors match traditional Italian deck aesthetics

---

### Step 7.4: Create PlayerHand Component

**Task:** Create a component that displays a player's hand of cards.

**Instructions:**
1. Create `src/components/Table/PlayerHand.tsx`
2. Accept props: `cards: Card[]`, `isHuman: boolean`, `onCardClick`, `selectedCard`, `disabled`
3. Render cards in a horizontal row with slight overlap
4. Human hand: cards face up, clickable
5. CPU hand: cards face down, not clickable
6. Highlight selected card
7. Disable interaction when not player's turn

**Validation Test:**
- Human hand shows face-up cards
- CPU hand shows face-down cards
- Clicking human card calls onCardClick with card
- Selected card is visually elevated/highlighted
- When disabled, clicks do nothing

---

### Step 7.5: Create TableCards Component

**Task:** Create a component that displays cards on the table.

**Instructions:**
1. Create `src/components/Table/TableCards.tsx`
2. Accept props: `cards: Card[]`, `highlightedCards: Card[]`, `onCardClick`, `selectable`
3. Display cards spread in center of table area
4. Highlighted cards have visual indicator (glow/border)
5. When selectable, clicking card calls onCardClick

**Validation Test:**
- All table cards render face-up
- Cards are spaced/arranged readably
- Highlighted cards visually distinct
- Click events fire when selectable
- Empty table shows appropriate empty state

---

### Step 7.6: Create CapturedPile Component

**Task:** Create a component showing a player's captured cards stack.

**Instructions:**
1. Create `src/components/Table/CapturedPile.tsx`
2. Accept props: `cards: Card[]`, `scopaCount: number`, `player: PlayerId`
3. Show cards as a stack (only top few visible)
4. Display card count badge
5. Display scopa indicators (one marker per scopa)

**Validation Test:**
- Pile renders even when empty
- Card count displays correctly
- Scopa markers visible and correct count
- Pile doesn't expand infinitely (contained height)

---

### Step 7.7: Create ScoreBoard Component

**Task:** Create a component displaying current game scores.

**Instructions:**
1. Create `src/components/UI/ScoreBoard.tsx`
2. Accept props: `humanScore: number`, `cpuScore: number`, `roundNumber: number`, `targetScore: number`
3. Display both players' cumulative scores prominently
4. Show current round number
5. Show target score
6. Indicate whose turn it is (optional visual)

**Validation Test:**
- Scores display correctly
- Round number displays
- Target score visible
- Layout is clear and readable

---

### Step 7.8: Create GameTable Layout Component

**Task:** Create the main game layout combining all table elements.

**Instructions:**
1. Create `src/components/Layout/GameLayout.tsx`
2. Arrange components in correct positions:
   - CPU hand at top
   - Table cards in center
   - Human hand at bottom
   - Score board in corner
   - Captured piles on sides
3. Use CSS Grid or Flexbox for layout
4. Ensure responsive scaling

**Validation Test:**
- All areas render in correct positions
- Layout doesn't break at different viewport sizes
- Visual hierarchy is clear (table center is focus)
- Components don't overlap incorrectly

---

## Phase 8: Game Flow Integration

### Step 8.1: Wire Up Human Player Input

**Task:** Connect human player card selection to game state.

**Instructions:**
1. In main App or Game component, use the `useGame` hook
2. Track selected card in local state
3. When human clicks card in hand, select it
4. When card selected, calculate and show valid captures on table
5. When human clicks table card(s), execute the capture move
6. For placing cards (when no capture possible):
   - Double-click hand card to place it directly, OR
   - Show "Place Card" button when a non-capturing card is selected
7. Disable place actions when capture is possible (mandatory capture rule)

**Validation Test:**
- Clicking hand card selects it
- Valid capture targets highlight on table
- Clicking valid targets executes capture
- Invalid actions are prevented
- Double-clicking non-capturing card places it on table
- "Place Card" button appears when non-capturing card selected
- Place actions blocked when capture is available

---

### Step 8.2: Implement Move Confirmation UX

**Task:** Create clear user flow for confirming multi-card captures.

**Instructions:**
1. When multiple sum captures are possible, show selection UI
2. Allow human to click multiple table cards to build capture set
3. Display running sum of selected cards
4. Show confirm button when sum matches played card
5. Allow deselection by clicking selected card again
6. Cancel selection by clicking different hand card

**Validation Test:**
- Multi-card selection works correctly
- Running sum displays accurately
- Confirm only enabled when sum is correct
- Can cancel and reselect
- Single-card capture still works without extra confirmation

---

### Step 8.3: Implement CPU Turn Execution

**Task:** Make CPU play automatically when it's their turn.

**Instructions:**
1. Detect when current player is CPU
2. Add artificial delay (500-1000ms) for UX
3. Get valid moves for a random card in CPU hand
4. Select a random valid move (for MVP random AI)
5. Execute the move via game state
6. Switch turn back to human

**Validation Test:**
- CPU plays automatically without user action
- Delay is noticeable (feels like "thinking")
- CPU always makes valid moves
- Turn switches to human after CPU plays
- Game doesn't freeze during CPU turn

---

### Step 8.4: Implement Round End Screen

**Task:** Create UI shown at end of each round with score breakdown.

**Instructions:**
1. Create `src/components/UI/RoundEndScreen.tsx`
2. Show when game status is 'roundEnd'
3. Display score breakdown: cards, coins, sette bello, prime, scopas
4. Show who won each category
5. Display round points earned by each player
6. Show updated cumulative scores
7. Include "Next Round" button

**Validation Test:**
- Screen appears at round end
- All scoring categories displayed
- Points calculated correctly match game state
- Next Round button starts new round
- Cumulative scores shown correctly

---

### Step 8.5: Implement Game End Screen

**Task:** Create UI shown when game ends with final results.

**Instructions:**
1. Create `src/components/UI/GameEndScreen.tsx`
2. Show when game status is 'gameEnd'
3. Display winner announcement (or tie)
4. Show final scores
5. Show total rounds played
6. Include "Play Again" button that resets game

**Validation Test:**
- Screen appears when game ends
- Correct winner announced
- Final scores accurate
- Play Again resets to new game
- UI is celebratory for winner

---

### Step 8.6: Implement New Game Setup

**Task:** Create initial screen to start a new game.

**Instructions:**
1. Create `src/components/UI/StartScreen.tsx`
2. Show when game status is 'idle'
3. Allow selection of target score (11, 16, 21)
4. Show "Start Game" button
5. Optionally show brief rules summary

**Validation Test:**
- Screen shows on initial load
- Target score selection works
- Start button begins game
- Selected target score is used in game

---

## Phase 9: Basic Animations

### Step 9.1: Add Card Deal Animation

**Task:** Animate cards sliding from deck to hands/table during deal.

**Instructions:**
1. Use Framer Motion's `motion.div` for Card component
2. Add `initial`, `animate`, and `transition` props
3. Cards start from deck position (top center)
4. Animate to final position with ease-out timing
5. Stagger animation for sequential dealing effect
6. Duration approximately 300ms per card

**Validation Test:**
- Cards visibly animate from deck to positions
- Animation is smooth (no jank)
- Stagger creates sequential dealing feel
- Animation completes before input is enabled

---

### Step 9.2: Add Card Play Animation

**Task:** Animate card moving from hand to table when played.

**Instructions:**
1. When card is played, animate from hand position to table
2. Use Framer Motion's `AnimatePresence` for exit animation from hand
3. Card scales slightly larger mid-flight
4. Duration approximately 400ms

**Validation Test:**
- Played card animates to table smoothly
- Card doesn't teleport/pop
- Animation timing feels natural
- Works for both human and CPU plays

---

### Step 9.3: Add Capture Animation

**Task:** Animate captured cards moving to player's pile.

**Instructions:**
1. When capture occurs, animate captured cards gathering together
2. Then animate stack moving to captured pile
3. Add subtle rotation during movement
4. Duration approximately 600ms total

**Validation Test:**
- Captured cards visibly gather
- Stack moves to correct player's pile
- Animation is satisfying to watch
- Works for single and multi-card captures

---

### Step 9.4: Add Scopa Celebration Animation

**Task:** Create special animation when scopa is scored.

**Instructions:**
1. Detect when a scopa occurs
2. Add flash/glow effect across table
3. Display "SCOPA!" text briefly
4. Add particle or sparkle effect (optional)
5. Duration approximately 1000ms

**Validation Test:**
- Scopa animation is noticeably special
- Text "SCOPA!" appears
- Animation doesn't block gameplay
- Feels rewarding/celebratory

---

### Step 9.5: Add Turn Indicator Animation

**Task:** Create visual indicator for whose turn it is.

**Instructions:**
1. Highlight or glow current player's hand area
2. Subtle pulsing animation while waiting for input
3. Animation stops during card movement
4. Different indication for CPU (thinking indicator)

**Validation Test:**
- Clear which player's turn it is
- Human turn shows interactive state
- CPU turn shows thinking state
- Indicator updates when turn changes

---

## Phase 10: Settings and Polish

### Step 10.1: Implement Settings Storage

**Task:** Create utilities for saving/loading settings to localStorage.

**Instructions:**
1. Create `src/utils/storage.ts`
2. Implement `saveSettings(settings)` function
3. Implement `loadSettings()` function
4. Define settings schema: targetScore, animationSpeed, soundEnabled
5. Handle missing/corrupt data gracefully

**Validation Test:**
- Settings persist after page reload
- Corrupt localStorage doesn't crash app
- Missing settings return defaults
- Settings correctly loaded on mount

---

### Step 10.2: Create Settings Modal

**Task:** Create UI for adjusting game settings.

**Instructions:**
1. Create `src/components/UI/SettingsModal.tsx`
2. Add target score selector (11, 16, 21, 31)
3. Add animation speed toggle (slow, normal, fast)
4. Add sound toggle (on/off - prepare for future)
5. Save settings on change
6. Include close button

**Validation Test:**
- Modal opens/closes correctly
- Setting changes are saved
- Settings apply to game immediately where applicable
- Modal doesn't break game state

---

### Step 10.3: Add Game Controls

**Task:** Add UI buttons for game control actions.

**Instructions:**
1. Create `src/components/UI/GameControls.tsx`
2. Add "New Game" button (confirms if game in progress)
3. Add "Settings" button (opens settings modal)
4. Position controls unobtrusively
5. Disable during animations

**Validation Test:**
- Buttons are accessible during play
- New Game prompts for confirmation
- Settings opens modal
- Controls don't interfere with gameplay

---

### Step 10.4: Add Loading States

**Task:** Add loading indicators for async operations.

**Instructions:**
1. Show loading state during initial app mount
2. Show dealing indicator during deal animations
3. Show thinking indicator during CPU turn
4. Prevent input during loading states

**Validation Test:**
- Loading indicator shows briefly on start
- Dealing shows appropriate state
- CPU thinking is indicated
- No double-inputs possible during transitions

---

### Step 10.5: Add Error Handling

**Task:** Implement error boundaries and fallbacks.

**Instructions:**
1. Add React Error Boundary around game components
2. Show friendly error message if game crashes
3. Offer reset button in error state
4. Log errors to console for debugging

**Validation Test:**
- Intentional error triggers boundary
- Error message is user-friendly
- Reset recovers from error
- Game state corruption doesn't crash app

---

### Step 10.6: Final Visual Polish

**Task:** Refine all visual elements for cohesive appearance.

**Instructions:**
1. Ensure consistent spacing throughout
2. Verify color palette applied correctly
3. Add subtle shadows for depth
4. Ensure text is readable at all sizes
5. Test on different screen sizes

**Validation Test:**
- No visual inconsistencies
- App looks polished and intentional
- Readable on mobile viewport
- Readable on large desktop viewport

**📝 Documentation Checkpoint:** Update `progress.md` marking MVP complete. Update `architecture.md` with final component structure, hooks, and any architectural notes.

---

## Validation Checklist

Before considering Phase 1 (MVP) complete, verify:

### Core Gameplay
- [ ] Full game can be played from start to finish
- [ ] All Scopa rules correctly implemented
- [ ] Scoring accurate for all categories
- [ ] Multiple rounds work correctly
- [ ] Game ends at target score

### User Interface
- [ ] All cards render correctly
- [ ] Table layout is clear
- [ ] Scores always visible
- [ ] Turn indicator works
- [ ] Round/game end screens appear

### Animations
- [ ] Cards animate smoothly
- [ ] No visual glitches
- [ ] Scopa celebration triggers
- [ ] Animations don't block gameplay

### Technical
- [ ] No TypeScript errors
- [ ] No console errors during play
- [ ] Settings persist
- [ ] Works in Chrome, Firefox, Safari
- [ ] Builds successfully for production

---

## Next Steps After MVP

Once base game is complete and validated:

1. Implement additional CPU difficulty levels (basic → advanced AI)
2. Add LLM API integration
3. Implement CPU vs CPU watch mode
4. Add sound effects
5. Enhance card graphics
6. Add statistics tracking
7. Implement simulation mode

---

*This implementation plan provides the foundation for a fully functional Scopa game. Each step builds incrementally toward the complete MVP.*
