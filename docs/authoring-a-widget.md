# Authoring a widget

A widget is two things: an app that runs in an iframe, and a template row that says how it is
configured. Neither one knows about the API, the widget id, or where its config came from.

Work through this doc and you will have added a widget kind to the platform without touching the
runtime, the API, or the admin panel.

## 1. The iframe app

Any stack that renders HTML works. The only requirement is `@web-plugins/widget-kit`, which owns the
conversation with the host.

```bash
mkdir -p examples/my-widget && cd examples/my-widget
# package.json, vite.config.ts, index.html — copy examples/hello-widget to start
```

With Preact, a whole widget is one hook:

```tsx
import { useWidget } from '@web-plugins/widget-kit/preact';

export function App() {
  const { client, config, connected, error } = useWidget();

  if (error) return <p>Open this through a Web Plugins launcher.</p>;
  if (!config) return <p>{connected ? 'Waiting for config…' : 'Connecting…'}</p>;

  const view = config.view as { greeting?: string };

  return (
    <div style={{ background: config.colors.primaryColor }}>
      <h1>{view.greeting}</h1>
      <button onClick={() => void client.close()}>Close</button>
    </div>
  );
}
```

Without Preact, the same thing:

```ts
import { connectWidget } from '@web-plugins/widget-kit';

const { client, config } = await connectWidget({ autoResize: true });
render(config);
client.onConfig(({ config }) => render(config)); // fires on every edit in preview
```

`useWidget` re-renders on every config push, which is what makes the admin panel's live preview work
without a reload. Read config from props, never from a module-level snapshot, or your widget will look
frozen in the editor.

### What the client gives you

```ts
client.meta; // { widgetId, mode, hostOrigin, sourceUrl, version, previewToken, ... }
// mode is 'auto' | 'manual' | 'preview'
client.currentConfig; // the config, or null before connect()
client.configVersion; // revision of the config currently rendered

await client.open(); // ask the host to open its chrome
await client.close();
await client.toggle();
await client.resize(480); // request a frame height
client.autoResize(element); // or track an element's height continuously

await client.track('cta_clicked', { plan: 'pro' });
await client.identify({ email: 'a@b.com', name: 'A B' });
await client.clearIdentity();
await client.openUrl('https://example.com/pricing'); // navigates the top window

client.onConfig((event) => {}); // config was pushed
client.onIdentity((identity) => {});
client.on('opened' | 'closed' | 'visibility', (payload) => {});
```

Three things worth knowing:

- **`openUrl` instead of `window.top.location`.** The host performs the navigation, and rejects
  anything that is not `http(s)`. Your iframe is cross-origin and cannot do it directly.
- **Identity and analytics degrade quietly.** `identify` needs identity to be enabled on the server; it
  is by default, but a deploy can set `IDENTITY_ENABLED=false`, in which case it resolves to `null` and
  stores nothing. `track` fans out to GA4 when `analytics.gtagId` is set and to the session service when
  identity is on, is a no-op with neither, and is suppressed entirely in preview mode. Write the widget
  so both are a bonus, not a precondition.
- **Messages are origin-pinned in both directions.** The client only accepts messages from the host
  origin declared in its URL, and only posts back to that origin. A page on another site cannot drive
  your widget.

### Local development

Run the widget on its own port and point the template's `src` at it:

```bash
pnpm --filter @web-plugins/my-widget dev   # e.g. http://localhost:5175
```

Opening that URL directly shows the "not embedded" branch — expected, since there is no host. Use the
admin panel's preview pane, or the [test page](../examples/test-page), to see it for real.

## 2. The template

A template is a row in `widget_template`: a name, a default `chrome`, a `src`, the schema parts it
contributes, and the defaults a new widget starts from. Add one to
[`apps/server/src/db/templates.ts`](../apps/server/src/db/templates.ts):

