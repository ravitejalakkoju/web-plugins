import type { WidgetConfig } from '@web-plugins/protocol/config';

/**
 * Resolve `{{path}}` placeholders in a config string against the config itself.
 *
 * This is what lets a WhatsApp-style widget be pure config instead of its own
 * bundle: `launcher.action.url` can be
 * `https://wa.me/{{meta.phone|digits}}?text={{launcher.messageTemplate}}`.
 *
 * Values are URL-encoded by default. `|digits` keeps digits only (phone numbers
 * in path segments) and `|raw` interpolates verbatim.
 */

const lookup = (path: string, source: unknown): unknown =>
  path.split('.').reduce<unknown>((value, key) => {
    if (value && typeof value === 'object') return (value as Record<string, unknown>)[key];
    return undefined;
  }, source);

export function resolveTemplate(template: string, config: WidgetConfig): string {
  return template.replace(/\{\{\s*([\w.]+)\s*(?:\|\s*(digits|raw)\s*)?\}\}/g, (_, path, filter) => {
    const value = lookup(String(path), config);
    if (value === undefined || value === null) return '';

    const text = String(value);
    if (filter === 'digits') return text.replace(/\D/g, '');
    if (filter === 'raw') return text;
    return encodeURIComponent(text);
  });
}
