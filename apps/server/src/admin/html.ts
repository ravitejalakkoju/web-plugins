import type { AdminState } from '../../admin/types.js';

export interface ShellInput {
  title: string;
  appHtml: string;
  state: AdminState;
  /** Stylesheet and module tags, which differ between dev and the built panel. */
  assetTags: string;
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * `</script>` inside a string literal would close the tag, and `<!--` would open
 * an HTML comment, so both get escaped before the state is inlined.
 */
const serializeState = (state: AdminState): string =>
  JSON.stringify(state)
    .replace(/</g, '\\u003c')
    .replace(/\u2028|\u2029/g, (match) => (match === '\u2028' ? '\\u2028' : '\\u2029'));

export function renderShell({ title, appHtml, state, assetTags }: ShellInput): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${escapeHtml(title)}</title>
${assetTags}
</head>
<body>
<div id="app">${appHtml}</div>
<script>window.__WP_ADMIN__=${serializeState(state)}</script>
</body>
</html>`;
}
