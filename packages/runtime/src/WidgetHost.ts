import type { PlacementSide, WidgetConfig } from '@web-plugins/protocol/config';
import {
  HOST_EVENTS,
  HOST_METHODS,
  isPreviewConfig,
  type IdentifyPayload,
} from '@web-plugins/protocol/rpc';
import { getChrome } from './chrome/index.js';
import type { ChromeInstance, HostState } from './chrome/types.js';
import { CacheManager } from './core/CacheManager.js';
import { HeartbeatClient } from './core/HeartbeatClient.js';
import { IdentityManager, type IdentityEnricher } from './core/IdentityManager.js';
import type { ConfigEnvelope, ResolvedIdentity, ScriptMeta } from './core/types.js';
import { initGtag, trackGtagEvent } from './utils/analytics.js';
import { SCROLL_LOCK_CLASS, el, ensureScrollLockStyles, loadFontStylesheet } from './utils/dom.js';
import { isMobileViewport, shouldShowByDefault } from './utils/visibility.js';

const DEFAULT_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export interface WidgetSdk {
  readonly id: string;
  readonly mode: ScriptMeta['mode'];
  /** Config version currently rendered, 0 until the first load completes. */
  readonly version: number;
  show(): void;
  hide(): void;
  open(): void;
  close(): void;
  toggle(): void;
  init(): Promise<void>;
  ready(callback?: (sdk: WidgetSdk) => void): Promise<WidgetSdk>;
  track(name: string, props?: Record<string, unknown>): void;
  getConfig(): WidgetConfig | null;
  user: {
    get(): ResolvedIdentity | null;
    set(payload: IdentifyPayload): Promise<ResolvedIdentity | null>;
    clear(): void;
  };
  destroy(): void;
}

/**
 * The single host, ported from `WebExtensionElement`.
 *
 * Kept: the shadow host keyed off a script tag, the `data-visible` /
 * `data-state` / `data-align` attribute contract the CSS hangs off,
 * `showByDefault` from the visibility rules, the config load order, and the
 * failure heartbeat when init throws.
 *
 * Dropped: the abstract `getConfigType()` / `appendStyles()` / `applyConfig()`
 * contract that forced one subclass and one bundle per widget type. Presentation
 * is now `config.chrome`, a lookup.
 */
export class WidgetHost {
  readonly widgetId: string;
  readonly mode: ScriptMeta['mode'];

  private readonly hostElement: HTMLElement;
  private readonly shadow: ShadowRoot;
  private readonly cache: CacheManager;
  private readonly heartbeat: HeartbeatClient;
  private identity: IdentityManager;
  private readonly apiBase: string;
  private readonly previewToken: string | null;

  private stylesheet: HTMLStyleElement | null = null;
  private chrome: ChromeInstance | null = null;
  private config: WidgetConfig | null = null;
  private version = 0;
  private showByDefault = false;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private destroyed = false;
  private readonly pendingEnrichers: IdentityEnricher[] = [];

  /** Why the last `init()` gave up, so `ready()` can reject with the reason. */
  private initError: Error | null = null;
  private previewHandler: ((event: MessageEvent) => void) | null = null;
  /** Set once the editor has pushed config, so a slower fetch cannot undo it. */
  private previewApplied = false;

  /**
   * Called at the end of `destroy()`. `mount()` uses it to drop this widget from
   * the module registry, without the host needing to know a registry exists.
   */
  onDestroy: (() => void) | null = null;

  constructor(meta: ScriptMeta) {
    this.widgetId = meta.widgetId;
    this.mode = meta.mode;
    this.apiBase = meta.apiBase;
    this.previewToken = meta.previewToken;

    // Keyed by widget id, not by widget type, so two widgets coexist on a page.
    const elementId = `wp-widget-${this.widgetId}`;
    const existing = document.getElementById(elementId);
    if (existing) {
      throw new Error(`[web-plugins] widget "${this.widgetId}" is already mounted`);
    }

    this.hostElement = el('div', { id: elementId });
    this.hostElement.dataset.widgetId = this.widgetId;
    this.hostElement.dataset.mode = this.mode;
    this.hostElement.dataset.visible = 'false';
    this.hostElement.dataset.state = 'none';
    document.body.appendChild(this.hostElement);

    this.shadow = this.hostElement.attachShadow({ mode: 'open' });

    this.cache = new CacheManager('wp_config_cache');
    this.heartbeat = new HeartbeatClient(
      `${this.apiBase}/v1/health/heartbeat`,
      this.widgetId,
      this.mode !== 'preview',
    );
    this.identity = new IdentityManager(null);

    if (this.mode === 'preview') this.listenForPreviewConfig();
  }

