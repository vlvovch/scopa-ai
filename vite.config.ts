/// <reference types="vitest" />
import { defineConfig, configDefaults } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync, readdirSync, statSync } from 'node:fs'
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

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
  plugins: [react(), copyVariantAssets(env.VITE_GAME)],
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
