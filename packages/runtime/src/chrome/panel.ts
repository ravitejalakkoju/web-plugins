import { createCallout } from './callout.js';
import { mountFrame } from './frame.js';
import { createLauncherButton, createLauncherShell, createTooltip } from './launcher-button.js';
import type { ChromeFactory } from './types.js';

/**
 * Launcher button plus a side panel iframe, the shape `support.js` and
 * `rewards.js` both had. The launcher stays on top of the panel and flips to a
 * close glyph, so the widget does not have to render its own close control on
 * desktop.
 */
export const panelChrome: ChromeFactory = (context) => {
  const { config, stylesheet, shadow } = context;

  const frame = mountFrame(context, 'panel');
  if (!frame) console.warn('[web-plugins] chrome "panel" needs config.src to render anything');

  const shell = createLauncherShell(stylesheet);

  // On a phone the open panel fills the screen, so the launcher would sit on top
  // of the widget's own UI.
  stylesheet.append(`
    @media only screen and (max-width: 732px) {
      :host([data-state="expand"]) .wp-shell { display: none; }
    }
  `);

  const button = createLauncherButton({
    config,
    stylesheet,
    showCloseWhenOpen: true,
    onClick: () => context.toggle(),
  });
  shell.appendChild(button);

  const tooltip = createTooltip(config.launcher?.tooltip);
  if (tooltip) shell.appendChild(tooltip);

  const callout = createCallout(config, stylesheet, context.align, () => context.open());
  if (callout) shell.appendChild(callout);

  shadow.appendChild(shell);

  return {
    frame,
    destroy() {
      frame?.destroy();
      shell.remove();
    },
  };
};
