/**
 * Optional GA4 bridge. The original hardcoded one measurement ID for every
 * install; now nothing loads unless `config.analytics.gtagId` is set.
 */

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const loaded = new Set<string>();

export function initGtag(measurementId: string | null | undefined): void {
  if (!measurementId || loaded.has(measurementId)) return;
  loaded.add(measurementId);

  try {
    window.dataLayer = window.dataLayer || [];
    if (!window.gtag) {
      window.gtag = function gtag(...args: unknown[]) {
        window.dataLayer?.push(args);
      };
    }

    window.gtag('js', new Date());
    window.gtag('config', measurementId, { send_page_view: false });

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(script);
  } catch (error) {
    console.warn('[web-plugins] failed to initialise gtag', error);
  }
}

export function trackGtagEvent(name: string, props: Record<string, unknown>): void {
  try {
    window.gtag?.('event', name, props);
  } catch {
    /* analytics must never break the page */
  }
}
