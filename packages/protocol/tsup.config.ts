import { defineConfig } from 'tsup';

export default defineConfig((options) => ({
  entry: [
    'src/index.ts',
    'src/rpc/index.ts',
    'src/config/index.ts',
    'src/health/index.ts',
    'src/form/index.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  // Not in watch mode: everything downstream imports this package, so an emptied
  // output folder breaks the server and the other watchers until a rebuild.
  clean: !options.watch,
  sourcemap: true,
  target: 'es2022',
}));
