import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { dirname, resolve } from 'node:path';
import { Pool } from 'pg';
import * as schema from './schema.js';

/**
 * Both drizzle drivers expose the same query surface, so the pglite instance is
 * cast to the node-postgres type and every service below stays driver-agnostic.
 */
export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseHandle {
  db: Database;
  /** `pglite` runs Postgres in-process, with no server to connect to. */
  driver: 'postgres' | 'pglite';
  close(): Promise<void>;
}

export const PGLITE_PREFIX = 'pglite:';

export const isPgliteUrl = (url: string): boolean => url.startsWith(PGLITE_PREFIX);

/**
 * `pglite:memory` or `pglite:<path>` runs an embedded Postgres, so `pnpm dev`
 * needs no Docker. Anything else is a normal connection string.
 */
export async function createDatabase(connectionString: string): Promise<DatabaseHandle> {
  if (isPgliteUrl(connectionString)) {
    const target = connectionString.slice(PGLITE_PREFIX.length).replace(/^\/\//, '');

    let PGlite: typeof import('@electric-sql/pglite').PGlite;
    let pgliteDrizzle: typeof import('drizzle-orm/pglite').drizzle;
    try {
      ({ PGlite } = await import('@electric-sql/pglite'));
      ({ drizzle: pgliteDrizzle } = await import('drizzle-orm/pglite'));
    } catch {
      throw new Error(
        'DATABASE_URL uses pglite, but @electric-sql/pglite is not installed. Install dev dependencies or point DATABASE_URL at a Postgres server.',
      );
    }

    const inMemory = target === 'memory' || target === '';
    if (!inMemory) {
      // pglite's node filesystem layer does not create parent directories.
      const { mkdirSync } = await import('node:fs');
      mkdirSync(dirname(resolve(target)), { recursive: true });
    }

    const client = new PGlite(inMemory ? undefined : target);
    const db = pgliteDrizzle(client, { schema }) as unknown as Database;

    return {
      db,
      driver: 'pglite',
      close: () => client.close(),
    };
  }

  const pool = new Pool({ connectionString, max: 10 });

  return {
    db: drizzle(pool, { schema }),
    driver: 'postgres',
    close: () => pool.end(),
  };
}

export { schema };
