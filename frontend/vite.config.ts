import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import { defineConfig, type Plugin } from 'vite';

/**
 * The desktop shell embeds task previews in iframes, so the document's embedding
 * policy matters. Vite answers a conditional request with 304 and only the headers
 * it sends, so Chromium keeps the policy (COOP/COEP) from a cached document even
 * after the config changes. Strip the validators on document requests so dev always
 * serves HTML fresh.
 */
const freshDevHtml: Plugin = {
  name: 'vinkup:fresh-dev-html',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.headers.accept?.includes('text/html')) {
        delete req.headers['if-none-match'];
        delete req.headers['if-modified-since'];
        res.setHeader('Cache-Control', 'no-store');
      }
      next();
    });
  },
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), svgr(), freshDevHtml],

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
