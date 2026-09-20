# @web-plugins/widget-kit

The iframe side of [Web Plugins](../../README.md). Your widget imports this; it never talks to the
API, never handles a widget id, and never fetches its own config.

MIT licensed. Preact is an optional peer dependency, needed only for the hooks.

## Use

```ts
import { connectWidget } from '@web-plugins/widget-kit';

const { client, config } = await connectWidget({ autoResize: true });

render(config);
client.onConfig(({ config }) => render(config)); // fires on every edit in preview
```

With Preact:

```tsx
import { useWidget } from '@web-plugins/widget-kit/preact';

export function App() {
  const { client, config, connected, error } = useWidget();

  if (error) return <p>Open this through a Web Plugins launcher.</p>;
  if (!config) return <p>{connected ? 'Waiting for config…' : 'Connecting…'}</p>;

  const view = config.view as { greeting?: string };
  return <button onClick={() => void client.close()}>{view.greeting}</button>;
}
```

Read config from what the hook returns rather than a module-level snapshot, or the widget will look
frozen in the admin panel's live preview.

`useAutoResize()` returns a ref that keeps the frame sized to an element, for inline embeds where the
frame has no fixed height.

## The client

```ts
client.meta; // { widgetId, mode, hostOrigin, sourceUrl, version, previewToken, ... }
client.currentConfig;
client.configVersion;

await client.open();
await client.close();
await client.toggle();
await client.resize(480);
client.autoResize(element);

await client.track('cta_clicked', { plan: 'pro' });
await client.identify({ email: 'a@b.com' });
await client.clearIdentity();
await client.openUrl('https://example.com/pricing'); // navigates the top window

client.onConfig((event) => {});
client.onIdentity((identity) => {});
client.on('opened' | 'closed' | 'visibility', (payload) => {});
```

`getWidgetClient()` returns the same instance every time, so several components can use it without
opening several channels.

Notes that save debugging time:

- **Navigate through `openUrl`.** The host performs it and rejects anything that is not absolute
  `http(s)`. A cross-origin iframe cannot move the top window itself.
- **Identity and analytics degrade quietly.** `identify` needs an identity service configured on the
  server; without one it resolves to `null`. `track` is suppressed entirely in preview mode.
- **Messages are origin-pinned both ways.** The client only accepts messages from the host origin its
  URL declared, and only posts back to that origin.
- **`isEmbedded` is false when opened directly in a tab,** and `connect()` rejects. Render a hint for
  that case, which is what `examples/hello-widget` does.

See [authoring a widget](../../docs/authoring-a-widget.md) for the full walkthrough, including the
template that configures your widget.
