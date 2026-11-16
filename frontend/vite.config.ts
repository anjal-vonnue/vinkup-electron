import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), svgr()],

  // PGlite  loads its .wasm and data files relative to its own module. Pre-bundling
  // would move the module away from those files, so Vite serves the package as it is.
  optimizeDeps: {
    exclude: ['@electric-sql/pglite'],
  },

  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
