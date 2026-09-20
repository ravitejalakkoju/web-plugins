# @web-plugins/server

The control plane: public API, admin API, and the server-rendered config panel, in one Fastify
process. See the root [README](../../README.md) to run it and [self-hosting](../../docs/self-hosting.md)
to deploy it.

**AGPL-3.0-only.** Unlike the rest of the workspace, which is MIT. See [LICENSE](LICENSE).

## Layout

```
src/
  app.ts            plugin registration, decorators, error handler
  main.ts           entry: load env, connect, migrate, seed, listen
  api/
    public.ts       /v1/* — CORS *, anonymous, published data only
    admin.ts        /api/* — session cookie, origin-checked mutations
    auth.ts         login/logout and the session helpers
  admin/
    routes.ts       the panel's pages
    renderer.ts     Vite SSR in dev, prebuilt assets in production
    html.ts         the HTML shell and state serialization
    presenters.ts   row → view model
  services/
    widget.service.ts   CRUD, draft/publish, schema composition
    config.service.ts   the public read side
    health.service.ts   heartbeat ingest and status derivation
  db/
    schema.ts       Drizzle tables
    migrations/     generated, applied on boot
    templates.ts    the seed templates — add widget kinds here
admin/              the Preact panel (entry-server.tsx, entry-client.tsx, pages/)
```

Public and admin routes are registered as separate plugin scopes. That is load-bearing: it is what
keeps `*` CORS on `/v1` from leaking onto `/api`.

## The panel

Preact, server-rendered on every navigation and hydrated in place, so there is exactly one source of
page data. In development the renderer runs Vite in middleware mode, which gives HMR inside the
Fastify process; in production it reads the prebuilt client manifest and the SSR bundle from `dist/`.

```bash
pnpm dev         # tsx watch, Vite middleware, pino-pretty logs
pnpm build       # Vite client + Vite SSR + tsup for the server
pnpm typecheck
```

`pnpm build` produces `dist/main.js`, `dist/admin/client`, `dist/admin/server`, and copies
`src/db/migrations` to `dist/migrations`. Both the migration folder and the panel build are resolved by
trying each candidate path, because bundling flattens `src/` and the layout differs between `tsx` and
`node dist/main.js`.

The editor's preview pane loads `/admin/preview/:id`, an authenticated route that mints its own
preview token and sends `frame-ancestors 'self'`. It is a real route rather than an iframe `srcdoc` for
two concrete reasons: a `srcdoc` frame has an opaque origin, which breaks both the `postMessage` origin
pinning and the runtime's Cache API access.

## Adding a widget kind

A row in [`src/db/templates.ts`](src/db/templates.ts), then `pnpm db:seed`. No new route, no new
bundle, no form to write. See [authoring a widget](../../docs/authoring-a-widget.md).

## Migrations

```bash
# after editing src/db/schema.ts
pnpm db:generate     # writes src/db/migrations
pnpm db:migrate      # or just restart: main.ts migrates and seeds on boot
```

Note that `widget_template.schema` and `widget.schema` are `json`, not `jsonb`. `jsonb` normalizes key
order, and key order in those documents is the field order in the generated admin form.
