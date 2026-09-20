# @web-plugins/runtime

The browser half of [Web Plugins](../../README.md): one script that mounts any configured widget.
It is what the server serves as `/v1/widget.js`.

MIT licensed. No dependencies at runtime.

## Install

One tag, on the host page. It never changes when the widget does.

```html
<script src="https://widgets.example.com/v1/widget.js?id=Ab3xK9pQ7r2m" async></script>
```

The script reads its own `src` to learn the widget id and the API base, so the same bytes work against
any host. Query parameters: `mode` (`auto`, `manual`, `preview`), `previewToken`, and `api` to override
the derived base URL.

## What it does

1. Creates a custom element with a shadow root, keyed to the widget id.
2. Fetches config through a layered cache (Cache API, then `localStorage`, then memory), polling
   `/v1/config/version` before paying for a refetch.
3. Applies placement and visibility rules, exposed to CSS as `data-align`, `data-visible`, and
   `data-state` attributes on the host element.
4. Mounts one of four chrome strategies based on `config.chrome`: `fab`, `panel`, `modal`, `none`.
5. Mounts an iframe when `config.src` is set, and opens an origin-pinned RPC channel to it.
6. Reports install health to `/v1/health/heartbeat`, including an `INIT_FAILED` beat if its own
   startup throws.

Shadow DOM for the host, an iframe for the widget: the page cannot restyle the launcher by accident,
and the widget cannot read the page.

## Host page API

```js
const widget = window.WebPlugins.get('Ab3xK9pQ7r2m');

widget.open();
widget.close();
widget.toggle();
widget.show();
widget.hide(); // override the visibility rules
widget.getConfig();
widget.version;
widget.track('page_viewed', { sku: 'ABC' });
await widget.user.set({ email: 'a@b.com' });
await widget.ready(); // config loaded and chrome mounted
widget.destroy();
```

`window.WebPlugins` also exposes `widgets` (the registry), `mount`, `registerChrome`, and
`registerEnricher`. Everything is namespaced by widget id, so two widgets on one page never collide.

## Extending

A custom presentation, registered from the host page, needs no server change:

```js
window.WebPlugins.registerChrome('banner', (context) => {
  // context: { config, shadow, stylesheet, align, open, close, toggle, track, getState }
  return { frame: null, destroy() {} };
});
```

Two members are all a strategy owes: the `frame` it mounted (or `null`), and `destroy`. Identity and
open/close state reach the widget through the frame, which the host already holds, so there is nothing
to forward. Strategies that do mount an iframe call `mountFrame(context, variant)` rather than
constructing one.

Importing the ESM build instead of the IIFE gives you `WidgetHost`, `WidgetFrame`, `getScriptMeta`, and
the chrome registry directly.

## Build

```bash
pnpm build     # dist/widget.js (IIFE, self-executing) and dist/runtime.js (ESM)
pnpm dev       # watch
```
