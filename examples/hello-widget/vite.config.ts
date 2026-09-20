import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [preact()],
  server: {
    port: 5174,
    strictPort: true,
    // The host page is served from another origin, which is the whole point of
    // the iframe boundary.
    cors: true,
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
