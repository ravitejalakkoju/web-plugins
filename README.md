# Web Plugins

Put a widget on someone else's website, then change it without asking them to touch their code again.

Web Plugins is the boring half of that problem, solved once: one `<script>` tag, a shadow-DOM host
that owns placement and visibility, an iframe boundary with a typed RPC bridge, versioned config you
publish when it is ready, and install health reporting. What the widget _is_ — a WhatsApp button, a
support panel, an email popup — is a row in a table and a JSON Schema, not a subclass and not a
separate bundle.

```html
<script src="https://widgets.example.com/v1/widget.js?id=Ab3xK9pQ7r2m" async></script>
```

That tag never changes. Everything about the widget is config the runtime fetches, caches, and
re-fetches when the version moves.

## Why this exists

Most widget code in the wild is written once per widget: a bundle per product, an `if type ===`
somewhere, a hand-built admin form, and no idea whether the thing is actually live on the merchant's
site. Web Plugins takes those five concerns out of the widget:

| Concern                                                  | Who owns it               |
| -------------------------------------------------------- | ------------------------- |
| Mounting, placement, visibility rules, open/close chrome | `@web-plugins/runtime`    |
| Config shape, validation, form generation, RPC envelopes | `@web-plugins/protocol`   |
| Storage, versioning, publish, health, admin panel        | `@web-plugins/server`     |
| Talking to the host from inside the iframe               | `@web-plugins/widget-kit` |
| What the widget looks like and does                      | you                       |

## Quick start

Requires Node 22+ and pnpm 10. No database to install — the default `DATABASE_URL` uses
[PGlite](https://pglite.dev), an embedded Postgres that writes to `apps/server/.data/pg`.

```bash
pnpm install
cp .env.example .env
pnpm build:packages   # protocol + runtime + widget-kit, needed once before the server boots
pnpm dev
```

`pnpm dev` starts five things: the runtime bundler in watch mode, the server with the admin panel on
[localhost:5055](http://localhost:5055), the bundled widget views on `:5175`, the example widget on
`:5174`, and a plain test page on `:5173`.

Then:

1. Open [localhost:5055/admin](http://localhost:5055/admin) and sign in with the `ADMIN_EMAIL` /
   `ADMIN_PASSWORD` from `.env` (`admin@example.com` / `admin` by default).
2. Create a widget from the **Hello widget (example)** template.
3. Edit config in the left pane. The preview on the right updates as you type — it is the real
   runtime, rendering the real config. Nothing is written until you hit **Save**.
4. Hit **Publish**, copy the install snippet.
5. Open [localhost:5173](http://localhost:5173), paste the widget id, and load it. The launcher
   appears, the panel opens the example widget, and the widget reports `LIVE` health within one
   heartbeat.

Prefer real Postgres? `pnpm db:up` starts the `docker-compose` one on port 5433, then set
`DATABASE_URL=postgresql://webplugins:webplugins@localhost:5433/webplugins`. Migrations and seeds run
automatically on boot either way.

## How a widget renders

```mermaid
flowchart TD
  tag["&lt;script src=/v1/widget.js?id=W&gt;"] --> host["WidgetHost: shadow root, placement, visibility"]
  host --> cache["CacheManager: GET /v1/config/version, then /v1/config"]
  cache --> chrome{"config.chrome"}
  chrome -->|fab| fab["button only"]
  chrome -->|panel| panel["launcher + side panel"]
  chrome -->|modal| modal["centered dialog + backdrop"]
  chrome -->|none| headless["no UI of its own"]
  host --> src{"config.src set?"}
  src -->|yes| frame["iframe + typed RPC bridge"]
  src -->|no| action["launcher.action, e.g. open a URL"]
  host --> hb["HeartbeatClient: POST /v1/health/heartbeat"]
```

Two widgets on one page is a supported case, not a coincidence: element ids, cache keys, and every
RPC envelope are namespaced by widget id, and the global registry is keyed the same way.

## Workspace layout

```
web-plugins/
  apps/server/              AGPL-3.0: Fastify 5 + Drizzle + the SSR admin panel
    src/api/                public routes (/v1/*) and the admin API (/api/*)
    src/db/                 Drizzle schema, migrations, template seeds
    admin/                  Preact panel, server-rendered and hydrated
  packages/protocol/        MIT: config schema, validators, RPC + heartbeat types, form generation
  packages/runtime/         MIT: the browser bundle served as /v1/widget.js
  packages/widget-kit/      MIT: the iframe-side client for widget authors
  apps/views/               MIT: the bundled widget UIs, one Preact app, one folder per module
  examples/hello-widget/    a complete widget in one Preact component
  examples/test-page/       a plain host page, no framework, for verifying installs
```

A widget's UI is whatever `config.src` points at, so [`apps/views`](apps/views/README.md) is a
convenience rather than a requirement: it holds the common modules (chat, rewards, popup,
newsletter) so they share a build and a skin, and `pnpm --filter @web-plugins/views new <name>` adds
another. Anything on any stack can take its place by pointing `src` elsewhere and speaking the same
RPC contract.

## Docs

- [Config contract](docs/config-contract.md) — the core keys every widget has, and the parts a
  template adds.
- [Authoring a widget](docs/authoring-a-widget.md) — write the iframe app, then the template that
  configures it.
- [API reference](docs/api.md) — public and admin endpoints, preview tokens, health statuses.
- [Self-hosting](docs/self-hosting.md) — environment, build, deploy, and the security posture.

## Scripts

| Command                                        | What it does                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| `pnpm dev`                                     | runtime watcher + server + views + example widget + test page            |
| `pnpm build`                                   | build every package, then the views app, the server and its admin assets |
| `pnpm start`                                   | run the built server in production mode                                  |
| `pnpm build:packages`                          | just `protocol`, `runtime`, `widget-kit`                                 |
| `pnpm db:up` / `pnpm db:down`                  | the `docker-compose` Postgres                                            |
| `pnpm db:generate`                             | generate a migration after editing the Drizzle schema                    |
| `pnpm db:migrate` / `pnpm db:seed`             | run migrations / reseed templates                                        |
| `pnpm typecheck` / `pnpm lint` / `pnpm format` | tsc, eslint, prettier                                                    |

## Licensing

Open core, licensed per package rather than per repo:

- **MIT** — `protocol`, `runtime`, `widget-kit`, `apps/views`, and the examples. Everything that
  reaches a visitor's browser, plus the shared contracts. Ship it in a commercial product, no
  obligation.
- **AGPL-3.0-only** — `apps/server`, the control plane. Self-host it freely; if you run a modified
  version as a network service, AGPL section 13 asks you to offer that source to its users. A
  commercial license without that condition is available from the copyright holder.

See [LICENSE](LICENSE) for the full breakdown, and [CONTRIBUTING](CONTRIBUTING.md) for how to work on
the repo.

## Not in v1

Chat and realtime transport (visitors, threads, messages, WebSocket, media), Shopify and
WooCommerce install adapters, npm publishing of the MIT packages, and multi-tenant auth. Every table
already carries `projectId`, so tenancy is additive rather than a migration.
