import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnv } from '../config/env.js';
import { createDatabase, type DatabaseHandle } from './client.js';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Migrations are read from disk at runtime, so the folder has to be found both
 * from `src/db` under tsx and from `dist` after the bundle flattens the tree.
 * The build copies them next to `main.js`.
 */
const migrationsFolder =
  [resolve(here, 'migrations'), resolve(here, '../src/db/migrations')].find((candidate) =>
    existsSync(candidate),
  ) ?? resolve(here, 'migrations');

/** Apply pending migrations with whichever driver the handle is using. */
export async function runMigrations(handle: DatabaseHandle): Promise<void> {
  if (handle.driver === 'pglite') {
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    await migrate(handle.db as never, { migrationsFolder });
    return;
  }

  const { migrate } = await import('drizzle-orm/node-postgres/migrator');
  await migrate(handle.db, { migrationsFolder });
}

async function main(): Promise<void> {
  const env = loadEnv();
  const handle = await createDatabase(env.databaseUrl);

  try {
    await runMigrations(handle);
    console.log(`migrations applied (${handle.driver})`);
  } finally {
    await handle.close();
  }
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCli) {
  main().catch((error) => {
    console.error('migration failed', error);
    process.exit(1);
  });
}
