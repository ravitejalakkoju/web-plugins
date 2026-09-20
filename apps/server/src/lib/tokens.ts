import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Short-lived signed tokens so the panel can render an unpublished draft through
 * the public config route, without exposing a draft endpoint to the world.
 */

const encode = (value: string): string => Buffer.from(value, 'utf8').toString('base64url');
const decode = (value: string): string => Buffer.from(value, 'base64url').toString('utf8');

const sign = (secret: string, payload: string): string =>
  createHmac('sha256', secret).update(payload).digest('base64url');

export const PREVIEW_TOKEN_TTL_MS = 30 * 60 * 1000;

export interface PreviewToken {
  token: string;
  expiresAt: Date;
}

export function createPreviewToken(
  secret: string,
  widgetId: string,
  ttlMs = PREVIEW_TOKEN_TTL_MS,
): PreviewToken {
  const expiresAt = Date.now() + ttlMs;
  const payload = `${widgetId}.${expiresAt}`;
  return {
    token: `${encode(payload)}.${sign(secret, payload)}`,
    expiresAt: new Date(expiresAt),
  };
}

export function verifyPreviewToken(secret: string, token: string, widgetId: string): boolean {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return false;

  let payload: string;
  try {
    payload = decode(encodedPayload);
  } catch {
    return false;
  }

  const expected = sign(secret, payload);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length) return false;
  if (!timingSafeEqual(expectedBuffer, actualBuffer)) return false;

  const [tokenWidgetId, expiresAt] = payload.split('.');
  if (tokenWidgetId !== widgetId) return false;

  return Number(expiresAt) > Date.now();
}

/** Constant-time string compare for the admin credentials. */
export function safeCompare(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
