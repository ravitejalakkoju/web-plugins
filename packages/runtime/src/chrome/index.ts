import type { ChromeMode } from '@web-plugins/protocol/config';
import { fabChrome } from './fab.js';
import { modalChrome } from './modal.js';
import { noneChrome } from './none.js';
import { panelChrome } from './panel.js';
import type { ChromeFactory } from './types.js';

/**
 * The lookup that replaces the four webpack entry points. Adding a presentation
 * style is a new entry here, not a new bundle.
 */
const registry = new Map<string, ChromeFactory>([
  ['fab', fabChrome],
  ['panel', panelChrome],
  ['modal', modalChrome],
  ['none', noneChrome],
]);

export function getChrome(mode: ChromeMode | string | undefined): ChromeFactory {
  // Absent is the documented default, so only a name that was actually asked for
  // and not found is worth a warning.
  if (!mode) return fabChrome;

  const factory = registry.get(String(mode));
  if (factory) return factory;

  console.warn(
    `[web-plugins] unknown chrome "${mode}", falling back to "fab". Registered: ${[...registry.keys()].join(', ')}. Call registerChrome() before mounting to add your own.`,
  );
  return fabChrome;
}

/** Register a custom chrome before the host initialises. */
export function registerChrome(name: string, factory: ChromeFactory): void {
  registry.set(name, factory);
}

export * from './types.js';
