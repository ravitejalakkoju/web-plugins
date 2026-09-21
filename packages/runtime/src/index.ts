import { registerChrome } from './chrome/index.js';
import type { ChromeFactory } from './chrome/types.js';
import type { IdentityEnricher } from './core/IdentityManager.js';
import type { ScriptMeta } from './core/types.js';
import { WidgetHost, type WidgetSdk } from './WidgetHost.js';
import { getScriptMeta } from './utils/getScriptMeta.js';

export const RUNTIME_VERSION = '0.1.0';

export interface WebPluginsGlobal {
  version: string;
  widgets: Record<string, WidgetSdk>;
  get(widgetId: string): WidgetSdk | null;
  mount(meta: ScriptMeta): WidgetSdk | null;
  registerChrome(name: string, factory: ChromeFactory): void;
  registerEnricher(enricher: IdentityEnricher): void;
}

declare global {
  interface Window {
    WebPlugins?: WebPluginsGlobal;
  }
}

const hosts = new Map<string, WidgetHost>();
const enrichers: IdentityEnricher[] = [];

function ensureGlobal(): WebPluginsGlobal {
  if (window.WebPlugins) return window.WebPlugins;

  const global: WebPluginsGlobal = {
    version: RUNTIME_VERSION,
    widgets: {},
    get: (widgetId) => global.widgets[widgetId] ?? null,
    mount: (meta) => mount(meta),
    registerChrome,
    registerEnricher: (enricher) => {
      enrichers.push(enricher);
      for (const host of hosts.values()) host.registerEnricher(enricher);
    },
  };

  window.WebPlugins = global;
  return global;
}

/** Mount one widget. Idempotent per widget id. */
export function mount(meta: ScriptMeta): WidgetSdk | null {
  const global = ensureGlobal();

  const existing = global.widgets[meta.widgetId];
  if (existing) return existing;

  try {
    const host = new WidgetHost(meta);
    for (const enricher of enrichers) host.registerEnricher(enricher);

    const sdk = host.toSdk();
    hosts.set(meta.widgetId, host);
    global.widgets[meta.widgetId] = sdk;

    // Forget a destroyed widget, or the lookup above would keep handing back its
    // dead SDK and the id could never be mounted again.
    host.onDestroy = () => {
      hosts.delete(meta.widgetId);
      delete global.widgets[meta.widgetId];
    };

    // `manual` waits for an explicit init()/ready() from the host page.
    if (meta.mode !== 'manual') void host.init();

    return sdk;
  } catch (error) {
    console.error('[web-plugins] mount failed', error);
    return null;
  }
}

/** Read the `<script>` tag and mount whatever it points at. */
export function bootstrap(): WidgetSdk | null {
  const meta = getScriptMeta();

  if (!meta) {
    console.error(
      '[web-plugins] could not read widget id from the script tag. Expected .../v1/widget.js?id=WIDGET_ID',
    );
    return null;
  }

  return mount(meta);
}

export { WidgetHost, type WidgetSdk } from './WidgetHost.js';
export { WidgetFrame } from './WidgetFrame.js';
export { registerChrome, getChrome } from './chrome/index.js';
export type { ChromeContext, ChromeFactory, ChromeInstance, HostState } from './chrome/types.js';
export type { IdentityEnricher, EnricherContext } from './core/IdentityManager.js';
export type { ResolvedIdentity, RuntimeMode, ScriptMeta } from './core/types.js';
export type { ConfigEnvelope, VersionEnvelope } from '@web-plugins/protocol/config';
export { getScriptMeta } from './utils/getScriptMeta.js';
