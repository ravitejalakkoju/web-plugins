import type { RuntimeMode, ScriptMeta } from '../core/types.js';

const MODES: RuntimeMode[] = ['auto', 'manual', 'preview'];

const parseMode = (value: string | null): RuntimeMode =>
  MODES.includes(value as RuntimeMode) ? (value as RuntimeMode) : 'auto';

/**
 * Derive the API base from the script's own URL, so the same bundle works on any
 * host without a build-time constant. `?api=` overrides it for CDN installs
 * where the script and the control plane live on different origins.
 */
const resolveApiBase = (scriptUrl: URL): string => {
  const override = scriptUrl.searchParams.get('api');
  if (override) return override.replace(/\/+$/, '');

  // ".../v1/widget.js" -> "..."; anything else falls back to the origin.
  const path = scriptUrl.pathname;
  const marker = path.lastIndexOf('/v1/');
  if (marker > -1) return `${scriptUrl.origin}${path.slice(0, marker)}`;
  return scriptUrl.origin;
};

const readFromScript = (script: HTMLScriptElement): ScriptMeta | null => {
  if (!script.src) return null;

  let url: URL;
  try {
    url = new URL(script.src, window.location.href);
  } catch {
    return null;
  }

  const widgetId = url.searchParams.get('id') ?? script.dataset.widgetId ?? null;
  if (!widgetId) return null;

  return {
    widgetId,
    mode: parseMode(url.searchParams.get('mode') ?? script.dataset.mode ?? null),
    apiBase: resolveApiBase(url),
    previewToken: url.searchParams.get('previewToken'),
  };
};

/**
 * Replaces `getExtensionMetaFromScript`. Prefers `document.currentScript` and
 * falls back to scanning, which matters when the tag is injected by a tag
 * manager that defers execution.
 */
export function getScriptMeta(): ScriptMeta | null {
  const current = document.currentScript;
  if (current instanceof HTMLScriptElement) {
    const meta = readFromScript(current);
    if (meta) return meta;
  }

  const candidates = document.querySelectorAll<HTMLScriptElement>('script[src*="widget.js"]');
  for (const script of Array.from(candidates)) {
    const meta = readFromScript(script);
    if (meta) return meta;
  }

  return null;
}
