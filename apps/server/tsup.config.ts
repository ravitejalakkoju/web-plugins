import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: false,
  sourcemap: true,
  dts: false,
  // Vite and middie are only reached on the dev path, and pglite is a dev-only
  // database driver. Bundling any of them would put megabytes of code that
  // production never executes into dist/.
  external: ['vite', '@fastify/middie', '@electric-sql/pglite', 'drizzle-orm/pglite'],
  // drizzle reads the .sql files at runtime, so they ship beside the bundle.
  async onSuccess() {
    const { cp } = await import('node:fs/promises');
    await cp('src/db/migrations', 'dist/migrations', { recursive: true });
  },
});
