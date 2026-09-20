import type { WidgetConfig } from '@web-plugins/protocol/config';
import { contrastColor } from '../utils/color.js';
import { el, sanitizeSvg } from '../utils/dom.js';

const DEFAULT_OPEN_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
</svg>`;

const CLOSE_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
</svg>`;

export interface LauncherButtonOptions {
  config: WidgetConfig;
  stylesheet: HTMLStyleElement;
  /** Swap the icon for a close glyph while the widget is expanded. */
  showCloseWhenOpen: boolean;
  onClick(): void;
}

/**
 * The box that holds the launcher, its tooltip and its callout. Shared by every
 * chrome that shows a launcher, because the three children are positioned against
 * it and would drift apart if each strategy sized it itself.
 */
export function createLauncherShell(stylesheet: HTMLStyleElement): HTMLElement {
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

  return el('div', { classes: ['wp-shell'] });
}

/**
 * The floating action button. Merges the near-identical launcher classes from
 * `whatsapp.js`, `support.js` and `rewards.js` into one config-driven element:
 * `launcher.icon.svg` or `launcher.icon.url` decide the glyph, and the tooltip
 * markup comes from the WhatsApp launcher.
 */
export function createLauncherButton(options: LauncherButtonOptions): HTMLButtonElement {
  const { config, stylesheet } = options;
  const background = config.colors?.primaryColor ?? '#008080';
  const foreground = contrastColor(background);

  stylesheet.append(`
    .wp-launcher {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 56px;
      width: 56px;
      padding: 0;
      border: none;
      border-radius: 100%;
      background: ${background};
      color: ${foreground};
      cursor: pointer;
      overflow: hidden;
      opacity: 0;
      will-change: transform, opacity;
      transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1);
      animation: wp-launcher-in 0.6s cubic-bezier(0.25, 1, 0.5, 1) forwards;
    }

    .wp-launcher:hover { transform: scale(1.05); }
    .wp-launcher:active { transform: scale(0.92); }
    .wp-launcher:focus-visible { outline: 2px solid ${foreground}; outline-offset: 2px; }

    .wp-launcher__icon { display: flex; align-items: center; justify-content: center; }
    .wp-launcher__icon svg { display: block; }
    .wp-launcher__image {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 100%;
      display: block;
    }

    @keyframes wp-launcher-in {
      0%   { transform: scale(0.75); opacity: 0; }
      100% { transform: scale(1); opacity: 1; }
    }

    .wp-tooltip {
      position: absolute;
      bottom: 68px;
      left: 50%;
      transform: translateX(-50%);
      display: none;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 6px;
      background: rgba(0, 0, 0, 0.82);
      color: #fff;
      font-family: var(--wp-font-family, system-ui, sans-serif);
      font-size: 12px;
      white-space: nowrap;
      pointer-events: none;
      transition: opacity 0.3s ease-in-out;
    }

    :host([data-align="left"]) .wp-tooltip { left: 0; transform: none; }
    :host([data-align="right"]) .wp-tooltip { left: auto; right: 0; transform: none; }

    .wp-launcher:hover + .wp-tooltip,
    .wp-launcher:focus-visible + .wp-tooltip { display: flex; }

    :host([data-state="expand"]) .wp-tooltip { display: none !important; }
  `);

  if (options.showCloseWhenOpen) {
    stylesheet.append(`
      :host([data-state="expand"]) .wp-launcher__icon--open,
      :host(:not([data-state="expand"])) .wp-launcher__icon--close { display: none; }
    `);
  }

  const button = el('button', {
    classes: ['wp-launcher'],
    attrs: {
      type: 'button',
      'aria-label': config.launcher?.label ?? config.launcher?.tooltip ?? 'Open widget',
    },
  });

  const customSvg = sanitizeSvg(config.launcher?.icon?.svg);
  const iconUrl = config.launcher?.icon?.url;

  const openIcon = el('span', { classes: ['wp-launcher__icon', 'wp-launcher__icon--open'] });
  if (customSvg) {
    openIcon.innerHTML = customSvg;
  } else if (iconUrl) {
    openIcon.appendChild(
      el('img', { classes: ['wp-launcher__image'], attrs: { src: iconUrl, alt: '' } }),
    );
  } else {
    openIcon.innerHTML = DEFAULT_OPEN_ICON;
  }
  button.appendChild(openIcon);

  if (options.showCloseWhenOpen) {
    button.appendChild(
      el('span', {
        classes: ['wp-launcher__icon', 'wp-launcher__icon--close'],
        html: CLOSE_ICON,
      }),
    );
  }

  button.addEventListener('click', () => options.onClick());
  return button;
}

export function createTooltip(text: string | null | undefined): HTMLElement | null {
  if (!text) return null;
  return el('span', { classes: ['wp-tooltip'], text });
}
