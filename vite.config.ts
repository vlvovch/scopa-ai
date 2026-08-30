/// <reference types="vitest" />
import { defineConfig, configDefaults } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'

/**
 * Vite plugin: after the build is written to disk, copy every file in
 * `public/variants/{VITE_GAME}/` over the top of the build output. This
 * lets us swap variant-specific assets (manifest.json, pwa-192.png,
 * pwa-512.png, the SVG favicon) without keeping separate public folders.
 */
function copyVariantAssets(game: string | undefined) {
  let outDir = 'dist'
  return {
    name: 'briscola-scopa:copy-variant-assets',
    configResolved(config: { build: { outDir: string } }) {
      outDir = config.build.outDir
    },
    closeBundle() {
      if (!game) return
      const variantDir = path.resolve('public/variants', game)
      if (!existsSync(variantDir)) return
      for (const file of readdirSync(variantDir)) {
        const from = path.join(variantDir, file)
        if (!statSync(from).isFile()) continue
        copyFileSync(from, path.join(outDir, file))
      }
    },
  }
}

/**
 * Vite plugin: after the build is written, replace the __TOKENS__ in
 * `<outDir>/sw.js` with the game name, icon, a build id, and the actual
 * content-hashed /assets/* file list. The service worker must precache
 * those bundles for offline launches to boot (public/sw.js documents the
 * failure mode), and only the finished build knows their hashed names.
 * Throws if a token is missing so an unpatched sw.js can never ship.
 */
function injectSwPrecache(game: string | undefined, iconPath: string | undefined, staticVer: string | undefined) {
  let outDir = 'dist'
  return {
    name: 'briscola-scopa:inject-sw-precache',
    configResolved(config: { build: { outDir: string } }) {
      outDir = config.build.outDir
    },
    closeBundle() {
      if (!game) throw new Error('injectSwPrecache: VITE_GAME is not set')
      if (!iconPath) throw new Error('injectSwPrecache: VITE_ICON_PATH is not set')
      if (!staticVer) throw new Error('injectSwPrecache: VITE_STATIC_CACHE_VER is not set')
      const swPath = path.join(outDir, 'sw.js')
      let sw = readFileSync(swPath, 'utf8')
      const assets = readdirSync(path.join(outDir, 'assets')).sort()
      const appAssets = ['/', '/index.html', ...assets.map((f) => `/assets/${f}`)]
      const indexHtml = readFileSync(path.join(outDir, 'index.html'))
      const buildId = createHash('md5')
        .update(indexHtml)
        .update(assets.join(','))
        .digest('hex')
        .slice(0, 8)
      const replacements: Array<[string, string]> = [
        ['[__APP_ASSETS__]', JSON.stringify(appAssets)],
        ['__BUILD_ID__', buildId],
        ['__ICON_PATH__', iconPath],
        ['__STATIC_VER__', staticVer],
        ['__GAME__', game],
      ]
      for (const [token, value] of replacements) {
        if (!sw.includes(token)) {
          throw new Error(`injectSwPrecache: token ${token} not found in ${swPath}`)
        }
        sw = sw.split(token).join(value)
      }
      writeFileSync(swPath, sw)
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  // Build stamp shown in the start-screen footer so a device's running
  // version is verifiable at a glance (build time UTC + git commit).
  let gitVersion = 'dev'
  try {
    gitVersion = execSync('git rev-parse --short HEAD').toString().trim()
  } catch { /* not a git checkout */ }
  const buildStamp = `${new Date().toISOString().slice(0, 16).replace('T', ' ')} ${gitVersion}`
  return {
  define: { __APP_VERSION__: JSON.stringify(buildStamp) },
  plugins: [react(), copyVariantAssets(env.VITE_GAME), injectSwPrecache(env.VITE_GAME, env.VITE_ICON_PATH, env.VITE_STATIC_CACHE_VER)],
  base: '/',  // Use absolute paths for SPA routing with /join/CODE paths
  server: {
    hmr: {
      // Use default WebSocket connection settings
      protocol: 'ws',
      host: 'localhost',
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'terser',
    chunkSizeWarningLimit: 1000, // LLM SDKs make main chunk ~765KB (188KB gzipped)
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('framer-motion')) return 'framer-motion';
            if (id.includes('@google/genai')) return 'ai-google';
            if (id.includes('openai')) return 'ai-openai';
            if (id.includes('@anthropic-ai')) return 'ai-anthropic';
          }
        }
      }
    }
  },
  test: {
    // Keep Vitest's default excludes and add .claude/** so test runs
    // don't double-discover specs inside .claude/worktrees/... .
    exclude: [...configDefaults.exclude, '**/.claude/**'],
  },
  }
})
