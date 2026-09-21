import {
  HOST_EVENTS,
  HOST_METHODS,
  PROTOCOL_VERSION,
  isEnvelopeFor,
  type IdentifyPayload,
  type RpcEnvelope,
  type VisitorIdentity,
} from '@web-plugins/protocol/rpc';
import type { WidgetConfig } from '@web-plugins/protocol/config';
import { readWidgetMeta, type WidgetMeta } from './meta.js';

export interface ConfigEvent {
  config: WidgetConfig;
  version: number;
}

export type Unsubscribe = () => void;

export interface WidgetClientOptions {
  /** Milliseconds to wait for the host's `ready` reply before giving up. */
  timeoutMs?: number;
  /** Ask the host to match the document height automatically. */
  autoResize?: boolean;
}

const DEFAULT_TIMEOUT = 8000;

interface Pending {
  resolve(value: unknown): void;
  reject(reason: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * The iframe half of the bridge. A widget author's entire contract with the host
 * is this object: config in, commands out.
 *
 * Messages are only accepted from the host origin the URL declared, and are only
 * posted to that same origin, so a widget embedded on one site cannot be driven
 * by a page on another.
 */
export class WidgetClient {
  readonly meta: WidgetMeta;

  private config: WidgetConfig | null = null;
  private version = 0;
  private identity: VisitorIdentity | null = null;

  private readonly pending = new Map<string, Pending>();
  private readonly listeners = new Map<string, Set<(payload: unknown) => void>>();
  private readonly timeoutMs: number;

  private sequence = 0;
  private connected = false;
  private destroyed = false;
  private resizeCleanup: Unsubscribe | null = null;
  private lastSentHeight = 0;

  constructor(private readonly options: WidgetClientOptions = {}) {
    this.meta = readWidgetMeta();
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT;
    this.onMessage = this.onMessage.bind(this);
    window.addEventListener('message', this.onMessage);
  }

  get isEmbedded(): boolean {
    return window.parent !== window && this.meta.hostOrigin !== '';
  }

  get currentConfig(): WidgetConfig | null {
    return this.config;
  }

  get configVersion(): number {
    return this.version;
  }

  get currentIdentity(): VisitorIdentity | null {
    return this.identity;
  }

  // ---- transport -----------------------------------------------------------

  private post(envelope: RpcEnvelope): void {
    if (!this.isEmbedded) return;
    window.parent.postMessage(envelope, this.meta.hostOrigin);
  }

  private onMessage(event: MessageEvent): void {
    if (this.destroyed) return;
    if (event.source !== window.parent) return;
    if (event.origin !== this.meta.hostOrigin) return;
    if (!isEnvelopeFor(event.data, this.meta.widgetId)) return;

    const envelope = event.data;

    if (envelope.kind === 'result' || envelope.kind === 'error') {
      const pending = this.pending.get(envelope.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(envelope.id);

      if (envelope.kind === 'error') pending.reject(new Error(envelope.error.message));
      else pending.resolve(envelope.result);
      return;
    }

    if (envelope.kind === 'event') {
      this.receive(envelope.event, envelope.payload);
    }
  }

  private receive(event: string, payload: unknown): void {
    if (event === HOST_EVENTS.config) {
      const next = payload as ConfigEvent | undefined;
      if (next?.config) {
        this.config = next.config;
        this.version = next.version ?? 0;
      }
    }

    if (event === HOST_EVENTS.identity) {
      this.identity = (payload as VisitorIdentity | null) ?? null;
    }

    for (const listener of this.listeners.get(event) ?? []) {
      try {
        listener(payload);
      } catch (error) {
        console.error(`[widget-kit] listener for "${event}" threw`, error);
      }
    }
  }

  /** Call a host method and wait for its reply. */
  call<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
    if (!this.isEmbedded) {
      return Promise.reject(new Error('widget is not embedded in a Web Plugins host'));
    }

    const id = `${this.meta.widgetId}:${++this.sequence}`;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`host did not answer "${method}" within ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });

      this.post({
        wp: PROTOCOL_VERSION,
        widgetId: this.meta.widgetId,
        kind: 'call',
        id,
        method,
        args,
      });
    });
  }

  /** Fire and forget, for events the host does not answer. */
  emit(event: string, payload?: unknown): void {
    this.post({
      wp: PROTOCOL_VERSION,
      widgetId: this.meta.widgetId,
      kind: 'event',
      event,
      payload,
    });
  }

  on(event: string, listener: (payload: unknown) => void): Unsubscribe {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener);
    this.listeners.set(event, set);
    return () => set.delete(listener);
  }

  onConfig(listener: (event: ConfigEvent) => void): Unsubscribe {
    return this.on(HOST_EVENTS.config, (payload) => listener(payload as ConfigEvent));
  }

  onIdentity(listener: (identity: VisitorIdentity | null) => void): Unsubscribe {
    return this.on(HOST_EVENTS.identity, (payload) =>
      listener((payload as VisitorIdentity | null) ?? null),
    );
  }

  // ---- lifecycle -----------------------------------------------------------

  /**
   * Announce the widget and pull the current config. The host replies to `ready`
   * and immediately pushes a `config` event, so one round trip is enough.
   */
  async connect(): Promise<ConfigEvent> {
    if (!this.isEmbedded) throw new Error('widget is not embedded in a Web Plugins host');

    if (!this.connected) {
      this.connected = true;
      await this.call(HOST_METHODS.ready);
    }

    if (!this.config) {
      const envelope = await this.call<ConfigEvent>(HOST_METHODS.getConfig);
      this.config = envelope?.config ?? null;
      this.version = envelope?.version ?? 0;
    }

    if (this.options.autoResize) this.autoResize();

    return { config: this.config as WidgetConfig, version: this.version };
  }

  open(): Promise<unknown> {
    return this.call(HOST_METHODS.open);
  }

  close(): Promise<unknown> {
    return this.call(HOST_METHODS.close);
  }

  toggle(): Promise<unknown> {
    return this.call(HOST_METHODS.toggle);
  }

  resize(height: number, width?: number): Promise<unknown> {
    return this.call(HOST_METHODS.resize, { height: Math.ceil(height), width });
  }

  /**
   * Keep the iframe as tall as its content. Panel and modal chromes have fixed
   * frame sizes, so this is mainly for inline embeds.
   */
  autoResize(target: Element = document.documentElement): Unsubscribe {
    this.resizeCleanup?.();

    const send = () => {
      const height = Math.ceil(target.getBoundingClientRect().height);
      // Sub-pixel jitter would otherwise produce a message per frame.
      if (height <= 0 || Math.abs(height - this.lastSentHeight) < 2) return;
      this.lastSentHeight = height;
      void this.resize(height).catch(() => undefined);
    };

    const observer = new ResizeObserver(send);
    observer.observe(target);
    send();

    this.resizeCleanup = () => observer.disconnect();
    return this.resizeCleanup;
  }

  track(name: string, props: Record<string, unknown> = {}): Promise<unknown> {
    return this.call(HOST_METHODS.track, { name, props });
  }

  identify(payload: IdentifyPayload): Promise<unknown> {
    return this.call(HOST_METHODS.identify, payload);
  }

  clearIdentity(): Promise<unknown> {
    return this.call(HOST_METHODS.clearIdentity);
  }

  /** Open a URL on the host page. The host rejects anything but http(s). */
  openUrl(url: string, target: '_blank' | '_self' = '_blank'): Promise<unknown> {
    return this.call(HOST_METHODS.openUrl, { url, target });
  }

  destroy(): void {
    this.destroyed = true;
    this.resizeCleanup?.();
    this.resizeCleanup = null;

    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('widget client destroyed'));
    }
    this.pending.clear();
    this.listeners.clear();
    window.removeEventListener('message', this.onMessage);
  }
}

let singleton: WidgetClient | null = null;

/** One client per frame. Calling this twice returns the same instance. */
export function getWidgetClient(options?: WidgetClientOptions): WidgetClient {
  singleton ??= new WidgetClient(options);
  return singleton;
}

/** Shorthand for the common case: connect and hand back config plus client. */
export async function connectWidget(
  options?: WidgetClientOptions,
): Promise<{ client: WidgetClient; config: WidgetConfig; version: number }> {
  const client = getWidgetClient(options);
  const { config, version } = await client.connect();
  return { client, config, version };
}
