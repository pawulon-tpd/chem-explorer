import { defineConfig } from 'vite';

// Relative base so dist/ works from any sub-path (e.g. GitHub Pages /<repo>/).
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
  },
});
