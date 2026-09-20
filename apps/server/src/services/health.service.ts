import {
  deriveWidgetStatus,
  isConfigComplete,
  resolveHealthStatus,
  type HealthSnapshot,
  type HealthStatus,
  type HeartbeatPayload,
} from '@web-plugins/protocol';
import { eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { widget, widgetHealth, type WidgetHealthRow } from '../db/schema.js';
import {
  configValues,
  isPublished,
  type WidgetRecord,
  type WidgetService,
} from './widget.service.js';

export type HealthSummary = Pick<HealthSnapshot, 'derivedStatus' | 'lastSeenAgoSeconds'>;

/** The four values that both the list badge and the detail view need. */
interface DerivedHealth {
  derivedStatus: HealthSnapshot['derivedStatus'];
  lastSeenAgoSeconds: number | null;
  configComplete: boolean;
  configDeployed: boolean;
}

const MAX_URL = 2048;
const MAX_MESSAGE = 512;
const MAX_CODE = 64;

/**
 * Install telemetry, ported from `widget-health.service.ts`.
 *
 * The heartbeat is unauthenticated by design (it comes from a visitor's browser),
 * so everything it writes is length-capped and has to resolve to a real widget.
 * The route rate-limits on top of that.
 */
export class HealthService {
  constructor(
    private readonly db: Database,
    private readonly widgets: WidgetService,
  ) {}

  async recordHeartbeat(payload: HeartbeatPayload): Promise<boolean> {
    const [target] = await this.db
      .select({ id: widget.id, projectId: widget.projectId })
      .from(widget)
      .where(eq(widget.id, payload.widgetId))
      .limit(1);

    if (!target) return false;

    const now = new Date();
    const status = resolveHealthStatus(payload);
    const visible = payload.visible !== false && status === 'OK';

    const lastConfigVersion =
      typeof payload.configVersion === 'number' ? payload.configVersion : null;
    const lastPageUrl = payload.pageUrl ? payload.pageUrl.slice(0, MAX_URL) : null;
    const lastErrorCode = payload.errorCode ? payload.errorCode.slice(0, MAX_CODE) : null;
    const lastErrorMessage = payload.errorMessage
      ? payload.errorMessage.slice(0, MAX_MESSAGE)
      : null;

    await this.db
      .insert(widgetHealth)
      .values({
        widgetId: target.id,
        projectId: target.projectId,
        lastSeenAt: now,
        lastVisibleAt: visible ? now : null,
        lastHealthStatus: status,
        lastConfigVersion,
        lastPageUrl,
        lastErrorCode,
        lastErrorMessage,
        seenCount: 1,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: widgetHealth.widgetId,
        set: {
          lastSeenAt: now,
          // Keep the previous sighting when this beat reports it hidden.
          lastVisibleAt: visible ? now : sql`${widgetHealth.lastVisibleAt}`,
          lastHealthStatus: status,
          lastConfigVersion: lastConfigVersion ?? sql`${widgetHealth.lastConfigVersion}`,
          lastPageUrl: lastPageUrl ?? sql`${widgetHealth.lastPageUrl}`,
          lastErrorCode,
          lastErrorMessage,
          seenCount: sql`${widgetHealth.seenCount} + 1`,
          updatedAt: now,
        },
      });

    return true;
  }

  /**
   * Turn a config record and its heartbeat row into a status. The only place the
   * rules live, so the list badge and the detail view can never disagree.
   */
  private derive(record: WidgetRecord, row: WidgetHealthRow | undefined): DerivedHealth {
    const lastSeenAt = row?.lastSeenAt ?? null;
    const configDeployed = isPublished(record);
    const configComplete = isConfigComplete(
      configValues(record),
      this.widgets.schemaFor(record.widget),
    );

    return {
      configComplete,
      configDeployed,
      derivedStatus: deriveWidgetStatus({
        configComplete,
        configDeployed,
        lastSeenAt,
        lastHealthStatus: (row?.lastHealthStatus as HealthStatus | null) ?? null,
      }),
      lastSeenAgoSeconds: lastSeenAt
        ? Math.max(0, Math.round((Date.now() - lastSeenAt.getTime()) / 1000))
        : null,
    };
  }

  /**
   * Status for a whole list in one query. The list page needs a badge per row,
   * and per-row `getSnapshot` calls would re-read every widget and config.
   */
  async summaries(widgets: WidgetRecord[]): Promise<Map<string, HealthSummary>> {
    const result = new Map<string, HealthSummary>();
    if (widgets.length === 0) return result;

    const rows = await this.db
      .select()
      .from(widgetHealth)
      .where(
        inArray(
          widgetHealth.widgetId,
          widgets.map((entry) => entry.widget.id),
        ),
      );

    const byWidget = new Map(rows.map((row) => [row.widgetId, row]));

    for (const entry of widgets) {
      const { derivedStatus, lastSeenAgoSeconds } = this.derive(
        entry,
        byWidget.get(entry.widget.id),
      );
      result.set(entry.widget.id, { derivedStatus, lastSeenAgoSeconds });
    }

    return result;
  }

  async getSnapshot(widgetId: string): Promise<HealthSnapshot | null> {
    const found = await this.widgets.getWidget(widgetId);
    if (!found) return null;

    const [row] = await this.db
      .select()
      .from(widgetHealth)
      .where(eq(widgetHealth.widgetId, widgetId))
      .limit(1);

    return {
      widgetId,
      lastSeenAt: row?.lastSeenAt ? row.lastSeenAt.toISOString() : null,
      lastVisibleAt: row?.lastVisibleAt ? row.lastVisibleAt.toISOString() : null,
      lastHealthStatus: (row?.lastHealthStatus as HealthStatus | null) ?? null,
      lastConfigVersion: row?.lastConfigVersion ?? null,
      lastPageUrl: row?.lastPageUrl ?? null,
      lastErrorCode: row?.lastErrorCode ?? null,
      lastErrorMessage: row?.lastErrorMessage ?? null,
      ...this.derive(found, row),
    };
  }
}
