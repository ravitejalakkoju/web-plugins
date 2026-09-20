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
  sessionSecret: string;
  previewTokenSecret: string;
  adminEmail: string;
  adminPassword: string;
  runtimeBundleUrl: string | null;
  identityBaseUrl: string | null;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const nodeEnv = (source.NODE_ENV ?? 'development') as Env['nodeEnv'];
  const port = Number(source.PORT ?? 5055);

  return {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    port,
    host: source.HOST ?? '0.0.0.0',
    publicBaseUrl: trimTrailingSlash(source.PUBLIC_BASE_URL ?? `http://localhost:${port}`),
    databaseUrl: required('DATABASE_URL', source.DATABASE_URL),
    sessionSecret: secret('SESSION_SECRET', source.SESSION_SECRET),
    previewTokenSecret: secret('PREVIEW_TOKEN_SECRET', source.PREVIEW_TOKEN_SECRET),
    adminEmail: required('ADMIN_EMAIL', source.ADMIN_EMAIL),
    adminPassword: required('ADMIN_PASSWORD', source.ADMIN_PASSWORD),
    runtimeBundleUrl: source.RUNTIME_BUNDLE_URL
      ? trimTrailingSlash(source.RUNTIME_BUNDLE_URL)
      : null,
    identityBaseUrl: source.IDENTITY_BASE_URL ? trimTrailingSlash(source.IDENTITY_BASE_URL) : null,
  };
}

export type { Env as AppEnv };
