import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

/**
 * Root is `admin/` and base is `/admin/`, so a dev request for
 * `/admin/entry-client.tsx` resolves to `admin/entry-client.tsx` and the built
 * chunks reference each other under the same prefix the server serves them from.
 *
 * There is no index.html: the HTML shell lives in `src/admin/html.ts` so one
 * function can inline SSR state for both dev and prod. Dev runs it through
 * `vite.transformIndexHtml`, prod reads the manifest.
 */
export default defineConfig({
  root: 'admin',
  base: '/admin/',
  plugins: [preact()],
  build: {
    manifest: true,
    outDir: '../dist/admin/client',
    emptyOutDir: true,
    rollupOptions: {
      input: { client: 'entry-client.tsx' },
    },
  },
  server: {
    middlewareMode: true,
    // Middleware mode has no HTTP server of its own to carry HMR, so the socket
    // needs a port that the example apps' Vite servers will not claim.
    hmr: { port: 24699 },
  },
  appType: 'custom',
});
