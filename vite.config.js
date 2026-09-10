import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The app is deployed under a subdirectory, so `base` carries what CRA's
 * `homepage` used to. VITE_BASE lets the browser suite build the same code with
 * relative paths and serve it from the root.
 */
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Only a build needs the deploy subdirectory in its asset paths; the dev
  // server stays at the root, where `npm start` expects to find it.
  base: command === 'build' ? process.env.VITE_BASE || '/challenges/react/dictionearch/' : '/',
  build: {
    outDir: 'build', // the hosting expects this name
    sourcemap: false,
  },
  server: {
    port: 3000,
    open: false,
  },
  preview: {
    port: 4173,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.js',
    css: false,
    include: ['src/**/*.test.{js,jsx}'],
    restoreMocks: true,
  },
}));
