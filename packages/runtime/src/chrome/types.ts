import type { WidgetConfig } from '@web-plugins/protocol/config';
import type { WidgetFrame } from '../WidgetFrame.js';
import type { RuntimeMode } from '../core/types.js';

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

/**
 * Deliberately two members. Identity and open/close state reach the widget through
 * `frame`, which the host already holds, so a strategy has nothing to forward.
 */
export interface ChromeInstance {
  /** Present when the strategy mounted an iframe. */
  frame: WidgetFrame | null;
  destroy(): void;
}

export type ChromeFactory = (context: ChromeContext) => ChromeInstance;
