import { rm } from 'node:fs/promises';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// public/ is copied verbatim into dist/, but agent docs don't belong in the
// extension package.
const stripDocs = {
  name: 'strip-docs',
  closeBundle: () => rm('dist/content/CLAUDE.md', { force: true }),
};

// base './' so built asset URLs are relative — required for pages served
// from chrome-extension:// URLs.
export default defineConfig({
  plugins: [react(), stripDocs],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
