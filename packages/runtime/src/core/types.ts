import type { WidgetConfig } from '@web-plugins/protocol/config';

export type RuntimeMode = 'auto' | 'manual' | 'preview';

/** Everything the boot script can learn from its own `<script>` tag. */
export interface ScriptMeta {
  widgetId: string;
  mode: RuntimeMode;
  /** Origin (plus optional path prefix) the config and heartbeat live under. */
  apiBase: string;
  /** Short-lived token that lets the panel render an unpublished draft. */
  previewToken: string | null;
}

/** Server-supplied settings that are not part of the widget's own config. */
export interface RuntimeOptions {
  /** Base URL of a session/identity service. Absent disables visitor identity. */
  identityBaseUrl?: string | null;
  protocol?: number;
}

/** Response shape of `GET /v1/config`. */
export interface ConfigEnvelope {
  widgetId: string;
  version: number;
  config: WidgetConfig;
  runtime?: RuntimeOptions;
}

export interface VersionEnvelope {
  widgetId: string;
  version: number;
}

export interface ResolvedIdentity {
  token: string;
  externalId?: string;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  meta?: Record<string, unknown>;
}
