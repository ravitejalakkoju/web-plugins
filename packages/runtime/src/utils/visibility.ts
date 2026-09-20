import type { DeviceToggles, PageRule, VisibilityConfig } from '@web-plugins/protocol/config';

export const MOBILE_BREAKPOINT = 732;

export const isMobileViewport = (): boolean =>
  typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT;

const matchRule = (rule: PageRule, url: URL): boolean => {
  const path = url.pathname;
  const full = `${url.pathname}${url.search}`;
  const value = rule.value ?? '';

  switch (rule.operator) {
    case 'equals':
      return path === value || full === value;
    case 'contains':
      return full.includes(value);
    case 'starts_with':
      return path.startsWith(value);
    case 'ends_with':
      return path.endsWith(value);
    case 'regex':
      try {
        return new RegExp(value).test(full);
      } catch {
        return false;
      }
    default:
      return false;
  }
};

/**
 * Whether the current page passes the targeting rules. The original only ever
 * compared `pathname` against an exact list; operators are honored now.
 */
export function matchesPage(visibility: VisibilityConfig, href: string): boolean {
  const pages = visibility.pages;
  if (!pages?.specific) return true;
  if (!pages.values?.length) return true;

  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return true;
  }

  return pages.values.some((rule) => matchRule(rule, url));
}

/**
 * Resolve per-device visibility. Port of `extractShowByDevice`, with page rules
 * applied to both device flags exactly as before.
 */
export function resolveVisibility(
  visibility: VisibilityConfig | undefined,
  href: string = window.location.href,
): DeviceToggles {
  if (!visibility || typeof visibility !== 'object') {
    return { desktop: true, mobile: true };
  }

  const onPage = matchesPage(visibility, href);
  return {
    desktop: Boolean(visibility.device?.desktop) && onPage,
    mobile: Boolean(visibility.device?.mobile) && onPage,
  };
}

/** Whether the widget should be shown without an explicit `show()` call. */
export function shouldShowByDefault(
  visibility: VisibilityConfig | undefined,
  href?: string,
): boolean {
  const resolved = resolveVisibility(visibility, href);
  return isMobileViewport() ? resolved.mobile : resolved.desktop;
}
