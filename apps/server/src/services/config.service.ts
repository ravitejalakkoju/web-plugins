import type { WidgetConfig } from '@web-plugins/protocol';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { CONFIG_STATUS, WIDGET_STATUS, widget, widgetConfig } from '../db/schema.js';

export interface ConfigEnvelope {
  widgetId: string;
  version: number;
  config: WidgetConfig;
  runtime: {
    identityBaseUrl: string | null;
    protocol: number;
  };
}

/**
 * Read side of the config contract. Serves published rows only; a draft needs a
 * preview token, which the route checks before asking for `'draft'`.
 */
export class ConfigService {
  constructor(
    private readonly db: Database,
    private readonly options: { identityBaseUrl: string | null },
  ) {}

  private async resolveRow(widgetId: string, status: string) {
    const [row] = await this.db
      .select({
        widgetId: widget.id,
        widgetStatus: widget.status,
        version: widgetConfig.version,
        values: widgetConfig.values,
      })
      .from(widget)
      .innerJoin(
        widgetConfig,
        and(eq(widgetConfig.widgetId, widget.id), eq(widgetConfig.status, status)),
      )
      .where(eq(widget.id, widgetId))
      .limit(1);

    if (!row) return null;
    if (row.widgetStatus !== WIDGET_STATUS.active) return null;
    return row;
  }

  async getEnvelope(
    widgetId: string,
    options: { includeDraft?: boolean } = {},
  ): Promise<ConfigEnvelope | null> {
    const status = options.includeDraft ? CONFIG_STATUS.draft : CONFIG_STATUS.published;
    const row = await this.resolveRow(widgetId, status);
    if (!row) return null;

    return {
      widgetId: row.widgetId,
      version: row.version,
      // The version travels inside the config too: the runtime forwards it to
      // the iframe and reports it on every heartbeat.
      config: { ...(row.values as WidgetConfig), version: row.version },
      runtime: {
        identityBaseUrl: this.options.identityBaseUrl,
        protocol: 1,
      },
    };
  }

  async getVersion(
    widgetId: string,
    options: { includeDraft?: boolean } = {},
  ): Promise<{ widgetId: string; version: number } | null> {
    const status = options.includeDraft ? CONFIG_STATUS.draft : CONFIG_STATUS.published;
    const row = await this.resolveRow(widgetId, status);
    if (!row) return null;
    return { widgetId: row.widgetId, version: row.version };
  }
}
