import { WidgetFrame } from '../WidgetFrame.js';
import { el } from '../utils/dom.js';
import { createCallout } from './callout.js';
import { createLauncherButton, createTooltip } from './launcher-button.js';
import type { ChromeFactory } from './types.js';

/**
 * Launcher button plus a side panel iframe, the shape `support.js` and
 * `rewards.js` both had. The launcher stays on top of the panel and flips to a
 * close glyph, so the widget does not have to render its own close control on
 * desktop.
 */
export const panelChrome: ChromeFactory = (context) => {
  const { config, stylesheet, shadow } = context;

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

    @media only screen and (max-width: 732px) {
      :host([data-state="expand"]) .wp-shell { display: none; }
    }
  `);

  let frame: WidgetFrame | null = null;

  if (config.src) {
    frame = new WidgetFrame(
      {
        widgetId: context.widgetId,
        src: config.src,
        mode: context.mode,
        version: context.version,
        previewToken: context.previewToken,
        variant: 'panel',
        frame: config.frame,
      },
      stylesheet,
    );
    shadow.appendChild(frame.host);
    frame.load();
  } else {
    console.warn('[web-plugins] chrome "panel" needs config.src to render anything');
  }

  const shell = el('div', { classes: ['wp-shell'] });

  const button = createLauncherButton({
    config,
    stylesheet,
    showCloseWhenOpen: true,
    onClick: () => context.toggle(),
  });
  shell.appendChild(button);

  const tooltip = createTooltip(config.launcher?.tooltip);
  if (tooltip) shell.appendChild(tooltip);

  const callout = createCallout(config, stylesheet, () => context.open());
  if (callout) shell.appendChild(callout);

  shadow.appendChild(shell);

  return {
    frame,
    onIdentity(identity) {
      frame?.onIdentity(identity);
    },
    destroy() {
      frame?.destroy();
      shell.remove();
    },
  };
};
