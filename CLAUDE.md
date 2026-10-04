# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Purpose

A web-based implementation of two classic Italian card games — **Scopa** (capture / scoring) and **Briscola** (trick-taking with trump) — sharing a single React/TypeScript codebase with CPU opponents, LLM AI opponents (Gemini, GPT, Claude, any model via OpenRouter), real-time multiplayer, watch mode, and multiple card-deck themes. Each game ships as its own deployment (Scopa at scopa-ai.vovchenko.net, Briscola at briscola-ai.vovchenko.net) selected at build time via Vite mode (`--mode scopa` vs `--mode briscola`). Since the runtime game switch, each deployment also carries the *other* game as a lazily loaded chunk: the build-time game is the first-visit default, a compact Scopa / Briscola selector (start screen + Settings) switches at runtime, the choice is remembered per origin, and explicit URLs (`/briscola`, `/scopa`) and invitation links (`/join/<GAME>-XXXX`) take priority — see `src/games/gameSelection.ts` and `src/App.tsx`.

## Repository Structure

```
scopa-ai/
├── src/
│   ├── ai/                 # Shared LLM utilities (Seat, TokenTracker, MOVE_JSON_SCHEMA, tokenStats)
│   ├── games/
│   │   ├── scopa/          # Scopa: rules, scoring, deck, reducer, ai/, workers/, ScopaApp.tsx
│   │   └── briscola/       # Briscola: rules, scoring, deck, ai/, workers/, BriscolaApp.tsx
│   ├── components/         # Shared React UI (cards, modals, layout, settings)
│   ├── hooks/              # Custom hooks (useSettings, useStats, useMultiplayer)
│   ├── contexts/           # React contexts (DeckContext, etc.)
│   ├── multiplayer/        # Shared multiplayer types
│   ├── i18n/               # Interface texts (en.ts, it.ts), language selection
│   └── platform/           # Native (iOS app) seam: storage, links, start-up, plugin wrappers
├── scopa-server/           # WebSocket multiplayer server (Node.js)
├── public/                 # Static assets (cards, sounds, icons)
├── scripts/                # CLI sim tools (simulate.ts for Scopa, briscola-sim.ts, decision-bench.ts: docs/decision-models.md)
└── docs/                   # Design documentation
```

## Key Files

