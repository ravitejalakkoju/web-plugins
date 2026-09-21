import { createCallout } from './callout.js';
import { frameSize, mountFrame } from './frame.js';
import { createLauncherButton, createLauncherShell, createTooltip } from './launcher-button.js';
import type { ChromeContext, ChromeFactory } from './types.js';

/**
 * The panel's own presentation: a sheet that scales up from the launcher, and on a
 * phone takes the whole screen. `max-height` and `max-width` do the animating
 * rather than `height`, so the iframe never reflows its contents mid-transition.
 */
function appendStyles(context: ChromeContext): void {
  const { height, width } = frameSize(context.config);
  const position = context.config.frame?.position ?? 'absolute';

  context.stylesheet.append(`
    .wp-frame--panel {
      position: ${position};
      /* Sits above the 56px launcher instead of covering it, so the launcher
         can act as the close control on desktop. */
      ${position === 'absolute' ? 'bottom: 72px; z-index: 99;' : ''}
      width: calc(100vw - 40px);
      height: ${height}px;
      max-height: 0;
      max-width: 0;
      border-radius: 10px;
      opacity: 0;
      transform: scale(0);
      transform-origin: bottom center;
      animation-duration: 0.28s;
      animation-fill-mode: forwards;
      box-shadow: 0 0 80px 0 rgba(0, 0, 0, 0.12);
      pointer-events: none;
    }

    :host([data-align="right"]) .wp-frame--panel { right: 0; transform-origin: bottom right; }
    :host([data-align="left"]) .wp-frame--panel { left: 0; transform-origin: bottom left; }

    :host([data-state="expand"]) .wp-frame--panel {
      animation-name: wp-panel-in;
      pointer-events: auto;
    }

    :host([data-state="collapse"]) .wp-frame--panel {
      animation-name: wp-panel-out;
      pointer-events: none;
    }

    @keyframes wp-panel-in {
      0%   { opacity: 0; max-height: ${Math.round(height * 0.9)}px; max-width: ${width}px; transform: scale(0); }
      100% { opacity: 1; max-height: ${height}px; max-width: ${width}px; transform: scale(1); }
    }

    @keyframes wp-panel-out {
      from { opacity: 1; max-height: ${height}px; max-width: ${width}px; transform: scale(1); }
      to   { opacity: 0; max-height: ${Math.round(height * 0.9)}px; max-width: ${width}px; transform: scale(0); }
    }

    @media only screen and (max-width: 732px) {
      .wp-frame--panel {
        position: fixed;
        inset: 0;
        bottom: env(safe-area-inset-bottom, 0);
        z-index: 99999;
        border-radius: 0;
        width: 100vw;
        height: 100dvh;
      }

      /* The open panel fills the screen, so the launcher would sit on top of the
         widget's own UI. */
      :host([data-state="expand"]) .wp-shell { display: none; }

      @keyframes wp-panel-in {
        0%   { opacity: 0; max-width: 100vw; max-height: 96vh; transform: scale(0); }
        100% { opacity: 1; max-width: 100vw; max-height: 100vh; transform: scale(1); }
      }

      @keyframes wp-panel-out {
        from { opacity: 1; max-width: 100vw; max-height: 100vh; transform: scale(1); }
        to   { opacity: 0; max-width: 100vw; max-height: 96vh; transform: scale(0); }
      }
    }
  `);
}

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

  appendStyles(context);

  const shell = createLauncherShell(stylesheet);

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
