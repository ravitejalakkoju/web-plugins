import { SignJWT, jwtVerify } from 'jose';

/**
 * Visitor session tokens.
 *
 * A real JWT rather than the opaque HMAC used for preview tokens, because the
 * runtime base64-decodes the payload and reads the trait claims out of it without
 * calling the server. That makes the claim names part of the public contract, so
 * `IdentityManager.fromToken` is the other half of this file.
 *
 * Signed with `jose` rather than a hand-rolled HMAC: a token a client parses is a
 * different risk class from one we only ever compare against our own output.
 */

const ALGORITHM = 'HS256';

export const VISITOR_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Trait claims the runtime reads client-side. Names are fixed by that contract. */
export interface VisitorTraits {
  externalId?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
}

export interface VisitorClaims extends VisitorTraits {
  /** The `visitor_session.id` this token speaks for. */
  sub: string;
}

const key = (secret: string): Uint8Array => new TextEncoder().encode(secret);

const defined = (traits: VisitorTraits): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(traits)) {
    if (value !== null && value !== undefined && value !== '') out[name] = String(value);
  }
  return out;
};

export async function signVisitorToken(
  secret: string,
  sessionId: string,
  traits: VisitorTraits = {},
): Promise<string> {
  return new SignJWT(defined(traits))
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(sessionId)
    .setIssuedAt()
    .setExpirationTime(`${VISITOR_TOKEN_TTL_SECONDS}s`)
    .sign(key(secret));
}

/**
 * Null for anything not currently valid - bad signature, expired, wrong shape.
 * Callers must not distinguish those cases to a visitor.
 */
export async function verifyVisitorToken(
  secret: string,
  token: string | undefined,
): Promise<VisitorClaims | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: [ALGORITHM] });
    if (typeof payload.sub !== 'string' || !payload.sub) return null;

    return {
      sub: payload.sub,
      externalId: typeof payload.externalId === 'string' ? payload.externalId : null,
      name: typeof payload.name === 'string' ? payload.name : null,
      email: typeof payload.email === 'string' ? payload.email : null,
      phone: typeof payload.phone === 'string' ? payload.phone : null,
      company: typeof payload.company === 'string' ? payload.company : null,
    };
  } catch {
    return null;
  }
}

/** `Bearer <token>` from an Authorization header, if it is well formed. */
export function bearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, value] = header.split(' ');
  if (!value || scheme?.toLowerCase() !== 'bearer') return undefined;
  return value.trim() || undefined;
}
