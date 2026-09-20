import cors from '@fastify/cors';
import type { HeartbeatPayload } from '@web-plugins/protocol';
import { HEALTH_STATUSES } from '@web-plugins/protocol';
import type { FastifyPluginAsync } from 'fastify';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { verifyPreviewToken } from '../lib/tokens.js';
import { resolveRuntimeBundlePath } from '../lib/runtime-bundle.js';
import { sessionRoutes } from './sessions.js';

const heartbeatSchema = {
  type: 'object',
  required: ['widgetId'],
  additionalProperties: false,
  properties: {
    widgetId: { type: 'string', minLength: 1, maxLength: 64 },
    ts: { type: 'integer' },
    configVersion: { type: ['integer', 'null'] },
    initialized: { type: 'boolean' },
    visible: { type: 'boolean' },
    healthStatus: { type: 'string', enum: [...HEALTH_STATUSES] },
    errorCode: { type: 'string', maxLength: 64 },
    errorMessage: { type: 'string', maxLength: 512 },
    pageUrl: { type: 'string', maxLength: 2048 },
    meta: { type: 'object' },
  },
} as const;

/**
 * Everything a visitor's browser touches. CORS is `*` here and nowhere else, and
 * only published rows are readable without a preview token.
 */
export const publicRoutes: FastifyPluginAsync = async (app) => {
  await app.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    // No credentials: these routes are anonymous by design. `Authorization` is
    // used by the session routes, and the default reflection of
    // Access-Control-Request-Headers allows it through preflight.
    credentials: false,
    maxAge: 86400,
  });

  // Visitor identity. A child scope, so it can accept an empty JSON body without
  // the heartbeat below doing the same.
  await app.register(sessionRoutes);

  const canReadDraft = (widgetId: string, token: string | undefined): boolean =>
    Boolean(token) && verifyPreviewToken(app.env.previewTokenSecret, token!, widgetId);

  app.get<{ Querystring: { id?: string; previewToken?: string } }>(
    '/v1/config',
    async (request, reply) => {
      const widgetId = request.query.id;
      if (!widgetId) return reply.code(400).send({ error: 'missing id' });

      const includeDraft = canReadDraft(widgetId, request.query.previewToken);
      const envelope = await app.services.config.getEnvelope(widgetId, { includeDraft });

      if (!envelope) {
        return reply
          .code(404)
          .header('Cache-Control', 'no-store')
          .send({ error: 'no published config for this widget' });
      }

      reply.header('Cache-Control', includeDraft ? 'no-store' : 'public, max-age=60');
      return envelope;
    },
  );

  app.get<{ Querystring: { id?: string; previewToken?: string } }>(
    '/v1/config/version',
    async (request, reply) => {
      const widgetId = request.query.id;
      if (!widgetId) return reply.code(400).send({ error: 'missing id' });

      const includeDraft = canReadDraft(widgetId, request.query.previewToken);
      const version = await app.services.config.getVersion(widgetId, { includeDraft });

      if (!version) {
        return reply.code(404).header('Cache-Control', 'no-store').send({ error: 'not found' });
      }

      reply.header('Cache-Control', includeDraft ? 'no-store' : 'public, max-age=30');
      return version;
    },
  );

  app.post<{ Body: HeartbeatPayload }>(
    '/v1/health/heartbeat',
    {
      schema: { body: heartbeatSchema },
      config: {
        rateLimit: {
          max: 60,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const recorded = await app.services.health.recordHeartbeat(request.body);
      if (!recorded) return reply.code(404).send({ error: 'unknown widget' });
      return reply.code(202).send({ ok: true });
    },
  );

  /** The runtime bundle. `id` is only there so installs are self-describing. */
  app.get('/v1/widget.js', async (_request, reply) => {
    if (app.env.runtimeBundleUrl) {
      return reply.redirect(`${app.env.runtimeBundleUrl}/widget.js`, 302);
    }

    const bundlePath = resolveRuntimeBundlePath();

    try {
      await stat(bundlePath);
    } catch {
      app.log.error({ bundlePath }, 'runtime bundle missing; run pnpm build:packages');
      return reply.code(503).send({ error: 'runtime bundle not built' });
    }

    reply
      .header('Content-Type', 'application/javascript; charset=utf-8')
      .header('Cache-Control', 'public, max-age=300');

    return reply.send(createReadStream(bundlePath));
  });
};
