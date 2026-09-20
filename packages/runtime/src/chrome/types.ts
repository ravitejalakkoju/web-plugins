import type { WidgetConfig } from '@web-plugins/protocol/config';
import type { WidgetFrame } from '../WidgetFrame.js';
import type { ResolvedIdentity, RuntimeMode } from '../core/types.js';

export type HostState = 'none' | 'expand' | 'collapse';

/** What a chrome strategy is handed when it mounts. */
export interface ChromeContext {
  widgetId: string;
  config: WidgetConfig;
  mode: RuntimeMode;
  version: number;
  previewToken: string | null;
  shadow: ShadowRoot;
  stylesheet: HTMLStyleElement;
  /** Alignment resolved for the current viewport. */
  align: 'left' | 'right' | 'center';
  open(): void;
  close(): void;
  toggle(): void;
  track(name: string, props?: Record<string, unknown>): void;
  getState(): HostState;
}

export interface ChromeInstance {
  /** Present when the strategy mounted an iframe. */
  frame: WidgetFrame | null;
  onIdentity?(identity: ResolvedIdentity | null): void;
  onStateChange?(state: HostState): void;
  destroy(): void;
}

export type ChromeFactory = (context: ChromeContext) => ChromeInstance;
