import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',  // Absolute paths required for SPA routing with /join/CODE paths
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
    rollupOptions: {
      output: {
        manualChunks: {
          'framer-motion': ['framer-motion']
        }
      }
    }
  }
})
