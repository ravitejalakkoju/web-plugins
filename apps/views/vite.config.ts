import preact from '@preact/preset-vite';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = dirname(fileURLToPath(import.meta.url));

/**
 * Every directory holding an `index.html` is a module, so adding one is a folder
 * rather than an edit here. Each gets its own entry, which is what keeps a chat
 * iframe from downloading the rewards code.
 */
function moduleEntries(): Record<string, string> {
  const entries: Record<string, string> = { index: join(root, 'index.html') };

  for (const item of readdirSync(root, { withFileTypes: true })) {
    if (!item.isDirectory() || item.name.startsWith('.')) continue;
    const html = join(root, item.name, 'index.html');
    if (existsSync(html)) entries[item.name] = html;
  }

  return entries;
}

export default defineConfig({
  plugins: [preact()],
  server: {
    port: 5175,
    strictPort: true,
    // The host page is on another origin, which is the point of the iframe.
    cors: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Directories, not `chat.html`, so `/chat/` works on any static host without
    // a rewrite rule.
    rollupOptions: { input: moduleEntries() },
  },
});
