import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import type {
  AdminRoute,
  AdminState,
  EditorPageData,
  HealthPageData,
  WidgetsPageData,
} from '../../admin/types.js';
import { isAuthenticated, SESSION_COOKIE } from '../api/auth.js';
import { DEFAULT_PROJECT_ID } from '../db/seed.js';
import { notFound } from '../lib/errors.js';
import { createPreviewToken } from '../lib/tokens.js';
import { renderPreviewPage } from './preview.js';
import {
  hasUnpublishedChanges,
  templateSummary,
  widgetDetail,
  widgetSummary,
} from './presenters.js';
import type { AdminRenderer } from './renderer.js';

const html = (reply: FastifyReply, body: string) =>
  reply.type('text/html; charset=utf-8').header('cache-control', 'no-store').send(body);

export interface AdminPageOptions {
  renderer: AdminRenderer;
}

/**
 * The panel itself. Pages are server-rendered on every navigation and the client
 * bundle hydrates in place, so there is exactly one source of page data.
 */
export const adminPageRoutes: FastifyPluginAsync<AdminPageOptions> = async (app, { renderer }) => {
  const page = (route: AdminRoute): AdminState => ({
    route,
    publicBaseUrl: app.env.publicBaseUrl,
  });

  app.get('/', async (_request, reply) => reply.redirect('/admin/widgets', 302));
  app.get('/admin', async (_request, reply) => reply.redirect('/admin/widgets', 302));

  app.get('/admin/login', async (request, reply) => {
    if (isAuthenticated(request)) return reply.redirect('/admin/widgets', 302);
    return html(reply, await renderer.render(request.url, page({ name: 'login', data: {} })));
  });

  // A form post, so signing out works without the client bundle.
  app.post('/admin/logout', async (_request, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.redirect('/admin/login', 302);
  });

  await app.register(async (authed) => {
    // Pages redirect where the API would 401: a browser should land on the form.
    authed.addHook('onRequest', async (request, reply) => {
      if (isAuthenticated(request)) return;
      await reply.redirect('/admin/login', 302);
    });

    authed.get('/admin/widgets', async (request, reply) => {
      const widgets = await app.services.widgets.listWidgets(DEFAULT_PROJECT_ID);
      const [health, templates] = await Promise.all([
        app.services.health.summaries(widgets),
        app.services.widgets.listTemplates(),
      ]);

      const data: WidgetsPageData = {
        widgets: widgets.map((entry) => widgetSummary(entry, health.get(entry.widget.id) ?? null)),
        templates: templates.map(templateSummary),
      };

      return html(reply, await renderer.render(request.url, page({ name: 'widgets', data })));
    });

    authed.get<{ Params: { id: string } }>('/admin/widgets/:id', async (request, reply) => {
      const found = await app.services.widgets.getWidget(request.params.id);
      const snapshot = found ? await app.services.health.getSnapshot(found.widget.id) : null;
      if (!found || !snapshot) return reply.redirect('/admin/widgets', 302);

      const data: EditorPageData = {
        widget: widgetDetail(found.widget, found.template),
        fields: app.services.widgets.formFieldsFor(found.widget),
        values: (found.draft?.values ?? found.published?.values ?? {}) as Record<string, unknown>,
        version: found.draft?.version ?? found.published?.version ?? 0,
        published: found.published
          ? {
              version: found.published.version,
              publishedAt: found.published.publishedAt?.toISOString() ?? null,
            }
          : null,
        hasUnpublishedChanges: hasUnpublishedChanges(found),
        installSnippet: app.installSnippet(found.widget.id),
        health: snapshot,
      };

      return html(reply, await renderer.render(request.url, page({ name: 'editor', data })));
    });

    /**
     * The page the editor's preview iframe points at. Authed like every other
     * panel route, and it mints its own token so one cannot be lifted out of the
     * editor's HTML.
     */
    authed.get<{ Params: { id: string } }>('/admin/preview/:id', async (request, reply) => {
      const found = await app.services.widgets.getWidget(request.params.id);
      if (!found) throw notFound(`widget "${request.params.id}" does not exist`);

      const token = createPreviewToken(app.env.previewTokenSecret, found.widget.id);
      const params = new URLSearchParams({
        id: found.widget.id,
        mode: 'preview',
        previewToken: token.token,
      });

      return (
        reply
          .type('text/html; charset=utf-8')
          .header('cache-control', 'no-store')
          // Only the panel may frame this.
          .header('content-security-policy', "frame-ancestors 'self'")
          .send(
            renderPreviewPage({
              scriptUrl: `${app.env.publicBaseUrl}/v1/widget.js?${params.toString()}`,
              parentOrigin: app.env.publicBaseUrl,
            }),
          )
      );
    });

    authed.get<{ Params: { id: string } }>('/admin/widgets/:id/health', async (request, reply) => {
      const found = await app.services.widgets.getWidget(request.params.id);
      const snapshot = found ? await app.services.health.getSnapshot(found.widget.id) : null;
      if (!found || !snapshot) return reply.redirect('/admin/widgets', 302);

      const data: HealthPageData = {
        widget: widgetDetail(found.widget, found.template),
        health: snapshot,
        installSnippet: app.installSnippet(found.widget.id),
      };

      return html(reply, await renderer.render(request.url, page({ name: 'health', data })));
    });
  });
};
