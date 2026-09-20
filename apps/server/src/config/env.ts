const required = (name: string, value: string | undefined): string => {
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
};

const MIN_SECRET_LENGTH = 16;

const secret = (name: string, value: string | undefined): string => {
  const resolved = required(name, value);
  if (resolved.length < MIN_SECRET_LENGTH) {
    throw new Error(`${name} must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  return resolved;
};

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

export interface Env {
  nodeEnv: 'development' | 'production' | 'test';
  isProduction: boolean;
  port: number;
  host: string;
  publicBaseUrl: string;
  databaseUrl: string;
  /** Signs the admin login cookie. Nothing to do with visitor sessions. */
  sessionSecret: string;
  previewTokenSecret: string;
  /** Signs visitor session JWTs, which live in a visitor's localStorage. */
  visitorTokenSecret: string;
  adminEmail: string;
  adminPassword: string;
  runtimeBundleUrl: string | null;
  /**
   * Where the runtime sends visitor identity calls. Defaults to this server, which
   * serves `/v1/sessions` itself; set `IDENTITY_BASE_URL` to point at a separate
   * identity service instead, or `IDENTITY_ENABLED=false` to turn identity off.
   */
  identityBaseUrl: string | null;
}

const isFalse = (value: string | undefined): boolean =>
  value !== undefined && ['0', 'false', 'no'].includes(value.trim().toLowerCase());

function resolveIdentityBaseUrl(source: NodeJS.ProcessEnv, publicBaseUrl: string): string | null {
  if (isFalse(source.IDENTITY_ENABLED)) return null;
  if (source.IDENTITY_BASE_URL) return trimTrailingSlash(source.IDENTITY_BASE_URL);
  return publicBaseUrl;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const nodeEnv = (source.NODE_ENV ?? 'development') as Env['nodeEnv'];
  const port = Number(source.PORT ?? 5055);
  const publicBaseUrl = trimTrailingSlash(source.PUBLIC_BASE_URL ?? `http://localhost:${port}`);

  return {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    port,
    host: source.HOST ?? '0.0.0.0',
    publicBaseUrl,
    databaseUrl: required('DATABASE_URL', source.DATABASE_URL),
    sessionSecret: secret('SESSION_SECRET', source.SESSION_SECRET),
    previewTokenSecret: secret('PREVIEW_TOKEN_SECRET', source.PREVIEW_TOKEN_SECRET),
    visitorTokenSecret: secret('VISITOR_TOKEN_SECRET', source.VISITOR_TOKEN_SECRET),
    adminEmail: required('ADMIN_EMAIL', source.ADMIN_EMAIL),
    adminPassword: required('ADMIN_PASSWORD', source.ADMIN_PASSWORD),
    runtimeBundleUrl: source.RUNTIME_BUNDLE_URL
      ? trimTrailingSlash(source.RUNTIME_BUNDLE_URL)
      : null,
    identityBaseUrl: resolveIdentityBaseUrl(source, publicBaseUrl),
  };
}

export type { Env as AppEnv };
