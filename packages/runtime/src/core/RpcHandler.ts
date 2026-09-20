import { PROTOCOL_VERSION, isEnvelopeFor, type RpcEnvelope } from '@web-plugins/protocol/rpc';

export type RpcMethodHandler = (...args: any[]) => unknown | Promise<unknown>;

export interface RpcTransport {
  widgetId: string;
  /** Exact origin of the frame. Replies are posted here, never to `'*'`. */
  origin: string;
  getTargetWindow(): Window | null;
}

/**
 * Host side of the host <-> iframe bridge. Keeps the original's handler registry
 * and pre-ready queue; drops the `postMessage(..., '*')` broadcast, the
 * Shopify-specific `add_to_cart` handler (now an adapter concern) and the unused
 * ping/pong diagnostic.
 */
export class RpcHandler {
  private readonly handlers = new Map<string, RpcMethodHandler>();
  private readonly queue: { event: string; payload?: unknown }[] = [];
  private ready = false;
  private destroyed = false;

  constructor(private readonly transport: RpcTransport) {
    this.onMessage = this.onMessage.bind(this);
    window.addEventListener('message', this.onMessage);
  }

  register(name: string, handler: RpcMethodHandler): void {
    this.handlers.set(name, handler);
  }

  /** Called once the frame reports it is listening. Flushes queued events. */
  markReady(): void {
    if (this.ready) return;
    this.ready = true;
    while (this.queue.length) {
      const next = this.queue.shift();
      if (next) this.emit(next.event, next.payload);
    }
  }

  emit(event: string, payload?: unknown): void {
    if (this.destroyed) return;

    if (!this.ready) {
      this.queue.push({ event, payload });
      return;
    }

    this.post({
      wp: PROTOCOL_VERSION,
      widgetId: this.transport.widgetId,
      kind: 'event',
      event,
      payload,
    });
  }

  private post(envelope: RpcEnvelope): void {
    const target = this.transport.getTargetWindow();
    if (!target) return;
    try {
      target.postMessage(envelope, this.transport.origin);
    } catch {
      /* frame may have navigated away */
    }
  }

  private onMessage(event: MessageEvent): void {
    if (this.destroyed) return;
    if (event.origin !== this.transport.origin) return;

    const target = this.transport.getTargetWindow();
    if (!target || event.source !== target) return;
    if (!isEnvelopeFor(event.data, this.transport.widgetId)) return;

    const envelope = event.data;

    if (envelope.kind === 'call') {
      void this.handleCall(envelope.id, envelope.method, envelope.args ?? []);
      return;
    }

    if (envelope.kind === 'event') {
      const handler = this.handlers.get(envelope.event);
      if (!handler) return;
      try {
        void handler(envelope.payload);
      } catch (error) {
        console.error(`[web-plugins] event handler "${envelope.event}" failed`, error);
      }
    }
  }

  private async handleCall(id: string, method: string, args: unknown[]): Promise<void> {
    const handler = this.handlers.get(method);

    if (!handler) {
      this.post({
        wp: PROTOCOL_VERSION,
        widgetId: this.transport.widgetId,
        kind: 'error',
        id,
        error: { message: `unknown method "${method}"`, code: 'UNKNOWN_METHOD' },
      });
      return;
    }

    try {
      const result = await handler(...args);
      this.post({
        wp: PROTOCOL_VERSION,
        widgetId: this.transport.widgetId,
        kind: 'result',
        id,
        result,
      });
    } catch (error) {
      this.post({
        wp: PROTOCOL_VERSION,
        widgetId: this.transport.widgetId,
        kind: 'error',
        id,
        error: { message: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.ready = false;
    this.queue.length = 0;
    this.handlers.clear();
    window.removeEventListener('message', this.onMessage);
  }
}
