/// <reference types="vitest" />
import { defineConfig, configDefaults } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs'
import { execSync, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { stripWebOnlyBlocks } from './scripts/build/webOnlyHtml'

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
 * Vite plugin (native builds only): the packaged app's web view cannot
 * always decode MP3 through Web Audio (the iPad build running on a Mac has
 * no MP3 decoder in its content process: "unable to find converter"), so
 * the sound effects are converted from public/sounds/*.mp3 with macOS's
 * afconvert after the bundle is written, to the format named by
 * VITE_NATIVE_SOUND_FORMAT: 'wav' (22 kHz 16-bit PCM, about 0.7 MB, the
 * only format that runtime decodes: AAC fails there exactly like MP3) or
 * 'm4a' (AAC, about the size of the MP3s, for devices only). The
 * website keeps the MP3s; src/hooks/useSound.ts asks for the same
 * extension when built for the app. The MP3s are dropped from the bundle.
 */
const NATIVE_SOUND_FORMATS = {
  m4a: { args: ['-f', 'm4af', '-d', 'aac', '-b', '64000'], label: 'AAC' },
  wav: { args: ['-f', 'WAVE', '-d', 'LEI16@22050'], label: 'WAV' },
} as const

function nativeSounds(native: boolean, format: string | undefined) {
  let outDir = 'dist'
  return {
    name: 'briscola-scopa:native-sounds',
    configResolved(config: { build: { outDir: string } }) {
      outDir = config.build.outDir
    },
    closeBundle() {
      if (!native) return
      const ext = (format ?? 'wav') as keyof typeof NATIVE_SOUND_FORMATS
      const spec = NATIVE_SOUND_FORMATS[ext]
      if (!spec) throw new Error(`native sounds: VITE_NATIVE_SOUND_FORMAT must be m4a or wav, got "${format}"`)
      const srcDir = path.resolve('public/sounds')
      const dstDir = path.join(outDir, 'sounds')
      mkdirSync(dstDir, { recursive: true })
      const mp3s = readdirSync(srcDir).filter((f) => f.endsWith('.mp3'))
      for (const file of mp3s) {
        const out = path.join(dstDir, file.replace(/\.mp3$/, `.${ext}`))
        try {
          execFileSync('afconvert', [...spec.args, path.join(srcDir, file), out], { stdio: 'pipe' })
        } catch (err) {
          throw new Error(`native sounds: afconvert failed for ${file} (macOS only): ${err instanceof Error ? err.message : String(err)}`)
        }
        const shippedMp3 = path.join(dstDir, file)
        if (existsSync(shippedMp3)) unlinkSync(shippedMp3)
      }
      console.log(`native sounds: ${mp3s.length} effects converted to ${spec.label}`)
    },
  }
}

/**
 * Vite plugin (native builds only): drop the parts of index.html that belong
 * to the website — service-worker registration and its update/reload flow,
 * the analytics loaders, the PWA install counter. They are fenced with
 * `<!-- @web-only:start -->` … `<!-- @web-only:end -->` in index.html. The
 * packaged app bundles everything locally and updates through the store,
 * so a service worker would only add a second, stale copy of the assets.
 */
function stripWebOnlyHtml(native: boolean) {
  return {
    name: 'briscola-scopa:strip-web-only-html',
    transformIndexHtml(html: string) {
      return native ? stripWebOnlyBlocks(html) : html
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
function injectSwPrecache(game: string | undefined, iconPath: string | undefined, staticVer: string | undefined, native = false) {
  let outDir = 'dist'
  return {
    name: 'briscola-scopa:inject-sw-precache',
    configResolved(config: { build: { outDir: string } }) {
      outDir = config.build.outDir
    },
    closeBundle() {
      if (native) {
        // The packaged app registers no service worker (see stripWebOnlyHtml);
        // don't ship one at all so it can never be picked up by accident.
        const swPath = path.join(outDir, 'sw.js')
        if (existsSync(swPath)) unlinkSync(swPath)
        return
      }
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
  // `vite build --mode ios` → the Capacitor-packaged app (see .env.ios).
  const native = env.VITE_NATIVE === 'true'
  // Version shown in the start-screen footer so a device's running build
  // is verifiable at a glance: v1.<commit count> (date) — monotonic and
  // maintenance-free. The tooltip carries build time UTC + git commit.
  let gitVersion = 'dev'
  let commitCount = '0'
  try {
    gitVersion = execSync('git rev-parse --short HEAD').toString().trim()
    commitCount = execSync('git rev-list --count HEAD').toString().trim()
  } catch { /* not a git checkout */ }
  const buildDate = new Date().toISOString().slice(0, 10)
  const buildTime = new Date().toISOString().slice(11, 16)
  return {
  define: {
    __APP_VERSION__: JSON.stringify(`1.${commitCount} (${buildDate})`),
    __APP_BUILD_INFO__: JSON.stringify(`built ${buildDate} ${buildTime} UTC · ${gitVersion}`),
  },
  plugins: [react(), stripWebOnlyHtml(native), copyVariantAssets(env.VITE_GAME), nativeSounds(native, env.VITE_NATIVE_SOUND_FORMAT), injectSwPrecache(env.VITE_GAME, env.VITE_ICON_PATH, env.VITE_STATIC_CACHE_VER, native)],
  base: '/',  // Use absolute paths for SPA routing with /join/CODE paths
  resolve: {
    alias: {
      // Runtime game switch code-splitting seam (see src/App.tsx): the game
      // this build is for is imported STATICALLY through this alias, so it
      // stays in the main chunk exactly as before; the other game is only
      // ever imported dynamically (src/games/gameLoaders.ts) and becomes
      // its own lazily fetched chunk. A plain static import of both apps
      // would keep a module-graph edge to the unused one and Rollup would
      // then hoist that game's dependencies into the main chunk.
      '@default-game': path.resolve(
        env.VITE_GAME === 'briscola'
          ? 'src/games/briscola/BriscolaApp.tsx'
          : 'src/games/scopa/ScopaApp.tsx'
      ),
    },
  },
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
