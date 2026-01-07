# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Purpose

This is a **design documentation repository** for the Scopa WebApp project - a web-based implementation of the classic Italian card game Scopa with AI opponents. The actual implementation exists in the sibling directory `../scopa-ai/`.

## Repository Structure

```
scopa-ai-claude/
└── docs/
    ├── architecture.md           # System architecture (update after milestones)
    ├── progress.md               # Development progress tracking
    ├── game-design-document.md   # Complete game rules, UI design, scoring
    ├── tech-stack.md             # Technology decisions and architecture
    └── implementation-plan.md    # Step-by-step implementation guide
```

## Key Reference Documents

- **architecture.md**: Current system architecture. Read before coding, update after milestones.

- **progress.md**: Development progress and completed features.

- **game-design-document.md**: Comprehensive Scopa rules including mandatory capture, single-card priority, primiera (prime) scoring, and the sette bello (7 of Coins). Contains UI mockups and all game state types.

- **tech-stack.md**: Defines the static-first architecture (React + TypeScript + Vite), no backend required. API keys provided by users and stored in localStorage.

- **implementation-plan.md**: Phased MVP implementation with validation tests for each step. Covers game engine, UI components, animations, and state management.

> **IMPORTANT**: Before writing code:
> 1. Read `docs/architecture.md` for system architecture
> 2. Read `docs/game-design-document.md` for game rules
>
> After completing a major feature or milestone, update `docs/architecture.md`.

## Game Rules Quick Reference

- **40-card Italian deck**: 4 suits (Coins, Cups, Swords, Clubs), values 1-10
- **Mandatory capture**: If a card can capture, player MUST capture
- **Single-card priority**: Single match takes precedence over sum matches
- **Scopa**: Clearing the table = 1 bonus point (except on final play)
- **Scoring**: Most cards (1pt), Most coins (1pt), 7 of Coins (1pt), Best primiera (1pt), Scopas (1pt each)
- **Prime values**: 7=21, 6=18, Ace=16, 5=15, 4=14, 3=13, 2=12, face cards=10

## Working with the Implementation

The actual codebase is at `../scopa-ai/`. Key files there:

| Path | Purpose |
|------|---------|
| `App.tsx` | Main game component with state management |
| `utils/scopaUtils.ts` | Game logic (deck, rules, scoring) |
| `services/aiService.ts` | Gemini AI integration |
| `types.ts` | TypeScript definitions |

### Commands (run from ../scopa-ai/)

```bash
npm install                    # Install dependencies
GEMINI_API_KEY=key npm run dev # Start dev server (port 3000)
npm run build                  # Production build to dist/
npm run preview                # Preview production build
```

## Design Principles

From tech-stack.md:
1. **Static-first**: No server, no database, no authentication
2. **Single build artifact**: One folder of HTML/CSS/JS files
3. **Zero runtime dependencies**: Works offline after initial load
4. **User-provided API keys**: Stored in localStorage, calls go directly to LLM providers
