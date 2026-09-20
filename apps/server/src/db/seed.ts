import { pathToFileURL } from 'node:url';
import { loadEnv } from '../config/env.js';
import { shortId } from '../lib/ids.js';
import { createDatabase, type Database } from './client.js';
import { runMigrations } from './migrate.js';
import { project, widgetTemplate } from './schema.js';
import { templateSeeds } from './templates.js';

/** Single-tenant self-host: one project row, then the starter templates. */
export const DEFAULT_PROJECT_ID = 'default';

/** Idempotent: safe to run on every boot. */
export async function seedDatabase(db: Database): Promise<void> {
  await db
    .insert(project)
    .values({
      id: DEFAULT_PROJECT_ID,
      name: 'Default project',
      publicKey: `pk_${shortId(24)}`,
    })
    .onConflictDoNothing({ target: project.id });

  for (const template of templateSeeds) {
    await db
      .insert(widgetTemplate)
      .values({
        id: template.id,
        name: template.name,
        description: template.description,
        chrome: template.chrome,
        src: template.src,
        schema: template.schema,
        defaults: template.defaults,
      })
      .onConflictDoUpdate({
        target: widgetTemplate.id,
        set: {
          name: template.name,
          description: template.description,
          chrome: template.chrome,
          src: template.src,
          schema: template.schema,
          defaults: template.defaults,
          updatedAt: new Date(),
        },
      });
  }
}

async function main(): Promise<void> {
  const env = loadEnv();
  const handle = await createDatabase(env.databaseUrl);

  try {
    await runMigrations(handle);
    await seedDatabase(handle.db);
    console.log(`seeded project "${DEFAULT_PROJECT_ID}" and ${templateSeeds.length} templates`);
  } finally {
    await handle.close();
  }
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCli) {
  main().catch((error) => {
    console.error('seed failed', error);
    process.exit(1);
  });
}
