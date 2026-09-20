import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { AdminState } from '../../admin/types.js';
import { renderShell } from './html.js';

export interface AdminRenderer {
  render(url: string, state: AdminState): Promise<string>;
  close(): Promise<void>;
}

type RenderModule = { render(state: AdminState): { html: string; title: string } };

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The bundle flattens `src/admin/` into `dist/main.js`, so this module sits at a
 * different depth depending on how the server was started. Both candidates are
 * checked rather than assuming one layout.
 */
const panelBuildDir = (): string => {
  const candidates = [resolve(here, 'admin'), resolve(here, '../../dist/admin')];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
};

/** Dev: Vite in middleware mode, so the panel gets HMR and no build step. */
async function createDevRenderer(app: FastifyInstance): Promise<AdminRenderer> {
  const { createServer } = await import('vite');
  const middie = await import('@fastify/middie');

  const vite = await createServer({
    configFile: resolve(here, '../../vite.config.ts'),
    server: { middlewareMode: true },
    appType: 'custom',
  });

  // Registered on the root instance on purpose. Vite's own URLs (`/@vite/client`,
  // dependency chunks) match no Fastify route, so the middleware has to run in
  // the scope that owns the not-found handler. It calls next() for everything it
  // does not recognise, which leaves the API and public routes untouched.
  await app.register(middie.default);
  app.use(vite.middlewares);

  // Root-relative and without the base: `transformIndexHtml` prepends it.
  const assetTags = '<script type="module" src="/entry-client.tsx"></script>';

  return {
    async render(url, state) {
      // Root-relative: Vite's root is `admin/`, not the package directory.
      const module = (await vite.ssrLoadModule('/entry-server.tsx')) as RenderModule;
      const { html, title } = module.render(state);
      const shell = renderShell({ title, appHtml: html, state, assetTags });
      return vite.transformIndexHtml(url, shell);
    },
    close: () => vite.close(),
  };
}

interface ManifestEntry {
  file: string;
  css?: string[];
}

/** Prod: the prebuilt SSR bundle plus hashed assets from the Vite manifest. */
async function createProdRenderer(app: FastifyInstance): Promise<AdminRenderer> {
  const buildDir = panelBuildDir();
  const clientDir = resolve(buildDir, 'client');

  const manifest = JSON.parse(
    await readFile(resolve(clientDir, '.vite/manifest.json'), 'utf8'),
  ) as Record<string, ManifestEntry>;

  const entry = manifest['entry-client.tsx'];
  if (!entry) throw new Error('admin client manifest has no entry; run `pnpm build` first');

  const assetTags = [
    ...(entry.css ?? []).map((file) => `<link rel="stylesheet" href="/admin/${file}" />`),
    `<script type="module" src="/admin/${entry.file}"></script>`,
  ].join('\n');

  const staticPlugin = await import('@fastify/static');
  await app.register(staticPlugin.default, {
    root: resolve(clientDir, 'assets'),
    prefix: '/admin/assets/',
    // Filenames are content-hashed, so these can be cached hard.
    maxAge: '1y',
    immutable: true,
    decorateReply: false,
  });

  const module = (await import(
    pathToFileURL(resolve(buildDir, 'server/entry-server.js')).href
  )) as RenderModule;

  return {
    async render(_url, state) {
      const { html, title } = module.render(state);
      return renderShell({ title, appHtml: html, state, assetTags });
    },
    close: async () => undefined,
  };
}

/** Call with the root instance: both branches register root-level plugins. */
export function createAdminRenderer(app: FastifyInstance): Promise<AdminRenderer> {
  return app.env.isProduction ? createProdRenderer(app) : createDevRenderer(app);
}
