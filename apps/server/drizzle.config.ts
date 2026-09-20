import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dbCredentials: {
    // `generate` only needs the schema; the URL matters for push/studio.
    url: process.env.DATABASE_URL ?? 'postgresql://webplugins:webplugins@localhost:5433/webplugins',
  },
  verbose: true,
  strict: true,
});
