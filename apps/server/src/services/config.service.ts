import type { WidgetConfig } from '@web-plugins/protocol';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { WIDGET_STATUS, widget, widgetConfig } from '../db/schema.js';

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
 * Read side of the config contract. Serves published widgets only; reading a draft
 * needs a preview token, which the route checks before asking for it.
 */
export class ConfigService {
  constructor(
    private readonly db: Database,
    private readonly options: { identityBaseUrl: string | null },
  ) {}

  /**
   * The document to serve, or null when there is nothing to serve. An unknown
   * widget and a draft one collapse to null on purpose: from outside they must be
   * indistinguishable.
   */
  private async resolve(
    widgetId: string,
    allowDraft: boolean,
  ): Promise<{ version: number; values: WidgetConfig } | null> {
    const [row] = await this.db
      .select({
        widgetStatus: widget.status,
        version: widgetConfig.version,
        values: widgetConfig.values,
      })
      .from(widget)
      .innerJoin(widgetConfig, eq(widgetConfig.widgetId, widget.id))
      .where(eq(widget.id, widgetId))
      .limit(1);

    if (!row) return null;
    if (!allowDraft && row.widgetStatus !== WIDGET_STATUS.published) return null;

    return { version: row.version, values: row.values as WidgetConfig };
  }

  async getEnvelope(
    widgetId: string,
    options: { allowDraft?: boolean } = {},
  ): Promise<ConfigEnvelope | null> {
    const resolved = await this.resolve(widgetId, options.allowDraft === true);
    if (!resolved) return null;

    return {
      widgetId,
      version: resolved.version,
      // The version travels inside the config too: the runtime forwards it to the
      // iframe and reports it on every heartbeat.
      config: { ...resolved.values, version: resolved.version },
      runtime: {
        identityBaseUrl: this.options.identityBaseUrl,
        protocol: 1,
      },
    };
  }

  async getVersion(
    widgetId: string,
    options: { allowDraft?: boolean } = {},
  ): Promise<{ widgetId: string; version: number } | null> {
    const resolved = await this.resolve(widgetId, options.allowDraft === true);
    if (!resolved) return null;
    return { widgetId, version: resolved.version };
  }
}
