import type { VisitorIdentity } from '@web-plugins/protocol/rpc';

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

/**
 * The frame-facing identity plus the bearer token, which stays on the host side:
 * see `visitorIdentity` for what actually crosses into an iframe.
 */
export interface ResolvedIdentity extends VisitorIdentity {
  token: string;
}

/** Strip the session token, leaving what a widget is allowed to see. */
export function visitorIdentity(identity: ResolvedIdentity | null): VisitorIdentity | null {
  if (!identity) return null;
  const { token: _token, ...visible } = identity;
  return visible;
}
