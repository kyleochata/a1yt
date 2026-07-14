import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so built asset URLs are relative — required for pages served
// from chrome-extension:// URLs.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
