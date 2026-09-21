import type { FastifyPluginAsync } from 'fastify';
import { templateSummary, widgetDetail, widgetSummary } from '../admin/presenters.js';
import { DEFAULT_PROJECT_ID } from '../db/seed.js';
import { notFound } from '../lib/errors.js';
import { WIDGET_STATUS, type WidgetStatus } from '../db/schema.js';
import { configValues } from '../services/widget.service.js';
import { requireAuth } from './auth.js';

const createWidgetSchema = {
  type: 'object',
  required: ['name', 'templateId'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 120 },
    templateId: { type: 'string', minLength: 1, maxLength: 64 },
  },
} as const;

const updateWidgetSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 120 },
    status: { type: 'string', enum: [WIDGET_STATUS.draft, WIDGET_STATUS.published] },
  },
} as const;

const saveConfigSchema = {
  type: 'object',
  required: ['values'],
  additionalProperties: false,
  properties: {
    values: { type: 'object' },
  },
} as const;

/**
 * The panel's API. No CORS is registered in this scope, so browsers will not let
 * another origin call it even with a session cookie present.
 */
export const adminRoutes: FastifyPluginAsync = async (app) => {
  // onRequest, not preHandler: an anonymous caller should get 401 rather than a
  // body-validation 400 that confirms the route's shape.
  app.addHook('onRequest', requireAuth);

  // A cross-site page must not be able to drive these with the operator's cookie.
  app.addHook('onRequest', async (request, reply) => {
    if (request.method === 'GET' || request.method === 'HEAD') return;

    const origin = request.headers.origin;
    if (!origin) return; // non-browser client, no ambient credentials to abuse

    const allowed = new Set([app.env.publicBaseUrl, `http://localhost:${app.env.port}`]);
    if (!allowed.has(origin)) {
      await reply.code(403).send({ error: 'origin not allowed' });
    }
  });

  app.get('/api/templates', async () => {
    const templates = await app.services.widgets.listTemplates();
    return { templates: templates.map(templateSummary) };
  });

  app.get('/api/widgets', async () => {
    const widgets = await app.services.widgets.listWidgets(DEFAULT_PROJECT_ID);
    const health = await app.services.health.summaries(widgets);

    return {
      widgets: widgets.map((entry) => widgetSummary(entry, health.get(entry.widget.id) ?? null)),
    };
  });

  app.post<{ Body: { name: string; templateId: string } }>(
    '/api/widgets',
    { schema: { body: createWidgetSchema } },
    async (request, reply) => {
      const created = await app.services.widgets.createWidget({
        projectId: DEFAULT_PROJECT_ID,
        name: request.body.name,
        templateId: request.body.templateId,
      });

      return reply.code(201).send({ id: created.widget.id });
    },
  );

  app.get<{ Params: { id: string } }>('/api/widgets/:id', async (request) => {
    const found = await app.services.widgets.getWidget(request.params.id);
    if (!found) throw notFound(`widget "${request.params.id}" does not exist`);

    return {
      widget: widgetDetail(found.widget, found.template),
      values: configValues(found),
      version: found.config?.version ?? 0,
      publishedAt: found.widget.publishedAt?.toISOString() ?? null,
      installSnippet: app.installSnippet(found.widget.id),
    };
  });

  /** Renaming and publishing, the latter being nothing more than a status change. */
  app.patch<{ Params: { id: string }; Body: { name?: string; status?: WidgetStatus } }>(
    '/api/widgets/:id',
    { schema: { body: updateWidgetSchema } },
    async (request) => {
      if (request.body.name) {
        await app.services.widgets.renameWidget(request.params.id, request.body.name);
      }
      if (!request.body.status) return { ok: true as const };

      const updated = await app.services.widgets.setStatus(request.params.id, request.body.status);
      return {
        ok: true as const,
        status: updated.widget.status,
        publishedAt: updated.widget.publishedAt?.toISOString() ?? null,
      };
    },
  );

  app.delete<{ Params: { id: string } }>('/api/widgets/:id', async (request) => {
    await app.services.widgets.deleteWidget(request.params.id);
    return { ok: true };
  });

  /** Schema plus the derived field list, so the panel never hardcodes a form. */
  app.get<{ Params: { id: string } }>('/api/widgets/:id/form', async (request) => {
    const found = await app.services.widgets.getWidget(request.params.id);
    if (!found) throw notFound(`widget "${request.params.id}" does not exist`);

    return {
      schema: app.services.widgets.schemaFor(found.widget),
      fields: app.services.widgets.formFieldsFor(found.widget),
      values: configValues(found),
    };
  });

  app.put<{ Params: { id: string }; Body: { values: Record<string, unknown> } }>(
    '/api/widgets/:id/config',
    { schema: { body: saveConfigSchema } },
    async (request) => {
      const saved = await app.services.widgets.saveConfig(request.params.id, request.body.values);
      return { values: configValues(saved), version: saved.config?.version ?? 0 };
    },
  );

  app.get<{ Params: { id: string } }>('/api/widgets/:id/health', async (request) => {
    const snapshot = await app.services.health.getSnapshot(request.params.id);
    if (!snapshot) throw notFound(`widget "${request.params.id}" does not exist`);
    return snapshot;
  });
};
