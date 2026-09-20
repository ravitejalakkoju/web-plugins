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
  return registry.get(String(mode)) ?? fabChrome;
}

/** Register a custom chrome before the host initialises. */
export function registerChrome(name: string, factory: ChromeFactory): void {
  registry.set(name, factory);
}

export * from './types.js';
