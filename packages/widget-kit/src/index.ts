export { readWidgetMeta, type WidgetMeta } from './meta.js';
export {
  WidgetClient,
  connectWidget,
  getWidgetClient,
  type ConfigEvent,
  type ResolvedIdentity,
  type Unsubscribe,
  type WidgetClientOptions,
} from './client.js';
export type {
  ChromeMode,
  ColorsConfig,
  LauncherConfig,
  PlacementConfig,
  VisibilityConfig,
  WidgetConfig,
} from '@web-plugins/protocol/config';
export { HOST_EVENTS, HOST_METHODS, PROTOCOL_VERSION } from '@web-plugins/protocol/rpc';
