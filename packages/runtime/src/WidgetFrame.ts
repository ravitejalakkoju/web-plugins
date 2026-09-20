import type { FrameConfig } from '@web-plugins/protocol/config';
import { HOST_EVENTS, PROTOCOL_VERSION } from '@web-plugins/protocol/rpc';
import { RpcHandler, type RpcMethodHandler } from './core/RpcHandler.js';
import type { ResolvedIdentity, RuntimeMode } from './core/types.js';
import { el } from './utils/dom.js';

export type FrameVariant = 'panel' | 'modal' | 'headless';

export interface WidgetFrameOptions {
  widgetId: string;
  src: string;
  mode: RuntimeMode;
  version: number;
  previewToken: string | null;
  variant: FrameVariant;
  frame?: FrameConfig;
}

/**
 * The iframe child, ported from `WebExtensionChildFrameElement`. Keeps the
 * expand/collapse animation, the full-screen mobile treatment and the
 * `about:blank` reset before (re)loading.
 *
 * Two changes: the CSS class is no longer namespaced per widget (each host owns
 * its own shadow root, so `.wp-frame` cannot collide), and the panel/modal
 * animations that used to live in separate launcher bundles are variants here.
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

    this.appendStyles(stylesheet);

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

  private appendStyles(stylesheet: HTMLStyleElement): void {
    const height = this.options.frame?.height ?? 600;
    const width = this.options.frame?.width ?? 384;

    stylesheet.append(`
      .wp-frame {
        border: none;
        box-sizing: border-box;
        background: transparent;
      }
    `);

    if (this.options.variant === 'headless') {
      stylesheet.append(`
        .wp-frame--headless {
          position: absolute;
          width: 0;
          height: 0;
          opacity: 0;
          pointer-events: none;
        }
      `);
      return;
    }

    if (this.options.variant === 'modal') {
      stylesheet.append(`
        .wp-frame--modal {
          position: relative;
          width: min(${width}px, calc(100vw - 32px));
          height: min(${height}px, calc(100vh - 32px));
          border-radius: 12px;
          overflow: hidden;
          opacity: 0;
          transform: scale(0.4);
          transform-origin: center;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.16);
          animation-duration: 0.3s;
          animation-fill-mode: forwards;
          pointer-events: none;
        }

        :host([data-state="expand"]) .wp-frame--modal {
          animation-name: wp-modal-in;
          pointer-events: auto;
        }

        :host([data-state="collapse"]) .wp-frame--modal {
          animation-name: wp-modal-out;
          pointer-events: none;
        }

        @keyframes wp-modal-in {
          0%   { opacity: 0; transform: scale(0.4); }
          100% { opacity: 1; transform: scale(1); }
        }

        @keyframes wp-modal-out {
          0%   { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.4); }
        }
      `);
      return;
    }

    const position = this.options.frame?.position ?? 'absolute';

    stylesheet.append(`
      .wp-frame--panel {
        position: ${position};
        /* Sits above the 56px launcher instead of covering it, so the launcher
           can act as the close control on desktop. */
        ${position === 'absolute' ? 'bottom: 72px; z-index: 99;' : ''}
        width: calc(100vw - 40px);
        height: ${height}px;
        max-height: 0;
        max-width: 0;
        border-radius: 10px;
        opacity: 0;
        transform: scale(0);
        transform-origin: bottom center;
        animation-duration: 0.28s;
        animation-fill-mode: forwards;
        box-shadow: 0 0 80px 0 rgba(0, 0, 0, 0.12);
        pointer-events: none;
      }

      :host([data-align="right"]) .wp-frame--panel { right: 0; transform-origin: bottom right; }
      :host([data-align="left"]) .wp-frame--panel { left: 0; transform-origin: bottom left; }

      :host([data-state="expand"]) .wp-frame--panel {
        animation-name: wp-panel-in;
        pointer-events: auto;
      }

      :host([data-state="collapse"]) .wp-frame--panel {
        animation-name: wp-panel-out;
        pointer-events: none;
      }

      @keyframes wp-panel-in {
        0%   { opacity: 0; max-height: ${Math.round(height * 0.9)}px; max-width: ${width}px; transform: scale(0); }
        100% { opacity: 1; max-height: ${height}px; max-width: ${width}px; transform: scale(1); }
      }

      @keyframes wp-panel-out {
        from { opacity: 1; max-height: ${height}px; max-width: ${width}px; transform: scale(1); }
        to   { opacity: 0; max-height: ${Math.round(height * 0.9)}px; max-width: ${width}px; transform: scale(0); }
      }

      @media only screen and (max-width: 732px) {
        .wp-frame--panel {
          position: fixed;
          inset: 0;
          bottom: env(safe-area-inset-bottom, 0);
          z-index: 99999;
          border-radius: 0;
          width: 100vw;
          height: 100dvh;
        }

        @keyframes wp-panel-in {
          0%   { opacity: 0; max-width: 100vw; max-height: 96vh; transform: scale(0); }
          100% { opacity: 1; max-width: 100vw; max-height: 100vh; transform: scale(1); }
        }

        @keyframes wp-panel-out {
          from { opacity: 1; max-width: 100vw; max-height: 100vh; transform: scale(1); }
          to   { opacity: 0; max-width: 100vw; max-height: 96vh; transform: scale(0); }
        }
      }
    `);
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

  onIdentity(identity: ResolvedIdentity | null): void {
    this.rpc.emit(HOST_EVENTS.identity, identity);
  }

  destroy(): void {
    this.rpc.destroy();
    this.host.remove();
  }
}
