import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    base: '/', // Absolute paths for SPA routing with /join/CODE paths
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
});
