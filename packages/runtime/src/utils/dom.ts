export interface ElementOptions {
  id?: string;
  classes?: string[];
  html?: string;
  text?: string;
  attrs?: Record<string, string>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.id) node.id = options.id;
  if (options.classes?.length) node.classList.add(...options.classes);
  if (options.text) node.textContent = options.text;
  if (options.html !== undefined) node.innerHTML = options.html;
  if (options.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) node.setAttribute(key, value);
  }
  return node;
}

/** Strip anything script-like before injecting author-supplied SVG markup. */
export function sanitizeSvg(markup: string | null | undefined): string | null {
  if (!markup) return null;
  const trimmed = markup.trim();
  if (!/^<svg[\s\S]*<\/svg>$/i.test(trimmed)) return null;
  if (/<script|on\w+\s*=|javascript:/i.test(trimmed)) return null;
  return trimmed;
}

const SCROLL_LOCK_STYLE_ID = 'wp-scroll-lock-style';
export const SCROLL_LOCK_CLASS = 'wp-scroll-lock';

/** Stop the host page scrolling behind a full-screen mobile panel. */
export function ensureScrollLockStyles(): void {
  if (document.getElementById(SCROLL_LOCK_STYLE_ID)) return;

  const style = el('style', { id: SCROLL_LOCK_STYLE_ID });
  style.textContent = `
    body.${SCROLL_LOCK_CLASS} {
      overflow: hidden !important;
      height: 100vh !important;
      touch-action: none !important;
      overscroll-behavior: contain !important;
    }
  `;
  document.head.appendChild(style);
}

/** Load a webfont stylesheet once per URL. Replaces the hardcoded Poppins link. */
export function loadFontStylesheet(href: string | null | undefined): void {
  if (!href) return;
  if (document.querySelector(`link[data-wp-font="${CSS.escape(href)}"]`)) return;

  const link = el('link', { attrs: { rel: 'stylesheet', href } });
  link.dataset.wpFont = href;
  document.head.appendChild(link);
}
