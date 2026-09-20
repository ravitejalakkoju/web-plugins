import type { WidgetConfig } from '@web-plugins/protocol/config';
import { el } from '../utils/dom.js';
import { isMobileViewport } from '../utils/visibility.js';

const CLOSE_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
</svg>`;

/**
 * The nudge pill beside the launcher, ported from `LauncherCallout` in
 * `support.js`. Supports the same three modes: `slide_in`, `expand` and
 * `typing_expand`.
 */
export function createCallout(
  config: WidgetConfig,
  stylesheet: HTMLStyleElement,
  onOpen: () => void,
): HTMLElement | null {
  const callout = config.launcher?.callout;
  const text = callout?.text?.trim();
  if (!callout || !text) return null;

  const show = callout.show ?? { desktop: true, mobile: true };
  if (isMobileViewport() ? !show.mobile : !show.desktop) return null;

  const mode = callout.mode ?? 'slide_in';

  stylesheet.append(`
    .wp-callout {
      position: absolute;
      top: 50%;
      z-index: 2;
      display: flex;
      align-items: center;
      height: 40px;
      transform: translateY(-50%);
      pointer-events: auto;
    }

    .wp-callout[data-hidden="true"] { display: none !important; }
    :host([data-state="expand"]) .wp-callout { display: none; }

    :host([data-align="left"]) .wp-callout { left: 112%; }
    :host([data-align="right"]) .wp-callout { right: 112%; }

    .wp-callout__pill {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 14px 12px 18px;
      border: none;
      border-radius: 999px;
      background: #000;
      color: #fff;
      font-family: var(--wp-font-family, system-ui, sans-serif);
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
      cursor: pointer;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
    }

    .wp-callout__close {
      position: absolute;
      top: -5px;
      right: -5px;
      z-index: 3;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      padding: 0;
      border: 1px solid lightgray;
      border-radius: 50%;
      background: rgb(240, 240, 240);
      color: #000;
      cursor: pointer;
    }

    .wp-callout__close svg { width: 10px; height: 10px; display: block; }

    .wp-callout--slide_in.wp-callout--left .wp-callout__pill { animation: wp-callout-left 1s 1s both; }
    .wp-callout--slide_in.wp-callout--right .wp-callout__pill { animation: wp-callout-right 1s 1s both; }

    .wp-callout--expand .wp-callout__pill,
    .wp-callout--typing_expand .wp-callout__pill { animation: wp-callout-expand 0.6s 0.2s both; }

    .wp-callout--left .wp-callout__pill { transform-origin: left center; }
    .wp-callout--right .wp-callout__pill { transform-origin: right center; }

    .wp-callout__typing { display: inline-flex; gap: 3px; align-items: center; }
    .wp-callout__typing span {
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: currentColor;
      animation: wp-callout-typing 1.2s infinite ease-in-out;
    }
    .wp-callout__typing span:nth-child(2) { animation-delay: 0.15s; }
    .wp-callout__typing span:nth-child(3) { animation-delay: 0.3s; }

    @keyframes wp-callout-left {
      from { opacity: 0; transform: translateX(-12px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    @keyframes wp-callout-right {
      from { opacity: 0; transform: translateX(12px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    @keyframes wp-callout-expand {
      from { opacity: 0; transform: scaleX(0.6); }
      to   { opacity: 1; transform: scaleX(1); }
    }
    @keyframes wp-callout-typing {
      0%, 60%, 100% { opacity: 0.35; transform: translateY(0); }
      30%           { opacity: 1; transform: translateY(-2px); }
    }
  `);

  const align = config.placement?.desktop?.align === 'left' ? 'left' : 'right';
  const wrapper = el('div', {
    classes: ['wp-callout', `wp-callout--${mode}`, `wp-callout--${align}`],
  });

  const pill = el('button', {
    classes: ['wp-callout__pill'],
    attrs: { type: 'button' },
    text,
  });

  if (mode === 'typing_expand') {
    pill.appendChild(
      el('span', {
        classes: ['wp-callout__typing'],
        html: '<span></span><span></span><span></span>',
      }),
    );
  }

  pill.addEventListener('click', () => {
    wrapper.dataset.hidden = 'true';
    onOpen();
  });

  const close = el('button', {
    classes: ['wp-callout__close'],
    attrs: { type: 'button', 'aria-label': 'Dismiss' },
    html: CLOSE_ICON,
  });
  close.addEventListener('click', (event) => {
    event.stopPropagation();
    wrapper.dataset.hidden = 'true';
  });

  wrapper.appendChild(pill);
  wrapper.appendChild(close);
  return wrapper;
}
