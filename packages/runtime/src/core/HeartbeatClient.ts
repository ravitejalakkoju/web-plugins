import type { HealthStatus, HeartbeatPayload } from '@web-plugins/protocol/health';

/**
 * Best-effort install telemetry, ported from `HeartbeatClient`. The endpoint is
 * now injected instead of baked in from `process.env.HOST` at build time.
 */
export class HeartbeatClient {
  private configVersion: number | null = null;

  constructor(
    private readonly endpoint: string,
    private readonly widgetId: string,
    private readonly enabled = true,
  ) {}

  setConfigVersion(version: number | null | undefined): void {
    if (typeof version === 'number') this.configVersion = version;
  }

  send(data: Partial<Omit<HeartbeatPayload, 'widgetId'>> = {}): void {
    if (!this.enabled || !this.endpoint || !this.widgetId) return;

    const payload: HeartbeatPayload = {
      widgetId: this.widgetId,
      configVersion: this.configVersion,
      ts: Date.now(),
      pageUrl: window.location?.href,
      ...data,
    };

    try {
      void fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
        credentials: 'omit',
      }).catch(() => {});
    } catch {
      /* telemetry must never break the host page */
    }
  }

  fail(status: HealthStatus, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.send({
      initialized: false,
      healthStatus: status,
      errorCode: status,
      errorMessage: message.slice(0, 256),
    });
  }
}
