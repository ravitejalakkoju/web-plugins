import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);

/**
 * Absolute path to `@web-plugins/runtime`'s browser bundle. Resolved through the
 * package so it works from source, from a build, and from node_modules.
 */
export function resolveRuntimeBundlePath(): string {
  try {
    const manifest = require.resolve('@web-plugins/runtime/package.json');
    return resolve(dirname(manifest), 'dist/widget.js');
  } catch {
    // Fallback for a workspace checkout where exports are not resolvable yet.
    return resolve(process.cwd(), '../../packages/runtime/dist/widget.js');
  }
}
