import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createDatabase } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { seedDatabase } from './db/seed.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const handle = await createDatabase(env.databaseUrl);

  // Self-host should be one command: migrate and seed templates on boot.
  await runMigrations(handle);
  await seedDatabase(handle.db);

  const app = await buildApp({ env, db: handle.db });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    await handle.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: env.port, host: env.host });
  app.log.info({ url: env.publicBaseUrl, driver: handle.driver }, 'web-plugins server ready');
}

main().catch((error) => {
  console.error('failed to start server', error);
  process.exit(1);
});
