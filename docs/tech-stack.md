# Scopa WebApp - Technology Stack

**Version:** 1.0  
**Last Updated:** December 2024

---

## Overview

This document outlines a minimal, robust technology stack for the Scopa WebApp. The architecture prioritizes simplicity: a fully static single-page application with no backend server required. The app can be deployed to any static hosting service or embedded directly into an existing website.

---

## Core Principles

1. **Static-first**: No server, no database, no authentication
2. **Single build artifact**: One folder of HTML/CSS/JS files
3. **Zero runtime dependencies**: Works offline after initial load
4. **Simple deployment**: Upload files to any web host
5. **Maintainable**: TypeScript for type safety, standard tooling

---

## Recommended Stack

### Framework & Language

| Technology | Purpose | Why |
|------------|---------|-----|
| **React 18** | UI Framework | Component-based, excellent ecosystem, you're familiar with it |
| **TypeScript** | Language | Type safety prevents bugs in game logic, great IDE support |
| **Vite** | Build Tool | Fast development, simple config, optimized production builds |

**Alternative (Even Simpler):** Vanilla TypeScript + Web Components if you want zero framework dependencies. However, React offers faster development for interactive UIs.

### Styling

| Technology | Purpose | Why |
|------------|---------|-----|
| **CSS Modules** | Component styles | Scoped CSS, no runtime, works with Vite out of box |
| **CSS Variables** | Theming | Native, simple dark/light mode switching |

**Alternative:** Tailwind CSS if you prefer utility classes. Adds build step complexity but speeds up styling.

### Animation

| Technology | Purpose | Why |
|------------|---------|-----|
| **Framer Motion** | Card animations | Declarative, handles complex sequences, React-native |
| **CSS Transitions** | Simple hover/UI effects | No library needed for basics |

**Alternative:** React Spring (more physics-based) or pure CSS animations (simpler but less flexible).

### State Management

| Technology | Purpose | Why |
|------------|---------|-----|
| **React useState/useReducer** | Game state | Built-in, sufficient for single-player game |
| **localStorage** | Settings persistence | Native browser API, no backend needed |

**Note:** No need for Redux, Zustand, or other state libraries. A single `useReducer` hook can manage the entire game state cleanly.

### LLM API Integration

| Technology | Purpose | Why |
|------------|---------|-----|
| **Fetch API** | HTTP requests | Native browser API |
| **Direct API calls** | LLM communication | No backend proxy needed |

API keys are entered by the user and stored in localStorage (or session only). Calls go directly from browser to LLM provider APIs (Anthropic, OpenAI, Google all support CORS for their APIs).

---

## Project Structure

```
scopa/
├── index.html              # Entry point
├── vite.config.ts          # Vite configuration
├── tsconfig.json           # TypeScript configuration
├── package.json            # Dependencies
│
├── public/
│   ├── cards/              # Card images (SVG or PNG)
│   │   ├── coins-1.svg
│   │   ├── coins-2.svg
│   │   └── ...
│   ├── sounds/             # Audio files (optional)
│   │   ├── card-play.mp3
│   │   └── scopa.mp3
│   └── favicon.ico
│
└── src/
    ├── main.tsx            # React entry point
    ├── App.tsx             # Root component
    ├── index.css           # Global styles & CSS variables
    │
    ├── components/
    │   ├── Card/
    │   │   ├── Card.tsx
    │   │   └── Card.module.css
    │   ├── Table/
    │   │   ├── GameTable.tsx
    │   │   ├── TableCards.tsx
    │   │   └── PlayerHand.tsx
    │   ├── UI/
    │   │   ├── ScoreBoard.tsx
    │   │   ├── GameControls.tsx
    │   │   ├── SettingsModal.tsx
    │   │   └── EndGameScreen.tsx
    │   └── Layout/
    │       └── GameLayout.tsx
    │
    ├── game/
    │   ├── types.ts        # Card, GameState, Move interfaces
    │   ├── constants.ts    # Prime values, suits, etc.
    │   ├── deck.ts         # Deck creation, shuffling
    │   ├── rules.ts        # Valid moves, capture logic
    │   ├── scoring.ts      # Round/game scoring
    │   └── reducer.ts      # Game state reducer
    │
    ├── ai/
    │   ├── types.ts        # AIPlayer interface
    │   ├── random.ts       # Level 1: Random moves
    │   ├── basic.ts        # Level 2-3: Simple heuristics
    │   ├── advanced.ts     # Level 4-5: Strategic AI
    │   └── llm/
    │       ├── base.ts     # Common LLM logic
    │       ├── claude.ts   # Anthropic API
    │       ├── openai.ts   # OpenAI API
    │       └── gemini.ts   # Google AI API
    │
    ├── hooks/
    │   ├── useGame.ts      # Main game hook
    │   ├── useSettings.ts  # Settings with localStorage
    │   └── useAI.ts        # AI opponent hook
    │
    └── utils/
        ├── cards.ts        # Card helper functions
        └── storage.ts      # localStorage wrapper
```

