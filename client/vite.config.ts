import { defineConfig } from 'vite';

// Relative base so dist/ works from any sub-path (e.g. GitHub Pages /<repo>/).
export default defineConfig({
  base: './',
  server: {
    // allow importing ../shared (game rules shared with the server)
    fs: { allow: ['..'] },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
  },
});
