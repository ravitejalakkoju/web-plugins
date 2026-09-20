import { WidgetFrame } from '../WidgetFrame.js';
import type { ChromeFactory } from './types.js';

/**
 * No visible chrome. With `src` set the iframe still mounts at zero size, which
 * is how a headless widget (tracking, A/B logic, a custom UI built entirely
 * through RPC) runs. Without `src` the host is just an SDK surface.
 */
export const noneChrome: ChromeFactory = (context) => {
  const { config, stylesheet, shadow } = context;

  let frame: WidgetFrame | null = null;

  if (config.src) {
    frame = new WidgetFrame(
      {
        widgetId: context.widgetId,
        src: config.src,
        mode: context.mode,
        version: context.version,
        previewToken: context.previewToken,
        variant: 'headless',
        frame: config.frame,
      },
      stylesheet,
    );
    shadow.appendChild(frame.host);
    frame.load();
  }

  return {
    frame,
    onIdentity(identity) {
      frame?.onIdentity(identity);
    },
    destroy() {
      frame?.destroy();
    },
  };
};