| Path | Purpose |
|------|---------|
| `src/platform/` | Native (Capacitor iOS) seam: `native.ts` build flag, `storage.ts` key/value facade (web = localStorage pass-through; native = Preferences/Filesystem/Keychain, hydrated before render), `links.ts` invite URLs + deep links, `bootstrap.ts` start-up, `buildInfo.ts` / `appleIntelligence.ts` plugin wrappers, `review.ts` the App Store rating prompt (when to ask; `reviewPlugin.ts` wraps the plugin). Website bundles reach none of it |
| `capacitor.config.ts`, `.env.ios`, `ios/` | The iOS app (`npm run ios:sync` / `ios:open`), see `docs/ios.md`; local Swift plugins in `ios/App/App/*Plugin.swift` (Keychain, build info and the app's language, Apple Intelligence, keep-awake, rating prompt), registered in `MainViewController.swift` |
| `src/analytics/` | `gate.ts` decides whether this copy may send analytics at all (production build + public host, or Release build on a real device; never dev, `vite preview`, LAN, native Debug, Simulator), `loader.ts` adds the Swetrix tag at runtime after that decision (the native app reports to the Scopa project, events carry the game), `events.ts` the gameplay events. Verification uses a separate test project: `docs/analytics.md` |
| `src/App.tsx` | Root shell: resolves which game to mount (invite > URL > remembered choice > build default), lazy-loads the other game, load-failure fallback |
| `src/games/gameSelection.ts` | Game ids, route resolution, remembered selection (`selected-game`), per-game home paths |
| `src/games/gameLoaders.ts` | Dynamic imports for both game apps (the code-splitting seam) + `GameAppProps` |
| `src/components/UI/GameSwitcher.tsx` | The Scopa / Briscola segmented control (start screens + Settings) |
| `src/games/scopa/ScopaApp.tsx` | Scopa game component (state machine, UI orchestration) |
| `src/games/scopa/rules.ts` / `scoring.ts` / `reducer.ts` | Scopa game logic |
| `src/games/scopa/ai/` | Scopa AI bots (random, heuristic, ismcts, gemini/openai/claude + single-turn variants, openrouter (both modes in one module), gemini-free, apple = the on-device model of the iOS app via `src/ai/onDeviceModel.ts`) |
| `src/games/briscola/BriscolaApp.tsx` | Briscola game component |
| `src/games/briscola/rules.ts` / `scoring.ts` | Briscola game logic |
| `src/games/briscola/ai/` | Briscola AI bots (random, heuristic, expert, gemini, openai, claude, openrouter, gemini-free, apple = on-device, iOS app) |
| `src/ai/` | Shared LLM utilities — Seat type, TokenTracker, GeminiTokenStats canonical shape, MOVE_JSON_SCHEMA, thinking-level registry (`effort.ts`), the reasoning-language line (`reasoningLanguage.ts`: with an Italian interface the cloud models write their reasoning in Italian, appended by each game's `systemInstruction()`; the on-device prompt stays English), API-key cache registry (`apiKeyCaches.ts`), the API-key validators (`validateApiKey.ts`, used by the Settings modal and the OpenRouter sign-in), and the per-provider plumbing (`claudeProvider.ts` / `geminiProvider.ts` / `openaiProvider.ts` / `openrouterProvider.ts`: key availability, cached model lists, Claude thinking-mode gating; the OpenRouter one also holds the fetch-based chat client, the capability-gated request builder and the exact-cost usage parser; `openrouterAuth.ts` is the PKCE "Sign in with OpenRouter" flow used by `src/hooks/useOpenRouterLogin.ts`) |
| `src/i18n/` | Interface texts (`en.ts`, `it.ts`; visible texts go through `useT()` rather than English literals in components) and the language choice in `LanguageContext.tsx`: saved choice > the language iOS chose for the app (`systemLanguage.ts`, iOS app only) > browser list > English |
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

# iOS app (Capacitor) — see docs/ios.md
npm run ios:sync           # build the native web bundle (dist-ios) and sync into ios/
npm run ios:open           # open in Xcode
npm run ios:release        # App Store build (.ipa) via ios/release.sh; `-- --upload` sends it to App Store Connect

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
2. **Per-game build artifacts**: Each game (Scopa, Briscola) ships as its own static bundle selected via Vite mode at build time; the other game is code-split into a lazy chunk (its app is imported statically only through the `@default-game` alias in `vite.config.ts` — never import a game app statically from shared code, or Rollup hoists its dependencies into the main chunk). Both builds need both multiplayer URLs (`VITE_WS_URL`, `VITE_BRISCOLA_WS_URL`)
3. **User-provided API keys**: Stored in localStorage, calls go directly to LLM providers (free Gemini tier uses a Cloudflare Worker proxy with daily rate limiting). OpenRouter is a fourth BYOK provider: one key, any catalogue model, exact cost per response, its free models listed under the "AI (free)" category next to the proxy Gemini (the categories are about cost; "AI (your key)" holds the paid models); a user's own vendor keys go through OpenRouter's BYOK integration on openrouter.ai, nothing app-side. A one-time data notice (`src/ai/consent.ts`, `AIConsentModal`, remembered through the storage seam) precedes the first game against any off-device AI, Free AI included; CPU bots and the on-device model need none
4. **One storage seam**: all persistence goes through `src/platform/storage.ts` (never `localStorage` directly) so the iOS app can persist natively while the website keeps its keys and data
5. **Analytics only through the gate**: Swetrix is the only analytics provider; no tag in `index.html`; `src/analytics/loader.ts` loads it only where `src/analytics/gate.ts` allows it, and verification never uses the production project (`docs/analytics.md`)
6. **Shared infrastructure, game-specific logic**: `src/ai/`, `src/components/`, `src/hooks/` are shared; game rules / prompts / bots live under `src/games/<game>/`. A game's `ai/` modules must never import runtime values from the other game's `ai/` (type-only imports are fine): provider-wide code belongs in `src/ai/*Provider.ts`. A cross-game runtime import re-attaches that game's bot code to the main chunk of the build where it should be lazy (verify with a `--sourcemap` build: the main chunk's `sources` must contain no `src/games/<other game>/ai/` modules)
