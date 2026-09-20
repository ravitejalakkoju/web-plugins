/** Everything the host tells a widget through its iframe URL. */
export interface WidgetMeta {
  widgetId: string;
  protocol: number;
  mode: 'auto' | 'manual' | 'preview';
  /** Config version the host had when it loaded this frame. */
  version: number;
  /** URL of the page the widget is embedded in. */
  sourceUrl: string;
  referrerUrl: string;
  previewToken: string | null;
  /** Exact origin to postMessage back to. Never `'*'`. */
  hostOrigin: string;
}

const MODES = ['auto', 'manual', 'preview'] as const;

const originOf = (value: string): string | null => {
  try {
    const { origin } = new URL(value);
    return origin === 'null' ? null : origin;
  } catch {
    return null;
  }
};

/**
 * The host origin is read from `sourceUrl`, with `document.referrer` as a
 * fallback, so replies can target an exact origin. A widget opened directly in a
 * tab has neither, which is the one case where there is no host to talk to.
 */
export function readWidgetMeta(search: string = window.location.search): WidgetMeta {
  const params = new URLSearchParams(search);

  const sourceUrl = params.get('sourceUrl') ?? '';
  const referrerUrl = params.get('referrerUrl') ?? '';
  const mode = params.get('mode');

  return {
    widgetId: params.get('id') ?? '',
    protocol: Number(params.get('wp') ?? '1'),
    mode: MODES.includes(mode as (typeof MODES)[number]) ? (mode as WidgetMeta['mode']) : 'auto',
    version: Number(params.get('version') ?? '0'),
    sourceUrl,
    referrerUrl,
    previewToken: params.get('previewToken'),
    hostOrigin:
      originOf(sourceUrl) ??
      originOf(typeof document === 'undefined' ? '' : document.referrer) ??
      '',
  };
}
