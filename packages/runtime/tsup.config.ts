import { defineConfig } from 'tsup';

/**
 * `clean` is skipped in watch mode on purpose. The server streams
 * `dist/widget.js` straight to visitors, so an emptied output folder is a 503 on
 * `/v1/widget.js` — and a watcher killed during that window leaves the checkout
 * that way until someone notices and rebuilds.
 */
export default defineConfig((options) => [
  // The drop-in script tag. Everything is bundled, nothing is external.
  {
    entry: { widget: 'src/boot.ts' },
    format: ['iife'],
    platform: 'browser',
    target: 'es2019',
    minify: true,
    sourcemap: true,
    clean: !options.watch,
    noExternal: ['@web-plugins/protocol'],
    // tsup would otherwise emit `widget.global.js`.
    outExtension: () => ({ js: '.js' }),
  },
  // Importable build for apps that would rather mount the host themselves.
  {
    entry: { runtime: 'src/index.ts' },
    format: ['esm'],
    platform: 'browser',
    target: 'es2019',
    dts: true,
    sourcemap: true,
    noExternal: ['@web-plugins/protocol'],
  },
]);
