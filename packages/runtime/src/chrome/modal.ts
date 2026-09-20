import { el } from '../utils/dom.js';
import { mountFrame } from './frame.js';
import type { ChromeFactory } from './types.js';

/**
 * A centered dialog with a backdrop and no launcher, the shape `popup.js` had.
 * Opening is driven by `launcher.autoOpen` / `launcher.timer` in the host, or by
 * `WebPlugins.get(id).open()`.
 */
export const modalChrome: ChromeFactory = (context) => {
  const { stylesheet, shadow } = context;

  stylesheet.append(`
    .wp-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.25s ease-in-out;
    }

    :host([data-state="expand"]) .wp-backdrop {
      opacity: 1;
      pointer-events: auto;
    }

    .wp-modal-shell {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  `);

  const backdrop = el('div', { classes: ['wp-backdrop'] });
  backdrop.addEventListener('click', () => context.close());
  shadow.appendChild(backdrop);

  const shell = el('div', { classes: ['wp-modal-shell'] });
  shadow.appendChild(shell);

  const frame = mountFrame(context, 'modal', shell);
  if (!frame) console.warn('[web-plugins] chrome "modal" needs config.src to render anything');

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && context.getState() === 'expand') context.close();
  };
  window.addEventListener('keydown', onKeyDown);

  return {
    frame,
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      frame?.destroy();
      backdrop.remove();
      shell.remove();
    },
  };
};
