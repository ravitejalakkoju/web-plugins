# hello-widget

A complete Web Plugins widget, small enough to read in one sitting. Copy this directory to start a new
one.

```bash
pnpm --filter @web-plugins/hello-widget dev   # http://localhost:5174
```

It is seeded as the **Hello widget (example)** template, so it works end to end out of the box: create a
widget from it in the panel, publish, and drop the snippet on [the test page](../test-page).

The whole widget is [`src/App.tsx`](src/App.tsx). Note what it does not contain:

- No fetching. The host resolves config and hands it over.
- No widget id handling, no API base, no knowledge that a server exists.
- No `window.top` navigation. `client.openUrl()` asks the host to do it.
- No polling for changes. `useWidget` re-renders when the host pushes a new config, which is what makes
  the panel's live preview update as you type.

Opening `localhost:5174` directly shows the "not connected to a host" branch. That is correct — there is
no host to talk to. Use the panel's preview or the test page.

Its schema and defaults live in
[`apps/server/src/db/templates.ts`](../../apps/server/src/db/templates.ts) as `helloWidget`: a `view`
with `greeting`, `body`, `ctaLabel`, and `ctaUrl`. Add a property there and the field appears in the
admin form with no change to this app.

MIT licensed, like everything else that ships to a browser.
