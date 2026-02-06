import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
  }
})
