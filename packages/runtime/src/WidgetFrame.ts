import { HOST_EVENTS, PROTOCOL_VERSION } from '@web-plugins/protocol/rpc';
import { RpcHandler, type RpcMethodHandler } from './core/RpcHandler.js';
import { visitorIdentity, type ResolvedIdentity, type RuntimeMode } from './core/types.js';
import { el } from './utils/dom.js';

export type FrameVariant = 'panel' | 'modal' | 'headless';

export interface WidgetFrameOptions {
  widgetId: string;
  src: string;
  mode: RuntimeMode;
  version: number;
  previewToken: string | null;
  variant: FrameVariant;
}

/**
 * The iframe child, ported from `WebExtensionChildFrameElement`. Keeps the
 * `about:blank` reset before (re)loading and the RPC channel to the widget.
 *
 * Two changes: the CSS class is no longer namespaced per widget (each host owns
 * its own shadow root, so `.wp-frame` cannot collide), and the presentation is
 * not here at all. A variant only names the class; the chrome strategy that asked
 * for the frame supplies the rules, so everything about how a modal looks lives
 * in `chrome/modal.ts`.
 */
export class WidgetFrame {
  readonly host: HTMLIFrameElement;
  readonly rpc: RpcHandler;
  private readonly origin: string;
  private loaded = false;

  constructor(
    private readonly options: WidgetFrameOptions,
    stylesheet: HTMLStyleElement,
  ) {
    this.origin = new URL(options.src, window.location.href).origin;

    this.host = el('iframe', {
      classes: ['wp-frame', `wp-frame--${options.variant}`],
      attrs: {
        allow: 'fullscreen; clipboard-write',
        title: 'Web Plugins widget',
      },
    });
    this.host.setAttribute('frameborder', '0');

    stylesheet.append(`
      .wp-frame {
        border: none;
        box-sizing: border-box;
        background: transparent;
      }
    `);

    this.rpc = new RpcHandler({
      widgetId: options.widgetId,
      origin: this.origin,
      getTargetWindow: () => this.host.contentWindow,
    });

    // Plain iframes that never call `ready` still need queued events delivered.
    this.host.addEventListener('load', () => {
      if (!this.host.src || this.host.src.endsWith('about:blank')) return;
      this.loaded = true;
      this.rpc.markReady();
    });

    this.rpc.register('resize', (payload: { height?: number; width?: number } = {}) => {
      if (this.options.variant === 'headless') return false;
      if (typeof payload.height === 'number') this.host.style.height = `${payload.height}px`;
      if (typeof payload.width === 'number') this.host.style.width = `${payload.width}px`;
      return true;
    });
  }

  register(method: string, handler: RpcMethodHandler): void {
    this.rpc.register(method, handler);
  }

  /** Point the iframe at its URL. Resets through `about:blank` on reload. */
  load(): void {
    this.host.src = 'about:blank';
    this.loaded = false;

    window.setTimeout(() => {
      const params = new URLSearchParams({
        id: this.options.widgetId,
        wp: String(PROTOCOL_VERSION),
        mode: this.options.mode,
        version: String(this.options.version),
        sourceUrl: window.location.href,
        referrerUrl: document.referrer || '',
      });
      if (this.options.previewToken) params.set('previewToken', this.options.previewToken);

      const separator = this.options.src.includes('?') ? '&' : '?';
      this.host.src = `${this.options.src}${separator}${params.toString()}`;
    }, 0);
  }

  emit(event: string, payload?: unknown): void {
    this.rpc.emit(event, payload);
  }

  /** The one crossing point for identity, so the redaction cannot be forgotten. */
  onIdentity(identity: ResolvedIdentity | null): void {
    this.rpc.emit(HOST_EVENTS.identity, visitorIdentity(identity));
  }

  destroy(): void {
    this.rpc.destroy();
    this.host.remove();
  }
}
