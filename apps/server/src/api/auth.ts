import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { safeCompare } from '../lib/tokens.js';

export const SESSION_COOKIE = 'wp_session';
const SESSION_VALUE = 'admin';
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const loginSchema = {
  type: 'object',
  required: ['email', 'password'],
  additionalProperties: false,
  properties: {
    email: { type: 'string', maxLength: 256 },
    password: { type: 'string', maxLength: 256 },
  },
} as const;

/**
 * Single-tenant auth: one operator, credentials from the environment, state in a
 * signed cookie. There is no user table to migrate when multi-tenant arrives;
 * only this plugin changes.
 */
export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: { email: string; password: string } }>(
    '/api/auth/login',
    {
      schema: { body: loginSchema },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const emailOk = safeCompare(
        request.body.email.trim().toLowerCase(),
        app.env.adminEmail.toLowerCase(),
      );
      const passwordOk = safeCompare(request.body.password, app.env.adminPassword);

      if (!emailOk || !passwordOk) {
        return reply.code(401).send({ error: 'invalid credentials' });
      }

      reply.setCookie(SESSION_COOKIE, SESSION_VALUE, {
        signed: true,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: app.env.isProduction,
        maxAge: SESSION_MAX_AGE_SECONDS,
      });

      return { ok: true };
    },
  );

  app.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });
};

export function isAuthenticated(request: FastifyRequest): boolean {
  const cookie = request.cookies[SESSION_COOKIE];
  if (!cookie) return false;

  const unsigned = request.unsignCookie(cookie);
  return unsigned.valid && unsigned.value === SESSION_VALUE;
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (isAuthenticated(request)) return;
  await reply.code(401).send({ error: 'unauthorized' });
}
