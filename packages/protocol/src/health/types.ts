/** What the runtime reports about itself. */
export type HealthStatus =
  'OK' | 'CONFIG_INVALID' | 'INIT_FAILED' | 'HIDDEN_BY_RULES' | 'RUNTIME_ERROR';

export const HEALTH_STATUSES: readonly HealthStatus[] = [
  'OK',
  'CONFIG_INVALID',
  'INIT_FAILED',
  'HIDDEN_BY_RULES',
  'RUNTIME_ERROR',
];

/** What the server concludes by combining reports with config state. */
export type DerivedStatus =
  'NOT_DEPLOYED' | 'CONFIG_REQUIRED' | 'STALE' | 'LIVE' | 'ISSUE' | 'DETECTED_NOT_LIVE';

/** Body of `POST /v1/health/heartbeat`. */
export interface HeartbeatPayload {
  widgetId: string;
  ts?: number;
  configVersion?: number | null;
  initialized?: boolean;
  visible?: boolean;
  healthStatus?: HealthStatus;
  errorCode?: string;
  errorMessage?: string;
  pageUrl?: string;
  meta?: Record<string, unknown>;
}

export interface HealthSnapshot {
  widgetId: string;
  lastSeenAt: string | null;
  lastVisibleAt: string | null;
  lastHealthStatus: HealthStatus | null;
  lastConfigVersion: number | null;
  lastPageUrl: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  derivedStatus: DerivedStatus;
  lastSeenAgoSeconds: number | null;
  configComplete: boolean;
  configDeployed: boolean;
}
