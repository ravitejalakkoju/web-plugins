import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { createAdminRenderer } from './admin/renderer.js';
import { adminPageRoutes } from './admin/routes.js';
import { adminRoutes } from './api/admin.js';
import { authRoutes } from './api/auth.js';
import { publicRoutes } from './api/public.js';
import type { Env } from './config/env.js';
import type { Database } from './db/client.js';
import { HttpError } from './lib/errors.js';
import { ConfigService } from './services/config.service.js';
import { HealthService } from './services/health.service.js';
import { WidgetService } from './services/widget.service.js';

export interface AppServices {
  widgets: WidgetService;
  config: ConfigService;
  health: HealthService;
}

declare module 'fastify' {
  interface FastifyInstance {
    env: Env;
    db: Database;
    services: AppServices;
    /** The copy-paste install tag for a widget. */
    installSnippet(widgetId: string): string;
  }
}

export interface BuildAppOptions {
  env: Env;
  db: Database;
}

export async function buildApp({ env, db }: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.isProduction ? 'info' : 'debug',
      transport: env.isProduction ? undefined : { target: 'pino-pretty' },
    },
    trustProxy: env.isProduction,
    bodyLimit: 1024 * 512,
  });

  const widgets = new WidgetService(db);

  app.decorate('env', env);
  app.decorate('db', db);
  app.decorate('services', {
    widgets,
    config: new ConfigService(db, { identityBaseUrl: env.identityBaseUrl }),
    health: new HealthService(db, widgets),
  });
  app.decorate(
    'installSnippet',
    (widgetId: string) =>
      `<script src="${env.publicBaseUrl}/v1/widget.js?id=${widgetId}" async></script>`,
  );

  await app.register(cookie, { secret: env.sessionSecret });
  await app.register(rateLimit, {
    global: false,
    max: 120,
    timeWindow: '1 minute',
  });

  type RequestError = Error & { statusCode?: number; validation?: unknown };

  app.setErrorHandler((error: RequestError, request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({
        error: error.message,
        ...(error.details ? { details: error.details } : {}),
      });
    }

    if (error.validation) {
      return reply.code(400).send({ error: error.message, details: error.validation });
    }

    request.log.error({ err: error }, 'request failed');
    const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    return reply
      .code(statusCode)
      .send({ error: statusCode >= 500 ? 'internal server error' : error.message });
  });

  app.get('/healthz', async () => ({ ok: true, version: 1 }));

  // Each of these is its own plugin scope, which is what keeps `*` CORS on the
  // public routes from leaking onto the admin API.
  await app.register(publicRoutes);
  await app.register(authRoutes);
  await app.register(adminRoutes);

  // The renderer registers root-level plugins (the Vite dev middleware, or the
  // static asset route in production), so it is built here rather than inside
  // the encapsulated page-route scope.
  const renderer = await createAdminRenderer(app);
  app.addHook('onClose', () => renderer.close());
  await app.register(adminPageRoutes, { renderer });

  return app;
}