---

## Dependencies

### package.json

```json
{
  "name": "scopa",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "framer-motion": "^11.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.4.0",
    "vite": "^5.4.0"
  }
}
```

**Total dependencies: 3 runtime, 5 dev**

This is intentionally minimal. No state management library, no CSS framework, no routing (single page), no testing framework initially.

---

## Configuration Files

### vite.config.ts

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',  // Relative paths for easy subdirectory hosting
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      output: {
        manualChunks: {
          'framer-motion': ['framer-motion']
        }
      }
    }
  }
})
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

---

## Data Persistence Strategy

Since there's no backend, all persistence uses browser localStorage:

```typescript
// src/utils/storage.ts

const STORAGE_KEYS = {
  SETTINGS: 'scopa_settings',
  STATS: 'scopa_stats',
  API_KEYS: 'scopa_api_keys'  // User's own keys, stored locally
} as const;

export function saveSettings(settings: GameSettings): void {
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
}

export function loadSettings(): GameSettings | null {
  const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
  return data ? JSON.parse(data) : null;
}

// Similar for stats, API keys, etc.
```

**What gets persisted:**
- Game settings (difficulty, animation speed, sounds)
- Player statistics (games won, scopas scored, etc.)
- LLM API keys (user provides their own)

**What doesn't persist:**
- Game in progress (intentional - refresh = new game)
- Could add game state persistence later if needed

---

## LLM API Integration

### Security Approach

Since this is a static site, API keys must come from the user:

1. User enters their API key in Settings
2. Key stored in localStorage (or sessionStorage for extra caution)
3. API calls made directly from browser to provider

```typescript
// src/ai/llm/claude.ts

export async function callClaude(
  prompt: string, 
  apiKey: string
): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 150,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  
  const data = await response.json();
  return data.content[0].text;
}
```

**Note:** Anthropic requires the `anthropic-dangerous-direct-browser-access` header for browser calls. OpenAI and Google have similar CORS support.

---

## Deployment

### Build Process

```bash
# Install dependencies
npm install

# Development server (with hot reload)
npm run dev

# Production build
npm run build

# Preview production build locally
npm run preview
```

### Output

The `npm run build` command produces:

```
dist/
├── index.html          # Entry HTML
├── assets/
│   ├── index-[hash].js     # Bundled JavaScript
│   ├── index-[hash].css    # Bundled CSS
│   └── vendor-[hash].js    # Framer Motion chunk
├── cards/              # Copied from public/
└── sounds/             # Copied from public/
```

### Hosting Options

Since the output is purely static files:

| Option | Notes |
|--------|-------|
| **Your existing website** | Upload `dist/` contents to a subdirectory like `/scopa/` |
| **GitHub Pages** | Free, automatic deployment from repo |
| **Netlify** | Free tier, drag-and-drop deployment |
| **Vercel** | Free tier, git integration |
| **Any web host** | Just upload the files via FTP/SFTP |

### Subdirectory Hosting

If hosting at `https://yoursite.com/scopa/`:

