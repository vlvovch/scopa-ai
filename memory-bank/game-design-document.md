# Scopa WebApp - Game Design Document

**Version:** 1.0  
**Last Updated:** December 2024  
**Project Codename:** *ScopaOnline*

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Game Overview](#2-game-overview)
3. [Game Rules](#3-game-rules)
4. [Technical Architecture](#4-technical-architecture)
5. [User Interface Design](#5-user-interface-design)
6. [Visual Design & Graphics](#6-visual-design--graphics)
7. [Animation System](#7-animation-system)
8. [AI Opponent System](#8-ai-opponent-system)
9. [Game Modes](#9-game-modes)
10. [Scoring & Statistics](#10-scoring--statistics)
11. [Settings & Configuration](#11-settings--configuration)
12. [Audio Design](#12-audio-design)
13. [Development Roadmap](#13-development-roadmap)
14. [Future Enhancements](#14-future-enhancements)

---

## 1. Executive Summary

### 1.1 Vision Statement

ScopaOnline is a web-based implementation of the classic Italian card game Scopa, featuring elegant graphics, smooth animations, and intelligent AI opponents ranging from beginner-friendly random play to advanced strategic AI powered by modern LLMs (Claude, ChatGPT, Gemini).

### 1.2 Key Features

- **Human vs CPU** gameplay with multiple difficulty levels
- **Human vs AI** gameplay using LLM APIs for intelligent opponents
- **CPU vs CPU** simulation mode for analysis and entertainment
- **Beautiful card graphics** with authentic Italian-style deck
- **Smooth animations** for card dealing, playing, and capturing
- **Real-time scoring display** with detailed breakdown
- **Statistical analysis** tools for batch simulations
- **Configurable game rules** (target score, deck style, variants)

### 1.3 Target Platforms

- Modern web browsers (Chrome, Firefox, Safari, Edge)
- Responsive design for desktop and tablet
- Mobile-friendly with touch controls

---

## 2. Game Overview

### 2.1 What is Scopa?

Scopa (Italian for "broom") is one of Italy's three major national card games. The name refers to "sweeping" all cards from the table, which awards bonus points. The game combines skill, strategy, and a touch of luck.

### 2.2 Player Count

- **Primary:** 2 players (Human vs Opponent)
- **Future:** 4 players (2v2 teams)

### 2.3 Objective

Players compete across multiple rounds to be the first to reach the target score (default: 11 points). Points are earned by:
- Capturing the most cards
- Capturing the most Coins/Denari cards
- Capturing the Seven of Coins (Sette Bello)
- Having the best "Prime" (Primiera)
- Sweeping the table (Scopa)

---

## 3. Game Rules

### 3.1 The Deck

A standard Italian 40-card deck consisting of four suits:

| Suit | Italian Name | Symbol |
|------|--------------|--------|
| Coins | Denari / Ori | 🪙 |
| Cups | Coppe | 🏆 |
| Swords | Spade | ⚔️ |
| Clubs | Bastoni | 🏑 |

Each suit contains cards ranked 1-7 plus three face cards:
- **Ace (Asso):** Value 1
- **2-7:** Face value
- **Knave/Jack (Fante):** Value 8
- **Knight/Queen (Cavallo/Donna):** Value 9
- **King (Re):** Value 10

### 3.2 Setup

1. Dealer is chosen (alternates each round)
2. Each player receives **3 cards**
3. **4 cards** are placed face-up on the table
4. If 3 or 4 Kings appear on the table, re-deal

### 3.3 Gameplay

Players take turns (starting with player to dealer's right). On each turn, a player **must** play one card and either:

#### A) Capture Cards
- **Single Match:** Play a card matching the value of one table card
- **Sum Match:** Play a card matching the sum of multiple table cards
- **Mandatory Capture:** If a card can capture, the player MUST capture
- **Single Card Priority:** If a card matches both a single card AND a sum, only the single card is captured

#### B) Place Card
- If no capture is possible, place the card face-up on the table

### 3.4 Scopa (Sweep)

When a player captures ALL cards from the table, they score a **Scopa** (1 bonus point). Exception: No scopa is awarded for clearing the table on the last play of a round.

### 3.5 Round End

1. Players receive 3 new cards after all hands are played
2. When the deck is exhausted and all cards played, the round ends
3. **Last capture rule:** Player who made the last capture takes all remaining table cards (no scopa awarded)

### 3.6 Scoring

Points are calculated at the end of each round:

| Category | Points | Condition |
|----------|--------|-----------|
| **Cards (Carte)** | 1 | Most cards captured (21+ for guaranteed point) |
| **Coins (Denari)** | 1 | Most Coins suit cards captured (6+ for guaranteed) |
| **Sette Bello** | 1 | Captured the 7 of Coins |
| **Prime (Primiera)** | 1 | Highest prime score (see below) |
| **Scopa** | 1 each | Each sweep during the round |

**Ties:** If players tie in cards or coins count, no point is awarded for that category.

### 3.7 Prime (Primiera) Calculation

Select the highest-value card from each suit using this scale:

| Card | Prime Value |
|------|-------------|
| Seven | 21 |
| Six | 18 |
| Ace | 16 |
| Five | 15 |
| Four | 14 |
| Three | 13 |
| Two | 12 |
| Face Cards (8,9,10) | 10 |

Sum the four best cards (one per suit). Highest total wins the Prime point.

**Note:** A player missing any suit cannot win Prime. The 7 of Coins is the most valuable card as it contributes to all four scoring categories.

### 3.8 Winning the Game

- First player to reach **11 points** (configurable) wins
- All points calculated only at round end
- If both players exceed target score simultaneously, higher score wins
- If still tied, play additional rounds until tie is broken

---

## 4. Technical Architecture

### 4.1 Technology Stack

```
Frontend:
├── Framework: React 18+ with TypeScript
├── State Management: Zustand or Redux Toolkit
├── Styling: Tailwind CSS + CSS Animations
├── Animation: Framer Motion / React Spring
├── Canvas/WebGL: Pixi.js (optional for advanced effects)
└── Build Tool: Vite

Backend (Optional - for AI APIs):
├── Runtime: Node.js / Edge Functions
├── API Routes: Next.js API or standalone Express
└── AI Integration: OpenAI, Anthropic, Google AI SDKs
```

### 4.2 Core Architecture

```
src/
├── components/
│   ├── Card/
│   │   ├── Card.tsx              # Card component with flip animation
│   │   ├── CardBack.tsx          # Card back design
│   │   └── CardFace.tsx          # Card face with suit/value
│   ├── Table/
│   │   ├── GameTable.tsx         # Main play area
│   │   ├── TableCards.tsx        # Cards on table
│   │   └── PlayerArea.tsx        # Player's hand area
│   ├── UI/
│   │   ├── ScoreBoard.tsx        # Current scores display
│   │   ├── DeckInfo.tsx          # Captured cards info
│   │   ├── GameControls.tsx      # Settings, new game, etc.
│   │   └── Modal.tsx             # Round end, game end screens
│   └── Animation/
│       ├── CardAnimation.tsx     # Card movement animations
│       └── ScopaAnimation.tsx    # Special sweep effect
├── game/
│   ├── engine/
│   │   ├── GameState.ts          # Core game state
│   │   ├── GameLogic.ts          # Rules and validation
│   │   ├── Scoring.ts            # Score calculation
│   │   └── Deck.ts               # Deck management
│   ├── ai/
│   │   ├── AIPlayer.ts           # Base AI interface
│   │   ├── RandomAI.ts           # Random valid moves
│   │   ├── BasicAI.ts            # Simple heuristics
│   │   ├── SmartAI.ts            # Advanced strategy
│   │   └── LLMPlayer.ts          # API-based AI (Claude, GPT, Gemini)
│   └── simulation/
│       ├── Simulator.ts          # Batch game simulation
│       └── Statistics.ts         # Statistical analysis
├── hooks/
│   ├── useGameState.ts           # Game state hook
│   ├── useAnimation.ts           # Animation controls
│   └── useAI.ts                  # AI opponent hook
├── types/
│   └── index.ts                  # TypeScript definitions
├── utils/
│   ├── cardUtils.ts              # Card helper functions
│   └── animationUtils.ts         # Animation helpers
└── assets/
    ├── cards/                    # Card images
    ├── sounds/                   # Sound effects
    └── backgrounds/              # Table textures
```

### 4.3 Game State Model

```typescript
interface GameState {
  // Game Configuration
  config: {
    targetScore: number;          // Default: 11
    deckStyle: 'neapolitan' | 'piacentine' | 'french';
    animationSpeed: 'slow' | 'normal' | 'fast';
    soundEnabled: boolean;
  };
  
  // Current Round State
  round: {
    number: number;
    deck: Card[];                 // Remaining cards in deck
    table: Card[];                // Cards on table
    currentPlayer: PlayerId;
    dealer: PlayerId;
    lastCapture: PlayerId | null;
    handsDealt: number;           // 0-6 (6 deals per round)
  };
  
  // Player States
  players: {
    [id: PlayerId]: {
      hand: Card[];               // Current hand (0-3 cards)
      captured: Card[];           // All captured cards this round
      scopas: number;             // Scopas scored this round
      totalScore: number;         // Cumulative game score
    };
  };
  
  // Game Progress
  status: 'setup' | 'playing' | 'roundEnd' | 'gameEnd';
  history: Move[];                // Move history for replay/undo
  winner: PlayerId | null;
}

interface Card {
  suit: 'coins' | 'cups' | 'swords' | 'clubs';
  value: number;                  // 1-10
  id: string;                     // Unique identifier
}

interface Move {
  player: PlayerId;
  cardPlayed: Card;
  cardsCapture: Card[];
  isScopa: boolean;
  timestamp: number;
}
```

---

## 5. User Interface Design

### 5.1 Main Game Screen Layout

```
┌─────────────────────────────────────────────────────────────┐
│  ┌─────────────────┐                    ┌─────────────────┐ │
│  │   OPPONENT      │     SCORE BOARD    │   DECK INFO     │ │
│  │   [? ? ?]       │    Player: 7       │   Cards: 23     │ │
│  │                 │    Opponent: 5     │   Coins: 4      │ │
│  └─────────────────┘    Round: 3        │   7-bello: ✓    │ │
│                                         └─────────────────┘ │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                                                         ││
│  │                    TABLE AREA                           ││
│  │                                                         ││
│  │              [3♦]  [7♠]  [K♣]  [2♥]                    ││
│  │                                                         ││
│  │                                                         ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                   YOUR HAND                             ││
│  │                                                         ││
│  │            [5♦]      [9♠]      [4♣]                    ││
│  │                                                         ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  [Settings]  [New Game]  [History]              [Hint]     │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Score Board Panel

Displays real-time information:
- Current round number
- Both players' cumulative scores
- Current round scoring breakdown:
  - Cards count (with progress bar)
  - Coins count (with progress bar)
  - Sette Bello indicator (who has it)
  - Prime preview (current best cards per suit)
  - Scopas this round

### 5.3 Deck Info Panel (Toggleable)

Shows captured pile analysis:
- Total cards captured
- Cards per suit breakdown
- Face cards captured
- Prime calculation preview
- Visual icons for key cards (7s, aces)

### 5.4 Interaction Design

#### Card Selection
1. Click/tap a card in hand to select it (highlight effect)
2. Valid capture targets on table highlight automatically
3. Click table card(s) to specify capture OR
4. Click empty table area to place card (if no capture possible)

#### Capture Confirmation
- Single card capture: Auto-confirm
- Multi-card capture: Show sum, require confirmation click
- Ambiguous captures: Show options panel

### 5.5 Mobile Layout

```
┌────────────────────┐
│  Opponent: 5  │ ≡  │
├────────────────────┤
│    [? ? ?]         │
├────────────────────┤
│                    │
│   TABLE CARDS      │
│  [3♦] [7♠] [K♣]   │
│      [2♥]         │
│                    │
├────────────────────┤
│   YOUR HAND        │
│ [5♦] [9♠] [4♣]    │
├────────────────────┤
│ You: 7  │ Rd: 3    │
└────────────────────┘
```

---

## 6. Visual Design & Graphics

### 6.1 Art Style

**Theme:** Classic Italian card game elegance with modern polish

- **Color Palette:**
  - Table felt: Deep emerald green (#1B5E20) or burgundy (#6B2737)
  - Gold accents: #D4AF37
  - Card backs: Navy blue with gold pattern
  - UI elements: Warm wood tones

- **Typography:**
  - Headers: Serif font (Playfair Display)
  - Body/UI: Clean sans-serif (Inter)
  - Card values: Traditional card font

### 6.2 Card Design Options

#### Option A: Traditional Italian (Neapolitan)
- Authentic historical artwork
- Hand-drawn style suits
- Rich, detailed illustrations

#### Option B: Modern Minimalist
- Clean, flat design
- Bold suit symbols
- High contrast for readability

#### Option C: Hybrid
- Traditional face cards
- Simplified pip cards
- Best of both worlds

### 6.3 Card Assets

Each card requires:
- Front face image (40 unique cards)
- Card back design (1 image)
- Recommended size: 140×210 px (2:3 ratio)
- Formats: SVG preferred, PNG fallback

### 6.4 UI Elements

- Wooden frame borders
- Embossed button styles
- Subtle drop shadows
- Cloth/felt textures
- Gold foil accents for scores

---

## 7. Animation System

### 7.1 Core Animations

#### Card Dealing Animation
```
Duration: 300ms per card
Easing: ease-out
Sequence:
1. Card appears at deck position
2. Flips from back to front (for player cards)
3. Slides to destination with slight arc
4. Subtle bounce on arrival
```

#### Card Playing Animation
```
Duration: 400ms
Easing: ease-in-out
Sequence:
1. Card lifts from hand (scale 1.1)
2. Travels to table position
3. Lands with soft shadow expansion
```

#### Capture Animation
```
Duration: 600ms total
Easing: ease-in-out
Sequence:
1. Played card lands on table (200ms)
2. Captured cards highlight briefly (100ms)
3. All captured cards gather (200ms)
4. Stack slides to player's pile (100ms)
```

#### Scopa Animation (Special)
```
Duration: 1000ms
Effects:
1. Flash effect across table
2. "SCOPA!" text appears with particle burst
3. Cards sweep toward player with trail effect
4. Score counter animates +1
```

### 7.2 Micro-Animations

- Card hover: Subtle lift (translateY: -5px)
- Card selection: Glow border + scale 1.05
- Valid target highlight: Pulsing border
- Score change: Number flip animation
- Turn indicator: Glowing player area

### 7.3 Animation Settings

Users can adjust:
- **Speed:** Slow (1.5x), Normal (1x), Fast (0.5x), Instant (0x)
- **Effects:** Full, Reduced, None
- **Accessibility:** Respect prefers-reduced-motion

---

## 8. AI Opponent System

### 8.1 CPU Difficulty Levels

#### Level 1: Monkey (Random)
```typescript
class RandomAI implements AIPlayer {
  selectMove(state: GameState): Move {
    const validMoves = getValidMoves(state);
    return randomChoice(validMoves);
  }
}
```
- Selects any valid move randomly
- No strategy whatsoever
- Good for beginners learning the game

#### Level 2: Beginner
- Prefers captures over placing
- Targets Coins suit when possible
- Takes Sette Bello if available
- No multi-card sum strategy

#### Level 3: Intermediate
- Evaluates capture value (more cards = better)
- Tracks coins count
- Avoids leaving easy captures for opponent
- Basic prime awareness (prefers 7s and 6s)

#### Level 4: Advanced
```typescript
class AdvancedAI implements AIPlayer {
  selectMove(state: GameState): Move {
    const validMoves = getValidMoves(state);
    return validMoves
      .map(move => ({
        move,
        score: this.evaluateMove(move, state)
      }))
      .sort((a, b) => b.score - a.score)[0].move;
  }
  
  evaluateMove(move: Move, state: GameState): number {
    let score = 0;
    
    // Capture value
    score += move.capturedCards.length * 10;
    
    // Coins priority
    score += move.capturedCards.filter(c => c.suit === 'coins').length * 15;
    
    // Sette bello
    if (hasSetteBello(move.capturedCards)) score += 50;
    
    // Prime cards (7s worth most)
    score += move.capturedCards.reduce((sum, c) => sum + getPrimeValue(c), 0);
    
    // Scopa bonus
    if (move.isScopa) score += 30;
    
    // Avoid leaving good captures (look-ahead)
    score -= this.evaluateTableForOpponent(state, move);
    
    return score;
  }
}
```

#### Level 5: Expert
- Full minimax with alpha-beta pruning (2-3 move lookahead)
- Monte Carlo simulations for uncertain states
- Tracks all cards played
- Counts opponent's probable holdings
- End-game optimization

### 8.2 LLM-Based AI Players

#### Architecture
```typescript
interface LLMPlayer extends AIPlayer {
  provider: 'anthropic' | 'openai' | 'google';
  model: string;
  apiKey: string;
}

interface LLMAIContext extends AIContext {
  hand: Card[];
  table: Card[];
  player: PlayerId;
  scores: { self: number; opponent: number };
  targetScore: number;
  roundNumber: number;
  opponentHandCount: number;
  selfCapturedCount: number;
  opponentCapturedCount: number;
  deckCount: number;
  lastOpponentMove: Move | null;      // What opponent did last turn
  validMoves: Move[];                  // All valid moves for this turn
}

interface LLMResponse {
  moveIndex: number;                   // Index into validMoves array
  reasoning: string;                   // Brief explanation of choice
}
```

#### Prompt Structure

The LLM receives:
1. **Game State**: Current scores, round number, hand, table, pile sizes
2. **Last Opponent Move**: What the opponent played and captured (if any)
3. **Valid Moves**: Numbered list of all legal moves to choose from
4. **Rules Reminder**: Scoring categories and their values

```typescript
class GeminiAI implements LLMPlayer {
  async selectMove(context: LLMAIContext): Promise<Move> {
    const prompt = this.buildPrompt(context);
    const response = await this.callAPI(prompt);
    return this.parseResponse(response, context.validMoves);
  }

  buildPrompt(context: LLMAIContext): string {
    return `You are playing Scopa, an Italian card game.

CURRENT GAME STATE:
Round: ${context.roundNumber}
Score: You ${context.scores.self} - Opponent ${context.scores.opponent} (target: ${context.targetScore})

Your hand: ${formatCards(context.hand)}
Table cards: ${formatCards(context.table)}

Cards remaining in deck: ${context.deckCount}
Your captured pile: ${context.selfCapturedCount} cards
Opponent's captured pile: ${context.opponentCapturedCount} cards
Opponent's hand: ${context.opponentHandCount} cards

LAST OPPONENT MOVE:
${formatLastMove(context.lastOpponentMove)}

VALID MOVES (choose one by number):
${formatValidMoves(context.validMoves)}

SCORING REMINDER:
- Most cards (21+ guarantees): 1 point
- Most coins (6+ guarantees): 1 point
- Seven of Coins (Sette Bello): 1 point
- Best Prime (7=21, 6=18, A=16, 5=15, 4=14, 3=13, 2=12, face=10): 1 point
- Each Scopa (clearing the table): 1 point

Respond with JSON only:
{"moveIndex": <number>, "reasoning": "<brief explanation>"}`;
  }

  parseResponse(response: string, validMoves: Move[]): Move {
    const parsed = JSON.parse(response);
    const index = parsed.moveIndex;

    if (index >= 0 && index < validMoves.length) {
      // Log reasoning for debugging/display
      console.log(`AI reasoning: ${parsed.reasoning}`);
      return validMoves[index];
    }

    // Fallback to first valid move
    return validMoves[0];
  }
}
```

#### Supported Providers

| Provider | Model | Characteristics |
|----------|-------|-----------------|
| Anthropic | Claude 3.5 Sonnet | Strong reasoning, follows rules well |
| OpenAI | GPT-4o | Good strategic thinking |
| Google | Gemini 2.5 Flash | Fast responses, 1M token context |

#### API Configuration
```typescript
interface AIConfig {
  provider: string;
  apiKey: string;           // User provides or stored securely
  model: string;
  temperature: number;      // 0.3 for consistent play, 0.7 for variety
  maxTokens: number;        // 150 sufficient for move selection
  timeout: number;          // 10000ms default
}
```

#### Error Handling
- Invalid move response → Retry with clarification
- API timeout → Fallback to local Expert AI
- Parse failure → Request structured output
- Rate limiting → Queue with backoff

### 8.3 AI Response Time

| AI Type | Expected Response |
|---------|-------------------|
| Random | Instant (add 500ms delay for UX) |
| Beginner-Advanced | 100-500ms |
| Expert (Minimax) | 500ms-2s |
| LLM API | 1-5s (show thinking indicator) |

---

## 9. Game Modes

### 9.1 Human vs CPU

**Default mode.** Player competes against CPU opponent.

Settings:
- CPU difficulty level (1-5)
- Target score
- Animation speed

### 9.2 Human vs AI (LLM)

Player competes against LLM-powered opponent.

Settings:
- AI provider selection
- API key configuration
- Model selection
- Temperature/creativity

### 9.3 CPU vs CPU (Watch Mode)

Two CPU players compete while user watches.

Features:
- Play/Pause controls
- Speed adjustment (1x, 2x, 5x, 10x)
- Step-through mode (move by move)
- Commentary mode (explains each move)

Settings:
- CPU 1 difficulty
- CPU 2 difficulty (can be same or different)
- Auto-advance delay

### 9.4 Simulation Mode (Batch)

Run many games for statistical analysis.

```typescript
interface SimulationConfig {
  player1: AIConfig;
  player2: AIConfig;
  numberOfGames: number;      // 100, 1000, 10000
  targetScore: number;
  collectDetailedStats: boolean;
  outputFormat: 'summary' | 'detailed' | 'csv';
}

interface SimulationResults {
  gamesPlayed: number;
  player1Wins: number;
  player2Wins: number;
  averageRounds: number;
  averageScores: { p1: number; p2: number };
  scopaDistribution: { p1: number[]; p2: number[] };
  setteBelloCaptures: { p1: number; p2: number };
  primeWins: { p1: number; p2: number };
  // ... detailed statistics
}
```

Output:
- Win rate comparison
- Average game length
- Scoring breakdown by category
- Move efficiency metrics
- Exportable data (CSV/JSON)

---

## 10. Scoring & Statistics

### 10.1 In-Game Score Display

#### Main Scoreboard
```
┌────────────────────────────────┐
│      ROUND 3 of ?              │
├───────────────┬────────────────┤
│    YOU        │   OPPONENT     │
│     7         │      5         │
├───────────────┴────────────────┤
│   This Round:                  │
│   Cards:    12 vs 8    →  You  │
│   Coins:    4 vs 5     →  Opp  │
│   7-bello:  ✓          →  You  │
│   Prime:    67 vs 71   →  Opp  │
│   Scopas:   1 vs 0     →  You  │
├────────────────────────────────┤
│   Projected: +3 vs +2          │
└────────────────────────────────┘
```

### 10.2 Detailed Stats Panel (Toggleable)

```
YOUR CAPTURED CARDS:
┌─────────────────────────────────┐
│ Coins:  A 2 3 5 7      (5/10)   │
│ Cups:   4 6 K          (3/10)   │
│ Swords: 3 7 J Q        (4/10)   │
│ Clubs:  -              (0/10)   │
├─────────────────────────────────┤
│ Total: 12 cards                 │
│ Prime: 21+18+21+0 = 60*         │
│ *Missing clubs suit             │
└─────────────────────────────────┘
```

### 10.3 End of Round Summary

```
┌──────────────────────────────────────┐
│          ROUND 3 COMPLETE            │
├──────────────────────────────────────┤
│                YOU      OPPONENT     │
│ Cards (20)      ✓          —         │  
│ Coins (6)       —          ✓         │
│ Sette Bello     ✓          —         │
│ Prime (72)      —          ✓         │
│ Scopas          1          0         │
├──────────────────────────────────────┤
│ Round Points:   +3         +2        │
│ Total Score:    10         7         │
├──────────────────────────────────────┤
│         [ Continue to Round 4 ]      │
└──────────────────────────────────────┘
```

### 10.4 Game End Screen

```
┌──────────────────────────────────────┐
│           🏆 YOU WIN! 🏆              │
│                                      │
│         Final Score: 11 - 8          │
│         Rounds Played: 4             │
│                                      │
├──────────────────────────────────────┤
│         GAME STATISTICS              │
│                                      │
│ Total Scopas:      3 vs 2            │
│ Cards Won:         78 vs 82          │
│ Coins Won:         22 vs 18          │
│ Sette Bello:       3 vs 1            │
│ Prime Wins:        2 vs 2            │
│ Longest Streak:    2 rounds          │
│                                      │
├──────────────────────────────────────┤
│  [ Play Again ]  [ Change Settings ] │
└──────────────────────────────────────┘
```

### 10.5 Historical Statistics (Persistent)

Track across sessions:
- Games played per opponent type
- Win/loss record per difficulty
- Best winning streak
- Average game duration
- Favorite captures (most common moves)
- Achievement unlocks

---

## 11. Settings & Configuration

### 11.1 Game Settings

| Setting | Options | Default |
|---------|---------|---------|
| Target Score | 11, 16, 21, 31, Custom | 11 |
| Deck Style | Neapolitan, Piacentine, French | Neapolitan |
| Card Back | Classic, Modern, Custom | Classic |
| Table Color | Green, Red, Blue, Brown | Green |

### 11.2 Gameplay Settings

| Setting | Options | Default |
|---------|---------|---------|
| CPU Difficulty | 1-5 / AI | 3 |
| CPU Think Time | Instant, Short, Normal, Long | Normal |
| Auto-Capture | Single cards only, All obvious, Off | Single |
| Confirm Captures | Always, Multi-card only, Never | Multi-card |
| Show Hints | On, Off | Off |
| Undo Moves | Enabled, Disabled | Disabled |

### 11.3 Visual Settings

| Setting | Options | Default |
|---------|---------|---------|
| Animation Speed | Slow, Normal, Fast, Instant | Normal |
| Card Size | Small, Medium, Large | Medium |
| Show Card Values | Hover, Always, Never | Hover |
| Highlight Valid Moves | On, Off | On |
| Reduced Motion | On, Off | System |

### 11.4 AI/API Settings

| Setting | Options | Default |
|---------|---------|---------|
| AI Provider | None, Claude, GPT, Gemini | None |
| API Key | User input | — |
| Model | Provider-specific list | Best available |
| Temperature | 0.0 - 1.0 | 0.3 |
| Fallback on Error | Local Expert, Retry, Abort | Local Expert |

### 11.5 Audio Settings

| Setting | Options | Default |
|---------|---------|---------|
| Master Volume | 0-100 | 70 |
| Music | On, Off | On |
| Sound Effects | On, Off | On |
| Card Sounds | On, Off | On |
| Voice Announcements | On, Off | Off |

---

## 12. Audio Design

### 12.1 Sound Effects

| Event | Sound Description |
|-------|-------------------|
| Card deal | Soft card flick |
| Card play | Card placement thud |
| Card capture | Satisfying sweep/scoop |
| Scopa | Celebratory chime + sweep |
| Round end | Bell or horn |
| Game win | Victory fanfare |
| Game loss | Gentle consolation tone |
| Button click | Subtle UI click |
| Invalid move | Soft error buzz |

### 12.2 Background Music (Optional)

- Italian café ambiance
- Soft instrumental
- Volume auto-duck during important moments

### 12.3 Voice Lines (Optional Future Feature)

- "Scopa!" announcement
- Score announcements
- Italian phrases for atmosphere

---

## 13. Development Roadmap

### Phase 1: Core Game (MVP)

- [ ] Game engine with full rules implementation
- [ ] Basic UI with card display
- [ ] Human vs Random CPU
- [ ] Simple card animations
- [ ] Score tracking
- [ ] Round/game flow

### Phase 2: Enhanced AI

- [ ] Implement all 5 CPU difficulty levels
- [ ] AI move evaluation testing
- [ ] Think time simulation

### Phase 3: Visual Polish

- [ ] Professional card graphics
- [ ] Smooth animations (deal, play, capture, scopa)
- [ ] Responsive layout
- [ ] Dark/light themes

### Phase 4: LLM Integration

- [ ] API integration framework
- [ ] Claude AI player
- [ ] GPT AI player
- [ ] Gemini AI player
- [ ] Error handling and fallbacks

### Phase 5: Simulation Mode

- [ ] CPU vs CPU watch mode
- [ ] Batch simulation engine
- [ ] Statistics collection
- [ ] Export functionality

### Phase 6: Polish & Launch

- [ ] Audio implementation
- [ ] Settings persistence
- [ ] Tutorial/help system
- [ ] Bug fixes and optimization
- [ ] Cross-browser testing

---

## 14. Future Enhancements

### 14.1 Additional Game Modes

- **4-Player Teams:** 2v2 partnership mode
- **Tournament Mode:** Bracket-style competition
- **Campaign Mode:** Progress through AI difficulties with story
- **Daily Challenge:** Pre-set scenarios to solve

### 14.2 Variant Rules

- **Scopa d'Assi:** Ace captures all table cards
- **Napola/Napula:** Bonus for A-2-3 of Coins sequence
- **Re Bello:** King of Coins worth extra point
- **Scopa a Quindici:** Capture cards summing to 15
- **Scopone Scientifico:** All 9 cards dealt at once

### 14.3 Social Features

- **Online Multiplayer:** Real-time play with friends
- **Leaderboards:** Global and friend rankings
- **Achievements:** Unlockable badges
- **Replays:** Save and share memorable games

### 14.4 Accessibility

- Screen reader support
- Keyboard-only navigation
- Color blind modes
- Large text options
- Reduced motion mode

### 14.5 Platform Expansion

- Progressive Web App (offline play)
- Native mobile apps (iOS/Android)
- Desktop app (Electron)

### 14.6 Advanced AI Features

- **AI Commentary:** Explains its reasoning
- **Teaching Mode:** AI suggests optimal plays
- **Personality Profiles:** Different AI playing styles
- **Adaptive Difficulty:** AI adjusts to player skill

---

## Appendix A: Card Value Quick Reference

| Card | Game Value | Prime Value |
|------|------------|-------------|
| Ace | 1 | 16 |
| 2 | 2 | 12 |
| 3 | 3 | 13 |
| 4 | 4 | 14 |
| 5 | 5 | 15 |
| 6 | 6 | 18 |
| 7 | 7 | 21 |
| Fante (Jack) | 8 | 10 |
| Cavallo (Knight) | 9 | 10 |
| Re (King) | 10 | 10 |

---

## Appendix B: Glossary

| Term | Definition |
|------|------------|
| **Scopa** | Clearing all cards from table (worth 1 point) |
| **Sette Bello** | Seven of Coins (worth 1 point) |
| **Primiera/Prime** | Best card from each suit, special point scale |
| **Denari** | Coins suit (most valuable suit) |
| **Fante** | Jack/Knave (value 8) |
| **Cavallo** | Knight/Cavalier (value 9) |
| **Re** | King (value 10) |
| **Mazzo** | Deck of cards |

---

*Document prepared for ScopaOnline WebApp development.*
