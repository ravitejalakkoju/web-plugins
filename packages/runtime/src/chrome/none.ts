import { mountFrame } from './frame.js';
import type { ChromeFactory } from './types.js';

/**
 * No visible chrome. With `src` set the iframe still mounts at zero size, which
 * is how a headless widget (tracking, A/B logic, a custom UI built entirely
 * through RPC) runs. Without `src` the host is just an SDK surface.
 */
export const noneChrome: ChromeFactory = (context) => {
  const frame = mountFrame(context, 'headless');

  if (frame) {
    context.stylesheet.append(`
      .wp-frame--headless {
        position: absolute;
        width: 0;
        height: 0;
        opacity: 0;
        pointer-events: none;
      }
    `);
  }

  return {
    frame,
    destroy() {
      frame?.destroy();
    },
  };
};
