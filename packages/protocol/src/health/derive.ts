import type { DerivedStatus, HealthStatus, HeartbeatPayload } from './types.js';

/** A widget only has to check in once a month to count as installed. */
export const DEFAULT_STALE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Collapse config state plus the last heartbeat into one status.
 * Ported unchanged in behavior from `deriveWidgetStatus` in
 * `widget-health.service.ts`.
 */
export function deriveWidgetStatus(params: {
  configComplete: boolean;
  configDeployed: boolean;
  lastSeenAt: Date | null;
  lastHealthStatus: HealthStatus | null;
  staleThresholdMs?: number;
  now?: number;
}): DerivedStatus {
  const { configComplete, configDeployed, lastSeenAt, lastHealthStatus } = params;
  const staleThresholdMs = params.staleThresholdMs ?? DEFAULT_STALE_MS;
  const now = params.now ?? Date.now();

  if (!configDeployed) return 'NOT_DEPLOYED';
  if (!configComplete) return 'CONFIG_REQUIRED';
  if (!lastSeenAt) return 'STALE';

  if (now - lastSeenAt.getTime() > staleThresholdMs) return 'STALE';

  if (lastHealthStatus === 'OK') return 'LIVE';
  if (lastHealthStatus === 'RUNTIME_ERROR') return 'ISSUE';
  return 'DETECTED_NOT_LIVE';
}

/** Trust an explicit status, otherwise infer one from the init/visible flags. */
export function resolveHealthStatus(payload: HeartbeatPayload): HealthStatus {
  if (payload.healthStatus) return payload.healthStatus;
  if (payload.initialized === false) return 'INIT_FAILED';
  return 'OK';
}
