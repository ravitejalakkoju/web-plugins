import { el } from '../utils/dom.js';
import { frameSize, mountFrame } from './frame.js';
import type { ChromeContext, ChromeFactory } from './types.js';

/**
 * Everything a modal looks like, in one file: the host has to stop being a
 * bottom-corner stack, the backdrop has to cover the viewport, and the frame
 * animates from the centre.
 *
 * The `[data-chrome="modal"]` selector is not decoration. The host writes
 * alignment rules as `:host([data-align="..."])`, and a bare `:host` block would
 * lose to them on specificity; matching their shape and arriving later wins.
 */
function appendStyles(context: ChromeContext): void {
  const { height, width } = frameSize(context.config);

  context.stylesheet.append(`
    :host([data-chrome="modal"]) {
      inset: 0;
      transform: none;
      align-items: center;
      justify-content: center;
      /* The host now covers the page, so it must not swallow clicks while closed. */
      pointer-events: none;
    }

    @media only screen and (max-width: 732px) {
      :host([data-chrome="modal"]) { inset: 0; }
    }

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
}

/**
 * A centered dialog with a backdrop and no launcher, the shape `popup.js` had.
 * Opening is driven by `launcher.autoOpen` / `launcher.timer` in the host, or by
 * `WebPlugins.get(id).open()`.
 */
export const modalChrome: ChromeFactory = (context) => {
  const { shadow } = context;

  appendStyles(context);

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