1. Set `base: '/scopa/'` in `vite.config.ts`
2. Build: `npm run build`
3. Upload `dist/` contents to `/scopa/` directory

---

## Development Workflow

### Getting Started

```bash
# Clone/create project
mkdir scopa && cd scopa

# Initialize with Vite
npm create vite@latest . -- --template react-ts

# Install Framer Motion
npm install framer-motion

# Start development
npm run dev
```

### Suggested Development Order

1. **Game Logic First** (`src/game/`)
   - Implement types, deck, rules, scoring
   - Test in isolation with console.log
   
2. **Basic UI** (`src/components/`)
   - Simple card display
   - Game table layout
   - Player hand

3. **Game Flow** (`src/hooks/useGame.ts`)
   - Connect UI to game logic
   - Human player actions
   - Basic CPU (random moves)

4. **Animations** 
   - Add Framer Motion to Card component
   - Implement deal, play, capture animations

5. **Enhanced AI**
   - Implement difficulty levels
   - Add LLM integration

6. **Polish**
   - Settings UI
   - Statistics tracking
   - Sound effects

---

## Card Assets

### Recommended Approach

**Option A: Generate SVG cards programmatically**
- Create suit symbols as SVG components
- Render cards dynamically
- Smallest bundle size
- Easy to theme

**Option B: Use existing card libraries**
- [SVG-cards](https://github.com/htdebeer/SVG-cards) - French deck, MIT license
- [Vectorized Playing Cards](https://code.google.com/archive/p/vectorized-playing-cards/) - Public domain
- Would need to adapt for Italian suits

**Option C: Commission/create Italian deck**
- Most authentic
- Neapolitan style preferred
- ~44 images (40 cards + 4 backs)

### Suggested Format

- **SVG preferred** (scalable, small file size)
- **PNG fallback** at 280×420px (2x for retina)
- Use CSS `object-fit` for responsive scaling

---

## Browser Support

Target modern browsers (last 2 versions):

- Chrome 90+
- Firefox 90+
- Safari 15+
- Edge 90+

No IE11 support (Vite doesn't support it, nor should you).

---

## Performance Considerations

### Bundle Size (Estimated)

| Component | Size (gzip) |
|-----------|-------------|
| React + React DOM | ~45 KB |
| Framer Motion | ~30 KB |
| App code | ~20 KB |
| **Total JS** | **~95 KB** |
| CSS | ~5 KB |
| Card images (SVG) | ~50-100 KB |
| **Total initial load** | **~200 KB** |

This is quite small - should load in <1 second on any connection.

### Optimizations Built-in

- Vite tree-shaking removes unused code
- CSS Modules = no unused styles
- Image assets in `public/` = not processed, cached well
- Code splitting for Framer Motion (loaded async)

---

## Testing (Optional/Future)

If you want to add testing later:

```json
// Add to package.json devDependencies
"vitest": "^1.0.0",
"@testing-library/react": "^14.0.0"
```

Focus testing on game logic (`src/game/`) which is pure functions:
- Deck shuffling
- Valid move detection
- Capture resolution
- Score calculation

---

## Summary

| Aspect | Choice | Rationale |
|--------|--------|-----------|
| **Framework** | React 18 | Familiar, productive |
| **Language** | TypeScript | Type safety for game logic |
| **Build** | Vite | Fast, simple, modern |
| **Styling** | CSS Modules | No runtime, scoped |
| **Animation** | Framer Motion | Powerful, declarative |
| **State** | useReducer | Built-in, sufficient |
| **Storage** | localStorage | No backend needed |
| **Deployment** | Static files | Upload anywhere |

**Total complexity:** Minimal. One build command produces a folder you can host anywhere.

---

## Quick Start Commands

```bash
# Create project
npm create vite@latest scopa -- --template react-ts
cd scopa

# Add animation library
npm install framer-motion

# Start coding
npm run dev

# When ready to deploy
npm run build
# Upload contents of dist/ to your web host
```

---

*This stack prioritizes simplicity and portability. No servers, no databases, no complexity - just a fun card game that runs anywhere.*
