# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Purpose

A web-based implementation of the classic Italian card game Scopa with AI opponents, multiplayer support, and multiple card deck themes.

## Repository Structure

```
scopa-ai/
├── src/                    # React frontend source
│   ├── ai/                 # AI player implementations (Gemini, OpenAI, Claude)
│   ├── components/         # React components (UI, Layout, Game)
│   ├── hooks/              # Custom hooks (useSettings, useStats, useMultiplayer)
│   └── utils/              # Game logic and utilities
├── scopa-server/           # WebSocket multiplayer server (Node.js)
├── public/                 # Static assets (cards, sounds, icons)
└── docs/                   # Design documentation
```

## Key Files

| Path | Purpose |
|------|---------|
| `src/App.tsx` | Main game component with state management |
| `src/utils/scopaUtils.ts` | Game logic (deck, rules, scoring) |
| `src/ai/` | AI implementations (Gemini, OpenAI, Claude) |
| `src/hooks/useMultiplayer.ts` | WebSocket multiplayer hook |
| `scopa-server/src/` | Multiplayer server code |

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (port 5173)
npm run build        # Production build to dist/
npm run preview      # Preview production build

# Multiplayer server
cd scopa-server
npm install
npm run build
npm start            # Runs on port 8080
```

## Game Rules Quick Reference

- **40-card Italian deck**: 4 suits (Coins, Cups, Swords, Clubs), values 1-10
- **Mandatory capture**: If a card can capture, player MUST capture
- **Single-card priority**: Single match takes precedence over sum matches
- **Scopa**: Clearing the table = 1 bonus point (except on final play)
- **Scoring**: Most cards (1pt), Most coins (1pt), 7 of Coins (1pt), Best primiera (1pt), Scopas (1pt each)
- **Prime values**: 7=21, 6=18, Ace=16, 5=15, 4=14, 3=13, 2=12, face cards=10

## Design Principles

1. **Static-first**: Frontend works without backend (except multiplayer)
2. **Single build artifact**: One folder of HTML/CSS/JS files
3. **User-provided API keys**: Stored in localStorage, calls go directly to LLM providers
