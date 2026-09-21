/**
 * Host <-> iframe message contract.
 *
 * Every message carries `wp` (protocol version) and `widgetId`, so several
 * widgets can share a page without reading each other's traffic. Replies are
 * always posted to the frame's exact origin, never `'*'`.
 */

import type { WidgetConfig } from '../config/types.js';

export const PROTOCOL_VERSION = 1 as const;

export type ProtocolVersion = typeof PROTOCOL_VERSION;

interface EnvelopeBase {
  wp: ProtocolVersion;
  widgetId: string;
}

/** Frame asks the host to run a method and waits for a result. */
export interface RpcCall extends EnvelopeBase {
  kind: 'call';
  id: string;
  method: string;
  args?: unknown[];
}

export interface RpcResult extends EnvelopeBase {
  kind: 'result';
  id: string;
  result?: unknown;
}

export interface RpcError extends EnvelopeBase {
  kind: 'error';
  id: string;
  error: { message: string; code?: string };
}

/** Fire and forget, in either direction. */
export interface RpcEvent extends EnvelopeBase {
  kind: 'event';
  event: string;
  payload?: unknown;
}

export type RpcEnvelope = RpcCall | RpcResult | RpcError | RpcEvent;

/** Methods the host exposes to the frame. */
export const HOST_METHODS = {
  ready: 'ready',
  open: 'open',
  close: 'close',
  toggle: 'toggle',
  resize: 'resize',
  getConfig: 'get_config',
  track: 'track',
  identify: 'identify',
  clearIdentity: 'clear_identity',
  openUrl: 'open_url',
} as const;

export type HostMethod = (typeof HOST_METHODS)[keyof typeof HOST_METHODS];

/** Events the host pushes to the frame. */
export const HOST_EVENTS = {
  config: 'config',
  opened: 'opened',
  closed: 'closed',
  identity: 'identity',
} as const;

export type HostEvent = (typeof HOST_EVENTS)[keyof typeof HOST_EVENTS];

export interface ResizePayload {
  height?: number;
  width?: number;
}

export interface TrackPayload {
  name: string;
  props?: Record<string, unknown>;
}

export interface IdentifyPayload {
  externalId?: string;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  meta?: Record<string, unknown>;
}

/**
 * Payload of the `identity` event: who the host believes the visitor is.
 *
 * Deliberately without the session token. The token is a bearer credential for
 * `/v1/sessions`, and `src` can point at anything the operator types, so the
 * frame gets an id it can correlate on and nothing it can act with.
 */
export interface VisitorIdentity {
  /** The visitor session this identity belongs to. */
  visitorId?: string;
  externalId?: string;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  meta?: Record<string, unknown>;
}

/**
 * Admin panel -> preview runtime. Not an `RpcEnvelope`: it crosses from the panel
 * page into the preview iframe's host rather than between a host and its widget,
 * so it carries no `widgetId` and expects no reply.
 *
 * It lives here so the panel and the runtime cannot drift apart on a string.
 */
export const PREVIEW_EVENTS = {
  config: 'preview:config',
} as const;

export interface PreviewConfigMessage {
  wp: ProtocolVersion;
  event: typeof PREVIEW_EVENTS.config;
  payload: { config: WidgetConfig; version: number };
}

export function previewConfigMessage(config: WidgetConfig, version: number): PreviewConfigMessage {
  return { wp: PROTOCOL_VERSION, event: PREVIEW_EVENTS.config, payload: { config, version } };
}

export function isPreviewConfig(data: unknown): data is PreviewConfigMessage {
  if (!data || typeof data !== 'object') return false;
  const candidate = data as Partial<PreviewConfigMessage>;
  if (candidate.wp !== PROTOCOL_VERSION) return false;
  if (candidate.event !== PREVIEW_EVENTS.config) return false;
  return Boolean(candidate.payload && typeof candidate.payload.config === 'object');
}

export function isRpcEnvelope(data: unknown): data is RpcEnvelope {
  if (!data || typeof data !== 'object') return false;
  const candidate = data as Partial<RpcEnvelope>;
  if (candidate.wp !== PROTOCOL_VERSION) return false;
  if (typeof candidate.widgetId !== 'string') return false;
  return (
    candidate.kind === 'call' ||
    candidate.kind === 'result' ||
    candidate.kind === 'error' ||
    candidate.kind === 'event'
  );
}

export function isEnvelopeFor(data: unknown, widgetId: string): data is RpcEnvelope {
  return isRpcEnvelope(data) && data.widgetId === widgetId;
}