```ts
const myWidget: TemplateSeed = {
  id: 'my-widget',
  name: 'My widget',
  description: 'Shown in the panel when creating a widget.',
  chrome: 'panel',
  src: process.env.MY_WIDGET_URL ?? 'http://localhost:5175/',

  // The variable parts. Core keys (visibility, colors, placement, ...) are added
  // for you; do not repeat them here.
  schema: {
    view: {
      type: 'object',
      properties: {
        greeting: { type: 'string', minLength: 1, maxLength: 80 },
        showFooter: { type: 'boolean' },
        links: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', maxLength: 40 },
              url: { type: 'string', format: 'uri', maxLength: 1024 },
            },
            required: ['label', 'url'],
            additionalProperties: false,
          },
        },
      },
      required: ['greeting'],
      additionalProperties: false,
    },
    meta: {
      type: 'object',
      properties: {
        accountId: { type: 'string', maxLength: 64, 'x-ui-note': 'From your dashboard' },
      },
      additionalProperties: false,
    },
    // Optional: extra launcher properties, merged into the core launcher schema.
    launcher: {
      type: 'object',
      properties: { showBadge: { type: 'boolean' } },
      additionalProperties: false,
    },
  },

  // Must validate against the composed schema, or a new widget cannot be saved.
  defaults: {
    chrome: 'panel',
    src: process.env.MY_WIDGET_URL ?? 'http://localhost:5175/',
    visibility: { device: { desktop: true, mobile: true }, pages: { specific: false } },
    colors: { primaryColor: '#2563EB', primaryTextColor: '#FFFFFF' },
    placement: {
      desktop: { align: 'right', values: { side: 20, bottom: 20 } },
      mobile: { align: 'right', values: { side: 10, bottom: 10 } },
    },
    frame: { height: 520, width: 380, position: 'absolute' },
    launcher: { tooltip: 'Open', showBadge: false },
    view: { greeting: 'Hello', showFooter: true, links: [] },
    meta: { accountId: '' },
  },
};

export const templateSeeds: TemplateSeed[] = [helloWidget, whatsapp, /* ... */ myWidget];
```

Then reseed:

```bash
pnpm db:seed
```

Seeding is idempotent per template id: it inserts what is missing and updates what changed. Existing
widgets keep the schema snapshot they were created with, so reseeding never breaks a live install.

That is the whole extension point. No new bundle, no enum, no admin form to write — the panel reads
the schema and renders the fields.

### Schema tips

- Keep `additionalProperties: false`. It turns a mistyped key into a save error instead of a setting
  that silently does nothing.
- Put user-visible copy in `view` and install data in `meta`. The panel groups them that way.
- Mark a property `nullable: true` if the form may leave it empty; Ajv is strict about `null`.
- Cap every string with `maxLength`. These values are served to every visitor.
- Long text (`maxLength > 240`) renders as a textarea, a hex-code `pattern` as a color picker. See
  [config contract](config-contract.md#schema-to-form) for the full mapping.

## 3. A widget with no iframe

If the widget is a deep link, skip step 1 entirely. Set `chrome: 'fab'`, `src: null`, and let
`launcher.action` do the work:

```ts
defaults: {
  chrome: 'fab',
  src: null,
  launcher: {
    icon: { svg: '<svg ...></svg>' },
    tooltip: 'Chat with us',
    action: {
      type: 'open-url',
      url: 'https://wa.me/{{meta.phone|digits}}?text={{launcher.messageTemplate}}',
      target: '_blank',
    },
  },
}
```

The seeded WhatsApp template is exactly this and nothing more — no JavaScript specific to it exists
anywhere in the repo.

## 4. From the host page

The host page gets a small SDK, keyed by widget id, for the cases where the site itself needs control:

```js
const widget = window.WebPlugins.get('Ab3xK9pQ7r2m');

widget.open();
widget.close();
widget.toggle();
widget.show(); // override the visibility rules
widget.hide();
widget.getConfig(); // the resolved config
widget.version; // config version currently rendered
widget.track('page_viewed', { sku: 'ABC' });
await widget.user.set({ email: 'a@b.com' });
widget.user.get();
widget.user.clear();
widget.destroy();

await widget.ready(); // resolves once config is loaded and chrome is mounted
```

`ready()` rejects if the widget never mounted — no published config, or a request that failed — so it
is worth catching rather than assuming the callback runs:

```js
widget.ready((w) => w.open()).catch((error) => console.warn('widget unavailable', error));
```

A rejection is not permanent, and it is not cached: calling `ready()` again retries the config load, so
a widget that failed while the network was down will mount once it comes back. A config already in the
runtime cache survives an outage on its own, so this only bites on a first visit.

Add `&mode=manual` to the script URL to skip auto-mounting, then call `widget.init()` yourself — useful
on a consent-gated page.

An identity enricher lets the host page contribute visitor data without the widget knowing where it
came from:

```js
window.WebPlugins.registerEnricher({
  id: 'logged-in-user',
  priority: 10,
  canRun: () => Boolean(window.currentUser),
  getCacheKey: () => window.currentUser?.id ?? null,
  fetch: async () => ({ externalId: window.currentUser.id, email: window.currentUser.email }),
});
```

Enrichers run in ascending `priority`, at most once per visitor per `getCacheKey`, and only when
identity is enabled. On a conflicting field the more trusted source wins: a JWT claim beats an explicit
`user.set()`, which beats an enricher.

One subtlety in that ordering. The session service echoes back whatever was just sent to it, so an echo
is not treated as a JWT claim - otherwise the first `user.set()` would relabel every field as
server-confirmed and freeze it, and no later call could correct a name or email. A claim only counts as
higher-trust when the server returns a value that differs from the one sent, which is what a real
upstream identity provider does.
