import { el } from '../utils/dom.js';
import { resolveTemplate } from '../utils/template.js';
import { createCallout } from './callout.js';
import { createLauncherButton, createTooltip } from './launcher-button.js';
import type { ChromeFactory } from './types.js';

/**
 * A floating button that runs `launcher.action` on click. This is the shape the
 * old `whatsapp.js` bundle had: no iframe, just a deep link.
 */
export const fabChrome: ChromeFactory = (context) => {
  const { config, stylesheet, shadow } = context;

  if (config.src) {
    console.warn(
      '[web-plugins] chrome "fab" does not mount an iframe; use "panel" or "modal" for config.src',
    );
  }

  stylesheet.append(`
    .wp-shell {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      z-index: 100;
    }
  `);

  const shell = el('div', { classes: ['wp-shell'] });

  const run = () => {
    const action = config.launcher?.action;

    if (action?.type === 'open-url' && action.url) {
      const url = resolveTemplate(action.url, config);
      context.track('launcher_clicked', { url });
      window.open(url, action.target ?? '_blank', 'noopener,noreferrer');
      return;
    }

    context.track('launcher_clicked', {});
    context.open();
  };

  const button = createLauncherButton({
    config,
    stylesheet,
    showCloseWhenOpen: false,
    onClick: run,
  });
  shell.appendChild(button);

  const tooltip = createTooltip(config.launcher?.tooltip);
  if (tooltip) shell.appendChild(tooltip);

  const callout = createCallout(config, stylesheet, run);
  if (callout) shell.appendChild(callout);

  shadow.appendChild(shell);

  return {
    frame: null,
    destroy() {
      shell.remove();
    },
  };
};
