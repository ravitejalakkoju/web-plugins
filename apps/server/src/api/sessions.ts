import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { DEFAULT_PROJECT_ID } from '../db/seed.js';
import { notFound, unauthorized } from '../lib/errors.js';
import { bearerToken, verifyVisitorToken } from '../lib/visitor-token.js';
import type { ClientContext } from '../services/session.service.js';

/** Small enough that no identity call can be used to push bulk data. */
const BODY_LIMIT = 8 * 1024;

const trait = (max: number) => ({ type: ['string', 'null'], maxLength: max }) as const;

const identifySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    // The runtime sends the token in the body as well as the Authorization
    // header. Only the header is read; this is here so the body still validates.
    token: { type: 'string', maxLength: 4096 },
    externalId: trait(256),
    name: trait(256),
    email: trait(320),
    phone: trait(32),
    company: trait(256),
    sourceUrl: trait(2048),
    referrerUrl: trait(2048),
    meta: { type: 'object' },
  },
} as const;

const restoreSchema = {
  type: 'object',
  required: ['restoreId'],
  additionalProperties: false,
  properties: {
    restoreId: { type: 'string', format: 'uuid' },
  },
} as const;

const eventSchema = {
  type: 'object',
  required: ['name'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 64 },
    type: { type: 'string', minLength: 1, maxLength: 32 },
    url: trait(2048),
    widgetId: { type: 'string', maxLength: 64 },
    metadata: { type: ['object', 'null'] },
  },
} as const;

const createSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    externalId: trait(256),
    name: trait(256),
    email: trait(320),
    phone: trait(32),
    company: trait(256),
    meta: { type: 'object' },
  },
} as const;

const clientContext = (request: FastifyRequest): ClientContext => ({
  ipAddress: request.ip ? request.ip.slice(0, 45) : null,
  userAgent: (request.headers['user-agent'] ?? '').slice(0, 1024) || null,
});

/** The page URLs the runtime sends alongside traits, folded into `meta`. */
const pageMeta = (body: { sourceUrl?: string | null; referrerUrl?: string | null }) => ({
  ...(body.sourceUrl ? { sourceUrl: body.sourceUrl } : {}),
  ...(body.referrerUrl ? { referrerUrl: body.referrerUrl } : {}),
});

/**
 * Visitor identity. Anonymous like the rest of `/v1`, so every route is rate
 * limited per IP, body-capped, and resolves a session only from a signed token or
 * an unguessable `restoreId`.
 *
 * Registered inside `publicRoutes` to inherit its `*` CORS - a second `@fastify/cors`
 * would try to declare `OPTIONS *` twice - but as its own child scope so the content
 * type parser below stays off the other public routes.
 *
 * Ported from the `online-chat` session plugin. The runtime half of this contract
 * is `IdentityManager`, which was written against that server: the paths and the
 * `{ token, restoreId }` response shape are fixed by it.
 */
export const sessionRoutes: FastifyPluginAsync = async (app) => {
  /**
   * The runtime creates a session with `Content-Type: application/json` and no
   * body, which Fastify would otherwise reject as `FST_ERR_CTP_EMPTY_JSON_BODY`.
   * Encapsulated to this plugin, so the admin API keeps rejecting empty bodies.
   */
  app.addContentTypeParser<string>(
    'application/json',
    { parseAs: 'string' },
    (_request, body, done) => {
      if (!body || body.trim() === '') return done(null, {});
      try {
        done(null, JSON.parse(body));
      } catch {
        done(Object.assign(new Error('body is not valid JSON'), { statusCode: 400 }), undefined);
      }
    },
  );

  const limits = { rateLimit: { max: 30, timeWindow: '1 minute' } };

  /** The session a request's bearer token speaks for. */
  const requireSession = async (request: FastifyRequest): Promise<string> => {
    const token = bearerToken(request.headers.authorization);
    const claims = await verifyVisitorToken(app.env.visitorTokenSecret, token);
    if (!claims) throw unauthorized('missing or invalid session token');
    return claims.sub;
  };

  app.post<{ Body: Record<string, string | null | undefined> }>(
    '/v1/sessions',
    { schema: { body: createSchema }, config: limits, bodyLimit: BODY_LIMIT },
    async (request) =>
      app.services.sessions.create({
        projectId: DEFAULT_PROJECT_ID,
        client: clientContext(request),
        traits: request.body,
      }),
  );

  app.post<{ Body: { restoreId: string } }>(
    '/v1/sessions/restore',
    { schema: { body: restoreSchema }, config: limits, bodyLimit: BODY_LIMIT },
    async (request, reply) => {
      const restored = await app.services.sessions.restore({
        projectId: DEFAULT_PROJECT_ID,
        restoreId: request.body.restoreId,
        client: clientContext(request),
      });

      // 404 rather than 401: an unknown, expired and foreign restore id must look
      // the same. The runtime falls back to creating a session either way.
      if (!restored) throw notFound('no session for that restore id');
      return reply.send(restored);
    },
  );

  app.post<{
    Body: {
      externalId?: string | null;
      name?: string | null;
      email?: string | null;
      phone?: string | null;
      company?: string | null;
      sourceUrl?: string | null;
      referrerUrl?: string | null;
      meta?: Record<string, unknown>;
    };
  }>(
    '/v1/sessions/identify',
    { schema: { body: identifySchema }, config: limits, bodyLimit: BODY_LIMIT },
    async (request) => {
      const { externalId, name, email, phone, company, meta } = request.body;
      const traits = {
        externalId,
        name,
        email,
        phone,
        company,
        meta: { ...(meta ?? {}), ...pageMeta(request.body) },
      };
      const client = clientContext(request);

      const token = bearerToken(request.headers.authorization);
      const claims = await verifyVisitorToken(app.env.visitorTokenSecret, token);

      // No usable token means the visitor's session expired or never existed.
      // Mint a new one carrying these traits rather than failing, which is what
      // keeps identity working across a token lifetime.
      if (!claims) {
        return app.services.sessions.create({
          projectId: DEFAULT_PROJECT_ID,
          client,
          traits,
        });
      }

      const identified = await app.services.sessions.identify({
        sessionId: claims.sub,
        traits,
        client,
      });

      // The token verified but its session is gone or expired.
      if (!identified) {
        return app.services.sessions.create({
          projectId: DEFAULT_PROJECT_ID,
          client,
          traits,
        });
      }

      return identified;
    },
  );

  app.post<{
    Body: {
      name: string;
      type?: string;
      url?: string | null;
      widgetId?: string;
      metadata?: Record<string, unknown> | null;
    };
  }>(
    '/v1/sessions/events',
    {
      schema: { body: eventSchema },
      // Higher than the identity routes: a browsing visitor legitimately emits
      // several of these, while they only ever create one session.
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      bodyLimit: BODY_LIMIT,
    },
    async (request, reply) => {
      const sessionId = await requireSession(request);
      const session = await app.services.sessions.find(sessionId);
      if (!session) throw unauthorized('session is no longer valid');

      const { widgetId } = request.body;
      // Dropped rather than rejected: a widget deleted mid-visit should not turn
      // into a page full of failed requests.
      const resolvedWidgetId =
        widgetId && (await app.services.sessions.widgetExists(session.projectId, widgetId))
          ? widgetId
          : null;

      await app.services.sessions.recordEvent({
        sessionId: session.id,
        projectId: session.projectId,
        widgetId: resolvedWidgetId,
        type: request.body.type,
        name: request.body.name,
        url: request.body.url ?? null,
        metadata: request.body.metadata ?? null,
      });

      return reply.code(202).send({ ok: true });
    },
  );
};
