import { defineConfig } from 'tsup';

export default defineConfig((options) => ({
  entry: ['src/index.ts', 'src/preact/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  // Not in watch mode, so a watcher that dies mid-build cannot leave an empty
  // dist behind for a widget's dev server to resolve against.
  clean: !options.watch,
  sourcemap: true,
  target: 'es2022',
  // Only the RPC envelope is needed, and it carries no ajv.
  noExternal: ['@web-plugins/protocol'],
  external: ['preact', 'preact/hooks'],
}));
