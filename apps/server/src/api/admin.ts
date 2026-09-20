import type { FastifyPluginAsync } from 'fastify';
import { templateSummary, widgetDetail, widgetSummary } from '../admin/presenters.js';
import { DEFAULT_PROJECT_ID } from '../db/seed.js';
import { notFound } from '../lib/errors.js';
import { createPreviewToken } from '../lib/tokens.js';
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
    status: { type: 'string', enum: ['active', 'disabled'] },
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
      draft: found.draft ? { version: found.draft.version, values: found.draft.values } : null,
      published: found.published
        ? {
            version: found.published.version,
            values: found.published.values,
            publishedAt: found.published.publishedAt?.toISOString() ?? null,
          }
        : null,
      installSnippet: app.installSnippet(found.widget.id),
    };
  });

  app.patch<{ Params: { id: string }; Body: { name?: string; status?: 'active' | 'disabled' } }>(
    '/api/widgets/:id',
    { schema: { body: updateWidgetSchema } },
    async (request) => {
      if (request.body.name) {
        await app.services.widgets.renameWidget(request.params.id, request.body.name);
      }
      if (request.body.status) {
        await app.services.widgets.setStatus(request.params.id, request.body.status);
      }
      return { ok: true };
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
      values: found.draft?.values ?? found.published?.values ?? {},
      version: found.draft?.version ?? found.published?.version ?? 0,
    };
  });

  app.put<{ Params: { id: string }; Body: { values: Record<string, unknown> } }>(
    '/api/widgets/:id/config',
    { schema: { body: saveConfigSchema } },
    async (request) => {
      const draft = await app.services.widgets.saveDraft(request.params.id, request.body.values);
      return { version: draft.version, values: draft.values };
    },
  );

  app.post<{ Params: { id: string } }>('/api/widgets/:id/publish', async (request) => {
    const published = await app.services.widgets.publish(request.params.id);
    return {
      version: published.version,
      publishedAt: published.publishedAt?.toISOString() ?? null,
    };
  });

  app.post<{ Params: { id: string } }>('/api/widgets/:id/unpublish', async (request) => {
    await app.services.widgets.unpublish(request.params.id);
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>('/api/widgets/:id/health', async (request) => {
    const snapshot = await app.services.health.getSnapshot(request.params.id);
    if (!snapshot) throw notFound(`widget "${request.params.id}" does not exist`);
    return snapshot;
  });

  app.post<{ Params: { id: string } }>('/api/widgets/:id/preview-token', async (request) => {
    const found = await app.services.widgets.getWidget(request.params.id);
    if (!found) throw notFound(`widget "${request.params.id}" does not exist`);

    const token = createPreviewToken(app.env.previewTokenSecret, found.widget.id);
    return { token: token.token, expiresAt: token.expiresAt.toISOString() };
  });
};
