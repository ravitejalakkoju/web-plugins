import type { WidgetConfig } from '@web-plugins/protocol/config';
import { WidgetFrame, type FrameVariant } from '../WidgetFrame.js';
import type { ChromeContext } from './types.js';

/**
 * Frame dimensions with their defaults applied, shared so the panel and the modal
 * cannot disagree about how big an unconfigured frame is.
 */
export function frameSize(config: WidgetConfig): { height: number; width: number } {
  return { height: config.frame?.height ?? 600, width: config.frame?.width ?? 384 };
}

/**
 * Mount the iframe for a chrome strategy, or return null when the widget has no
 * `src` and is therefore host-only.
 *
 * Every option but the variant is the same for every strategy, so this is the one
 * place that knows which parts of the host a frame needs. A strategy that later
 * wants a different frame shape adds a variant rather than its own construction.
 */
export function mountFrame(
  context: ChromeContext,
  variant: FrameVariant,
  parent: ParentNode = context.shadow,
): WidgetFrame | null {
  const { config } = context;
  if (!config.src) return null;

  const frame = new WidgetFrame(
    {
      widgetId: context.widgetId,
      src: config.src,
      mode: context.mode,
      version: context.version,
      previewToken: context.previewToken,
      variant,
    },
    context.stylesheet,
  );

  parent.appendChild(frame.host);
  frame.load();
  return frame;
}
