# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Purpose

A web-based implementation of two classic Italian card games — **Scopa** (capture / scoring) and **Briscola** (trick-taking with trump) — sharing a single React/TypeScript codebase with CPU opponents, LLM AI opponents (Gemini, GPT, Claude), real-time multiplayer, watch mode, and multiple card-deck themes. Each game ships as its own deployment (Scopa at scopa-ai.vovchenko.net, Briscola at briscola-ai.vovchenko.net) selected at build time via Vite mode (`--mode scopa` vs `--mode briscola`).

## Repository Structure

```
scopa-ai/
├── src/
│   ├── ai/                 # Shared LLM utilities (Seat, TokenTracker, MOVE_JSON_SCHEMA, tokenStats)
│   ├── games/
│   │   ├── scopa/          # Scopa: rules, scoring, deck, reducer, ai/, ScopaApp.tsx
│   │   └── briscola/       # Briscola: rules, scoring, deck, ai/, BriscolaApp.tsx
│   ├── components/         # Shared React UI (cards, modals, layout, settings)
│   ├── hooks/              # Custom hooks (useSettings, useStats, useMultiplayer)
│   ├── contexts/           # React contexts (DeckContext, etc.)
│   ├── multiplayer/        # Shared multiplayer types
│   └── workers/            # Web Workers for background simulation
├── scopa-server/           # WebSocket multiplayer server (Node.js)
├── public/                 # Static assets (cards, sounds, icons)
├── scripts/                # CLI sim tools (simulate.ts for Scopa, briscola-sim.ts)
└── docs/                   # Design documentation
```

## Key Files

| Path | Purpose |
|------|---------|
| `src/games/scopa/ScopaApp.tsx` | Scopa game component (state machine, UI orchestration) |
| `src/games/scopa/rules.ts` / `scoring.ts` / `reducer.ts` | Scopa game logic |
| `src/games/scopa/ai/` | Scopa AI bots (random, heuristic, ismcts, gemini/openai/claude + single-turn variants, gemini-free) |
| `src/games/briscola/BriscolaApp.tsx` | Briscola game component |
| `src/games/briscola/rules.ts` / `scoring.ts` | Briscola game logic |
| `src/games/briscola/ai/` | Briscola AI bots (random, heuristic, expert, gemini, openai, claude, gemini-free) |
| `src/ai/` | Shared LLM utilities — Seat type, TokenTracker, GeminiTokenStats canonical shape, MOVE_JSON_SCHEMA |
| `src/hooks/useMultiplayer.ts` | WebSocket multiplayer hook (Scopa-only currently) |
| `scopa-server/src/` | Multiplayer server code |

## Commands

```bash
npm install                # Install dependencies

# Scopa (default)
npm run dev                # Dev server, Scopa mode (port 5173)
npm run build              # Production build to dist/

# Briscola
npm run dev:briscola       # Dev server, Briscola mode
npm run build:briscola     # Production build to dist-briscola/
npm run preview:briscola   # Preview Briscola build

# Tests / lint (cover both games)
npm test                   # Run all vitest tests
npm run lint               # ESLint

# Multiplayer server
cd scopa-server
npm install
npm run build
npm start                  # Runs on port 8080
```

## Game Rules Quick Reference

### Scopa

- **40-card Italian deck**: 4 suits (Coins, Cups, Swords, Clubs), values 1-10
- **Mandatory capture**: If a card can capture, player MUST capture
- **Single-card priority**: Single match takes precedence over sum matches
- **Scopa**: Clearing the table = 1 bonus point (except on final play)
- **Scoring**: Most cards (1pt), Most coins (1pt), 7 of Coins (1pt), Best primiera (1pt), Scopas (1pt each)
- **Prime values**: 7=21, 6=18, Ace=16, 5=15, 4=14, 3=13, 2=12, face cards=10

### Briscola

- Same 40-card Italian deck, trick-taking with a trump suit revealed at deal
- **Card point values**: Ace=11, 3=10, King=4, Knight=3, Knave=2, others=0 (120 points total per round)
- **Trick winner**: highest trump if any played, otherwise highest card of the lead suit; winner leads next trick
- **Draw after each trick** while deck remains; trump card is the last card drawn
- **Scoring**: round winner needs 61+ points; common targets 1 / best-of-3 / best-of-5

## Design Principles

1. **Static-first**: Frontend works without backend (except multiplayer)
2. **Per-game build artifacts**: Each game (Scopa, Briscola) ships as its own static bundle selected via Vite mode at build time
3. **User-provided API keys**: Stored in localStorage, calls go directly to LLM providers (free Gemini tier uses a Cloudflare Worker proxy with daily rate limiting)
4. **Shared infrastructure, game-specific logic**: `src/ai/`, `src/components/`, `src/hooks/` are shared; game rules / prompts / bots live under `src/games/<game>/`
