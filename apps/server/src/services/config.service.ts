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
 * Read side of the config contract. Serves the published column only; reading the
 * draft needs a preview token, which the route checks before asking for it.
 */
export class ConfigService {
  constructor(
    private readonly db: Database,
    private readonly options: { identityBaseUrl: string | null },
  ) {}

  /**
   * The document to serve, or null when there is nothing to serve. Unknown widget,
   * never published, unpublished and disabled all collapse to null on purpose:
   * from outside they must be indistinguishable.
   */
  private async resolve(
    widgetId: string,
    includeDraft: boolean,
  ): Promise<{ version: number; values: WidgetConfig } | null> {
    const [row] = await this.db
      .select({
        widgetStatus: widget.status,
        version: widgetConfig.version,
        draftValues: widgetConfig.draftValues,
        publishedValues: widgetConfig.publishedValues,
      })
      .from(widget)
      .innerJoin(widgetConfig, eq(widgetConfig.widgetId, widget.id))
      .where(eq(widget.id, widgetId))
      .limit(1);

    if (!row) return null;
    if (row.widgetStatus !== WIDGET_STATUS.active) return null;

    const values = (includeDraft ? row.draftValues : row.publishedValues) as WidgetConfig | null;
    if (!values) return null;

    return { version: row.version, values };
  }

  async getEnvelope(
    widgetId: string,
    options: { includeDraft?: boolean } = {},
  ): Promise<ConfigEnvelope | null> {
    const resolved = await this.resolve(widgetId, options.includeDraft === true);
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
    options: { includeDraft?: boolean } = {},
  ): Promise<{ widgetId: string; version: number } | null> {
    const resolved = await this.resolve(widgetId, options.includeDraft === true);
    if (!resolved) return null;
    return { widgetId, version: resolved.version };
  }
}
