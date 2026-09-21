# @web-plugins/views

The widget UIs that ship with the platform: one Preact app, one folder per module.

A widget's `config.src` is just a URL the runtime loads in an iframe, so views are
not special — they are ordinary pages that talk to the host over RPC. This app
exists so the common ones live somewhere sensible and share a build, a skin and a
connection helper, rather than each being a project.

```
apps/views/
  index.html            directory of modules, for development
  shared/               mount helper, theme, primitives
  chat/                 one folder per module: index.html + main.tsx + component
  rewards/
  popup/
  newsletter/
  scripts/new-module.mjs
```

The four modules are deliberately thin. Each one types its template's `view`
schema and renders the config it was handed, which is the starting point for the
real UI rather than the UI itself.

## Running it

```bash
pnpm dev                     # from the repo root, alongside the server
pnpm --filter @web-plugins/views dev   # or on its own, port 5175
```

Opened directly a module has no host to talk to and says so. To see one with real
config, open the widget in the admin panel: the preview pane is a host, and it
pushes edits straight into the iframe as you type.

## Adding a module

```bash
pnpm --filter @web-plugins/views new loyalty
```

That writes `loyalty/index.html`, `loyalty/main.tsx` and `loyalty/Loyalty.tsx`.
Nothing else needs editing: any directory with an `index.html` becomes a Vite
entry and a typechecked source root, so `/loyalty/` works in dev and builds to
`dist/loyalty/index.html`.

To make it a widget an operator can create, add a template in
`apps/server/src/db/templates.ts` with `src: viewUrl('loyalty')` and a `view`
schema, then `pnpm db:seed`. The schema drives both the admin form and the
validation, so mirroring it as the module's `View` interface is all the typing you
need.

## Writing a module

`mount()` handles connecting, the three states before config arrives, and turning
`config.colors` into CSS custom properties. A module is only its UI:

```tsx
import type { ModuleProps } from '../shared/mount';
import { Body, Header, Screen } from '../shared/ui';

export interface LoyaltyView {
  headline?: string;
}

export function Loyalty({ view, client, identity }: ModuleProps<LoyaltyView>) {
  return (
    <Screen>
      <Header title={view.headline ?? 'Loyalty'} onClose={() => void client.close()} />
      <Body>
        <button onClick={() => void client.track('joined')}>Join</button>
      </Body>
    </Screen>
  );
}
```

`client` is the [widget-kit](../../packages/widget-kit/README.md) client:
`close()`, `open()`, `resize()`, `track()`, `identify()`, `openUrl()` and
`onConfig()`. `identity` is the visitor the host resolved, or null when sessions
are switched off.

Config changes re-render, including while an operator is typing in the panel, so
read everything from `view` rather than copying it into state.

## Using another framework instead

Nothing here is required. A module is a URL, so point `config.src` at any page on
any stack — React, Vue, Svelte, plain HTML — install `@web-plugins/widget-kit` (or
implement the `postMessage` envelope yourself, it is documented in
[`packages/protocol`](../../packages/protocol/README.md)) and you have the same
contract. Set `SUPPORT_CLIENT_URL`, `POPUP_CLIENT_URL`, `REWARDS_CLIENT_URL` or
`NEWSLETTER_CLIENT_URL` to override where a bundled template points, or give your
own template its own `src`.

Use this app when you want the shared skin and one deployment. Use your own when
the widget is large enough to deserve its own repo.
