# Self-hosting

One process serves everything: the public API, the runtime bundle, the admin API, and the
server-rendered panel. It migrates and seeds itself on boot, so deploying is "run the binary with a
`DATABASE_URL`".

## Requirements

- Node 22 or newer
- Postgres 14+ (or nothing at all — see [database](#database))
- pnpm 10, to build

## Install

```bash
pnpm install
cp .env.example .env     # then edit the secrets
pnpm build               # packages, then the server and its admin assets
pnpm start               # NODE_ENV=production, reads ./.env if present
```

`pnpm start` is a thin wrapper around `node --env-file-if-exists=.env apps/server/dist/main.js`. If your
platform injects configuration as real environment variables, `node apps/server/dist/main.js` is
equivalent — but note that it will _not_ read `.env`, which is the usual reason a container exits with
`Missing required environment variable DATABASE_URL`.

`pnpm build` has to run in that order and the root script already does: the server streams
`packages/runtime/dist/widget.js` to visitors, so the runtime must exist before the first request for
`/v1/widget.js`. A missing bundle is a `503` on that route and nothing else — the panel still works,
which makes the failure easy to miss.

On boot the server runs pending migrations, upserts the seed templates, and starts listening. All three
are idempotent, so a restart is safe and a rolling deploy does not need a separate migration step.

## Environment

| Variable               | Required | Default                  | Notes                                                                                                   |
| ---------------------- | -------- | ------------------------ | ------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`         | yes      | —                        | Postgres connection string, or `pglite:<path>`                                                          |
| `SESSION_SECRET`       | yes      | —                        | Signs the admin cookie. 16 chars minimum, enforced at boot                                              |
| `PREVIEW_TOKEN_SECRET` | yes      | —                        | Signs preview tokens. Same minimum                                                                      |
| `ADMIN_EMAIL`          | yes      | —                        | The single operator account                                                                             |
| `ADMIN_PASSWORD`       | yes      | —                        | Compared in constant time                                                                               |
| `PUBLIC_BASE_URL`      | no       | `http://localhost:$PORT` | **Set this in production.** It is the origin in install snippets, and the allowlist for admin mutations |
| `PORT`                 | no       | `5055`                   |                                                                                                         |
| `HOST`                 | no       | `0.0.0.0`                |                                                                                                         |
| `NODE_ENV`             | no       | `development`            | `production` enables `trustProxy`, `secure` cookies, and the prebuilt panel                             |
| `RUNTIME_BUNDLE_URL`   | no       | —                        | Serve `widget.js` from a CDN; `/v1/widget.js` 302s there instead                                        |
| `IDENTITY_BASE_URL`    | no       | —                        | Visitor identity service. Unset means identity and event tracking are off                               |

Template `src` values are read from the environment when seeding, so a deploy can point widgets at its
own widget hosts without editing code: `HELLO_WIDGET_URL`, `SUPPORT_CLIENT_URL`, `POPUP_CLIENT_URL`,
`REWARDS_CLIENT_URL`.

Getting `PUBLIC_BASE_URL` wrong is the one misconfiguration with non-obvious symptoms: install snippets
point at the wrong host, and the panel's own mutations get `403` because its `Origin` no longer matches
the allowlist.

## Database

Two drivers, chosen by the URL prefix:

```bash
DATABASE_URL=postgresql://user:pass@host:5432/webplugins   # node-postgres, pooled
DATABASE_URL=pglite:.data/pg                              # embedded Postgres, a directory
DATABASE_URL=pglite:memory                                # embedded, discarded on exit
```

[PGlite](https://pglite.dev) is real Postgres compiled to WASM, running in-process. It exists so `pnpm
dev` needs no Docker and so a demo can be a single command. It is a development convenience, not a
production database: one process, no network access, no replication. Use a real server for anything
that matters.

For local development with a real server, `pnpm db:up` starts `postgres:17-alpine` on host port 5433
(5433, not 5432, to stay out of the way of a Postgres you may already have).

Schema changes are Drizzle-generated:

```bash
# edit apps/server/src/db/schema.ts
pnpm db:generate     # writes a migration to apps/server/src/db/migrations
pnpm db:migrate      # or just restart the server
```

### The tables

| Table             | Holds                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------- |
| `project`         | One row for a self-host install, and the `projectId` every other table carries        |
| `widget_template` | The starter kinds: name, chrome, src, schema parts, defaults                          |
| `widget`          | The public short id from the script URL, plus a **snapshot** of its template's schema |
| `widget_config`   | One row per version, `draft` / `published` / `archived`                               |
| `widget_health`   | Last heartbeat per widget, one row, upserted                                          |

Two properties worth relying on. First, `widget.schema` is a snapshot: editing a template never
invalidates a live widget's config. Second, publishing archives rather than overwrites, so every
published version is still on disk and a rollback is a data change, not a restore.

Back up `project`, `widget`, `widget_template`, and `widget_config`. `widget_health` is derived from
traffic and will rebuild itself within a heartbeat of the next page view.

## Deployment shape

```
visitor browser ──┐
                  ├─▶ reverse proxy (TLS) ──▶ node apps/server/dist/main.js ──▶ Postgres
operator browser ─┘
```

The server is stateless apart from the database, so scaling out is more replicas behind the proxy.

Set `NODE_ENV=production` and put TLS in front of it. `trustProxy` is enabled in production, so
`X-Forwarded-For` is honored — which means the proxy must be the one setting it, or heartbeat rate
limiting can be evaded by a spoofed header.

A `Dockerfile` is not included, and the whole of one is:

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile && pnpm build
ENV NODE_ENV=production
EXPOSE 5055
CMD ["node", "apps/server/dist/main.js"]
```

### Serving the bundle from a CDN

`/v1/widget.js` streams from disk with `max-age=300`, which is fine at modest volume. To move it off
the server, upload `packages/runtime/dist/widget.js` and set `RUNTIME_BUNDLE_URL`; the route then
redirects. Installs behind a CDN that is on a different origin from the control plane need
`?api=https://your-server` in the script URL, since the runtime otherwise derives the API base from
its own `src`.

## Security posture

What the design assumes, so you know what you are relying on:

- **Public routes are anonymous and `*` CORS; the admin API is neither.** They are separate Fastify
  plugin scopes, which is what keeps the wildcard from leaking onto `/api`.
- **Only published config is public.** Drafts need a preview token, and a preview token is a
  short-lived HMAC over one widget id.
- **Heartbeats are untrusted input.** Unauthenticated by necessity, therefore rate-limited (60/min),
  length-capped by schema, and required to resolve to a real widget.
- **Admin mutations check `Origin`.** A non-`GET` from an unexpected origin gets `403`, so a malicious
  page cannot ride the operator's cookie. Login is rate-limited to 10/min and compares in constant
  time.
- **RPC never posts to `*`.** The host replies to the frame's exact origin; the frame only accepts
  messages from the host origin its URL declared. Two widgets on a page cannot read each other's
  traffic.
- **`openUrl` is the only navigation an iframe gets,** and the host rejects anything that is not
  absolute `http(s)` — no `javascript:` or `data:`.
- **No `customCss` or `customJs` in the config schema.** Operator-supplied CSS and JS served to every
  visitor is stored XSS with extra steps.
- **Inline launcher SVG is pattern-checked** and rejected if it contains a `<script>` tag.

Things to do yourself before going live: change both secrets and the admin password, terminate TLS,
and restrict who can reach `/admin`. The panel is single-operator by design — there is no user table,
no roles, and no audit log of who published what.

## Upgrading

```bash
git pull && pnpm install && pnpm build
# restart; migrations and template seeds run on boot
```

Reseeding updates the template rows in place. Existing widgets are untouched, since each one holds its
own schema snapshot.