  // ---- config --------------------------------------------------------------

  private get configUrl(): string {
    const params = new URLSearchParams({ id: this.widgetId });
    if (this.previewToken) params.set('previewToken', this.previewToken);
    return `${this.apiBase}/v1/config?${params.toString()}`;
  }

  private get versionUrl(): string {
    return `${this.apiBase}/v1/config/version?id=${encodeURIComponent(this.widgetId)}`;
  }

  private async loadConfig(): Promise<ConfigEnvelope | null> {
    // Drafts and previews must never be cached, or the panel would show stale
    // values and a published config could be shadowed by a preview.
    if (this.mode === 'preview' || this.previewToken) {
      try {
        const response = await fetch(this.configUrl, { credentials: 'omit' });
        if (!response.ok) return null;
        return (await response.json()) as ConfigEnvelope;
      } catch {
        return null;
      }
    }

    return this.cache.resolve(this.widgetId, this.configUrl, this.versionUrl);
  }

  /** Mount, or re-mount after a config change. */
  async init(): Promise<void> {
    if (this.destroyed) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      this.initError = null;

      try {
        const envelope = await this.loadConfig();
        // The host page can call destroy() while the config request is still out.
        // Without this, a slow response mounts chrome into a detached element.
        if (this.destroyed) return;
        // In preview this fetch is only a first paint. The editor's push is the
        // authority, so a response arriving after one must not undo it.
        if (this.previewApplied) return;

        if (!envelope?.config) {
          const message = `[web-plugins] no config available for widget "${this.widgetId}"`;
          this.heartbeat.send({
            initialized: false,
            visible: false,
            healthStatus: 'CONFIG_INVALID',
            errorCode: 'CONFIG_UNAVAILABLE',
            errorMessage: 'no published config for this widget',
          });
          console.warn(message);
          this.initError = new Error(message);
          return;
        }

        this.maybeEnableIdentity(envelope);
        this.version = envelope.version ?? 0;
        this.heartbeat.setConfigVersion(this.version);
        this.render(envelope.config);
        this.initialized = true;
      } catch (error) {
        this.heartbeat.fail('INIT_FAILED', error);
        console.error('[web-plugins] failed to initialise widget', error);
        this.initError = error instanceof Error ? error : new Error(String(error));
      }
    })();

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  /**
   * Identity is server-gated: the manager stays inert until a config envelope
   * advertises a base URL, so a deploy that turns sessions off never has visitors
   * minting them, and one pointing at a separate identity service is a config
   * change rather than a different bundle.
   */
  private maybeEnableIdentity(envelope: ConfigEnvelope): void {
    const baseUrl = envelope.runtime?.identityBaseUrl;
    if (!baseUrl || this.identity.enabled) return;

    const manager = new IdentityManager(baseUrl);
    manager.onIdentityUpdated = (resolved) => this.chrome?.frame?.onIdentity(resolved);
    for (const enricher of this.pendingEnrichers) manager.registerEnricher(enricher);
    this.identity = manager;

    void manager.initialize().then((resolved) => this.chrome?.frame?.onIdentity(resolved ?? null));
  }

  private render(config: WidgetConfig): void {
    if (this.destroyed) return;

    this.chrome?.destroy();
    this.chrome = null;
    this.stylesheet?.remove();

    this.config = config;
    this.hostElement.dataset.chrome = config.chrome ?? 'fab';
    this.hostElement.dataset.state = 'none';

    this.stylesheet = el('style');
    this.shadow.appendChild(this.stylesheet);
    this.appendHostStyles(config);

    loadFontStylesheet(config.theme?.fontUrl);
    ensureScrollLockStyles();
    if (this.mode !== 'preview') initGtag(config.analytics?.gtagId);

    const factory = getChrome(config.chrome);
    this.chrome = factory({
      widgetId: this.widgetId,
      config,
      mode: this.mode,
      version: this.version,
      previewToken: this.previewToken,
      shadow: this.shadow,
      stylesheet: this.stylesheet,
      align: this.resolveAlign(config),
      open: () => this.open(),
      close: () => this.close(),
      toggle: () => this.toggle(),
      track: (name, props) => this.track(name, props),
      getState: () => (this.hostElement.dataset.state as HostState) ?? 'none',
    });

    this.registerFrameHandlers();

    this.showByDefault = shouldShowByDefault(config.visibility);
    if (this.showByDefault) {
      this.show();
      this.heartbeat.send({ initialized: true, visible: true, healthStatus: 'OK' });
    } else {
      this.heartbeat.send({
        initialized: true,
        visible: false,
        healthStatus: 'HIDDEN_BY_RULES',
      });
    }

    this.scheduleAutoOpen(config);

    const resolvedIdentity = this.identity.getIdentity();
    if (resolvedIdentity) this.chrome.frame?.onIdentity(resolvedIdentity);
  }

  private resolveAlign(config: WidgetConfig): 'left' | 'right' | 'center' {
    if (config.chrome === 'modal') return 'center';
    const side: PlacementSide | undefined = isMobileViewport()
      ? config.placement?.mobile
      : config.placement?.desktop;
    return side?.align ?? 'right';
  }

  private appendHostStyles(config: WidgetConfig): void {
    const desktop = config.placement?.desktop;
    const mobile = config.placement?.mobile ?? desktop;
    const font = config.theme?.fontFamily ?? DEFAULT_FONT_STACK;

    const offsets = (side: PlacementSide | undefined) => ({
      align: side?.align ?? 'right',
      side: side?.values?.side ?? 20,
      bottom: side?.values?.bottom ?? 20,
    });

    const d = offsets(desktop);
    const m = offsets(mobile);

    this.hostElement.dataset.align = this.resolveAlign(config);

    this.stylesheet?.append(`
      :host {
        --wp-font-family: ${font};
        --wp-primary-color: ${config.colors?.primaryColor ?? '#008080'};
        position: fixed;
        z-index: 2147483000;
        display: flex;
        flex-direction: column;
        gap: 16px;
        visibility: hidden;
        font-family: var(--wp-font-family);
        box-sizing: border-box;
      }

      :host([data-visible="true"]) { visibility: visible; }

      :host([data-align="right"]) { align-items: flex-end; right: ${d.side}px; bottom: ${d.bottom}px; }
      :host([data-align="left"]) { align-items: flex-start; left: ${d.side}px; bottom: ${d.bottom}px; }
      :host([data-align="center"]) {
        align-items: center;
        left: 50%;
        bottom: ${d.bottom}px;
        transform: translateX(-50%);
      }

      /* A modal owns the viewport so it can paint a backdrop, so it must not
         swallow clicks while closed. */
      :host([data-chrome="modal"]) {
        inset: 0;
        left: 0;
        right: 0;
        bottom: 0;
        transform: none;
        align-items: center;
        justify-content: center;
        pointer-events: none;
      }

      @media only screen and (max-width: 732px) {
        :host([data-align="right"]) { right: ${m.side}px; bottom: ${m.bottom}px; }
        :host([data-align="left"]) { left: ${m.side}px; bottom: ${m.bottom}px; }
        :host([data-align="center"]) { bottom: ${m.bottom}px; }
        :host([data-chrome="modal"]) { inset: 0; }
      }
    `);
  }

  /** Wire the methods a widget inside the iframe is allowed to call. */
  private registerFrameHandlers(): void {
    const frame = this.chrome?.frame;
    if (!frame) return;

    frame.register(HOST_METHODS.ready, () => {
      frame.rpc.markReady();
      frame.emit(HOST_EVENTS.config, { config: this.config, version: this.version });
      return { widgetId: this.widgetId, version: this.version };
    });
    frame.register(HOST_METHODS.getConfig, () => ({
      config: this.config,
      version: this.version,
    }));
    frame.register(HOST_METHODS.open, () => this.open());
    frame.register(HOST_METHODS.close, () => this.close());
    frame.register(HOST_METHODS.toggle, () => this.toggle());
    frame.register(
      HOST_METHODS.track,
      (payload: { name: string; props?: Record<string, unknown> }) =>
        this.track(payload?.name, payload?.props),
    );
    frame.register(HOST_METHODS.identify, (payload: IdentifyPayload) =>
      this.identity.identify(payload),
    );
    frame.register(HOST_METHODS.clearIdentity, () => {
      this.identity.clear();
      frame.emit(HOST_EVENTS.identity, null);
    });
    frame.register(HOST_METHODS.openUrl, (payload: { url?: string; target?: string }) => {
      if (!payload?.url) return false;
      // Only absolute http(s) URLs: a frame must not be able to drive the host
      // page to a `javascript:` or `data:` URL.
      let target: URL;
      try {
        target = new URL(payload.url, window.location.href);
      } catch {
        return false;
      }
      if (target.protocol !== 'http:' && target.protocol !== 'https:') return false;
      window.open(target.toString(), payload.target ?? '_blank', 'noopener,noreferrer');
      return true;
    });
  }

  private scheduleAutoOpen(config: WidgetConfig): void {
    if (!config.launcher?.autoOpen) return;
    const delayMs = Math.max(0, (config.launcher.timer ?? 0) * 1000);
    window.setTimeout(() => {
      if (this.destroyed) return;
      this.open();
    }, delayMs);
  }

  /** In preview the panel pushes edited config straight in, with no publish. */
  private listenForPreviewConfig(): void {
    this.previewHandler = (event: MessageEvent) => {
      if (this.destroyed) return;
      if (event.source !== window.parent) return;
      if (!isPreviewConfig(event.data)) return;

      this.previewApplied = true;
      this.version = event.data.payload.version ?? this.version;
      this.render(event.data.payload.config);
      this.initialized = true;
    };

    window.addEventListener('message', this.previewHandler);
  }

  // ---- visible state -------------------------------------------------------

  show(): void {
    this.hostElement.dataset.visible = 'true';
    this.track('launcher_displayed');
  }

  hide(): void {
    this.hostElement.dataset.visible = 'false';
  }

  open(): void {
    if (!this.showByDefault) this.show();
    this.hostElement.dataset.state = 'expand';
    if (isMobileViewport()) document.body.classList.add(SCROLL_LOCK_CLASS);
    this.chrome?.frame?.emit(HOST_EVENTS.opened, { openedAt: Date.now() });
    this.track('widget_opened', { url: window.location.href });
  }

  close(): void {
    if (!this.showByDefault) this.hide();
    this.hostElement.dataset.state = 'collapse';
    document.body.classList.remove(SCROLL_LOCK_CLASS);
    this.chrome?.frame?.emit(HOST_EVENTS.closed, { closedAt: Date.now() });
    this.track('widget_closed', { url: window.location.href });
  }

  toggle(): void {
    const state = this.hostElement.dataset.state;
    if (state === 'expand') this.close();
    else this.open();
  }

  track(name: string, props: Record<string, unknown> = {}): void {
    if (!name) return;
    if (this.mode === 'preview') return;

    trackGtagEvent(name, {
      widget_id: this.widgetId,
      chrome: this.config?.chrome,
      ...props,
    });
    void this.identity.trackEvent(this.widgetId, name, props);
  }

  registerEnricher(enricher: IdentityEnricher): void {
    this.pendingEnrichers.push(enricher);
    this.identity.registerEnricher(enricher);
  }

  getConfig(): WidgetConfig | null {
    return this.config;
  }

  toSdk(): WidgetSdk {
    let pending: Promise<void> | null = null;
    const currentVersion = () => this.version;

    /**
     * Resolves only when the widget is actually mounted. An `init()` that gave up
     * - no published config, or a request that threw - settles without mounting
     * anything, so waiting on it alone would report success for a widget that is
     * not on the page.
     */
    const whenReady = (): Promise<void> => {
      if (this.initialized) return Promise.resolve();

      if (!pending) {
        const attempt = this.init().then(() => {
          if (this.initialized) return;
          throw (
            this.initError ??
            new Error(
              `[web-plugins] widget "${this.widgetId}" ${
                this.destroyed ? 'was destroyed before it mounted' : 'did not initialise'
              }`,
            )
          );
        });

        // Don't cache a failure: publishing a config and calling init() again
        // should let a later ready() succeed instead of replaying the old error.
        pending = attempt;
        attempt.catch(() => {
          if (pending === attempt) pending = null;
        });
      }

      return pending;
    };

    const sdk: WidgetSdk = {
      id: this.widgetId,
      mode: this.mode,
      // A getter, not a snapshot: the version changes when config is refetched.
      get version() {
        return currentVersion();
      },
      show: () => this.show(),
      hide: () => this.hide(),
      open: () => this.open(),
      close: () => this.close(),
      toggle: () => this.toggle(),
      init: () => this.init(),
      // Rejects if the widget never mounted, so `.catch()` is the way to find out.
      ready: (callback) =>
        whenReady().then(() => {
          callback?.(sdk);
          return sdk;
        }),
      track: (name, props) => this.track(name, props),
      getConfig: () => this.getConfig(),
      user: {
        get: () => this.identity.getIdentity(),
        set: (payload) => this.identity.identify(payload),
        clear: () => {
          this.identity.clear();
          this.chrome?.frame?.onIdentity(null);
        },
      },
      destroy: () => this.destroy(),
    };

    return sdk;
  }

  destroy(): void {
    this.destroyed = true;
    this.chrome?.destroy();
    this.chrome = null;
    this.identity.destroy();

    if (this.previewHandler) {
      window.removeEventListener('message', this.previewHandler);
      this.previewHandler = null;
    }

    document.body.classList.remove(SCROLL_LOCK_CLASS);
    this.hostElement.remove();
    this.onDestroy?.();
  }
}
