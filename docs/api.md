# API reference

Two surfaces, deliberately separated at the plugin level so their rules cannot leak into each other.

| Surface                   | Prefix   | Auth                  | CORS                |
| ------------------------- | -------- | --------------------- | ------------------- |
| Public (visitor browsers) | `/v1/*`  | none                  | `*`, no credentials |
| Admin (the panel)         | `/api/*` | signed session cookie | none registered     |

`GET /healthz` sits outside both and returns `{ ok: true, version: 1 }`.

## Public

Anonymous by design. Only published data is readable without a preview token, and the response
carries no operator information.

### `GET /v1/widget.js?id=WIDGET_ID`

The runtime bundle. `id` is in the URL so an install is self-describing and so the script can read its
own widget id — the bytes are identical for every widget. `Cache-Control: public, max-age=300`.

The script derives the API base from its own `src`, so one bundle works against any host. Optional
query parameters:

| Parameter        | Effect                                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| `mode=auto`      | Default. Mount and initialize immediately                                                                       |
| `mode=manual`    | Mount but wait for `WebPlugins.get(id).init()`                                                                  |
| `mode=preview`   | Editor mode: accept config over `postMessage`, suppress analytics                                               |
| `previewToken=…` | Read a widget that is still a draft                                                                             |
| `api=https://…`  | Override the derived API base, for CDN installs where the bundle and the control plane are on different origins |

With `RUNTIME_BUNDLE_URL` set, this route 302s to `${RUNTIME_BUNDLE_URL}/widget.js` instead of
streaming the file. Returns 503 if the bundle was never built (`pnpm build:packages`).

### `GET /v1/config?id=WIDGET_ID`

The published config, plus what the runtime needs to talk to the rest of the platform.

```jsonc
{
  "widgetId": "Ab3xK9pQ7r2m",
  "version": 4,
  "config": { "version": 4, "chrome": "panel", "src": "https://…" /* … */ },
  "runtime": { "identityBaseUrl": null, "protocol": 1 },
}
```

`Cache-Control: public, max-age=60`. The version is stamped inside `config` as well, because the
runtime forwards it to the iframe and reports it on every heartbeat.

Returns 404 when there is nothing to serve, which covers both cases that look identical from the
outside: an unknown widget and one whose `status` is `draft`.

With a valid `previewToken` a draft is served too, and the response becomes `no-store`.

### `GET /v1/config/version?id=WIDGET_ID`

The cheap poll the runtime uses before deciding to refetch:

```json
{ "widgetId": "Ab3xK9pQ7r2m", "version": 4 }
```

`Cache-Control: public, max-age=30`. Same 404 and preview-token behavior as `/v1/config`.

### `POST /v1/health/heartbeat`

How an install reports in. Unauthenticated by necessity — it comes from a visitor's browser — so it is
rate-limited to 60 requests per minute per IP, length-capped by schema, and must resolve to a real
widget (404 otherwise). Responds `202 { ok: true }`.

```jsonc
{
  "widgetId": "Ab3xK9pQ7r2m", // required
  "ts": 1789845600000,
  "configVersion": 4,
  "initialized": true,
  "visible": true,
  "healthStatus": "OK",
  "errorCode": "…", // ≤ 64 chars
  "errorMessage": "…", // ≤ 512 chars
  "pageUrl": "https://shop.example.com/products/x", // ≤ 2048 chars
  "meta": {},
}
```

`healthStatus` is one of `OK`, `HIDDEN_BY_RULES`, `CONFIG_INVALID`, `INIT_FAILED`, or `RUNTIME_ERROR`.
Omit it and the server infers: `initialized: false` becomes `INIT_FAILED`, anything else `OK`.

### Visitor sessions

Identity for visitors, served only when identity is enabled (see `IDENTITY_ENABLED` and
`IDENTITY_BASE_URL`). The runtime's `IdentityManager` is the only intended client, and it is what fixes
the shape of these calls, so treat the request and response bodies as a contract rather than something to
reshape freely.

Every route is anonymous, rate-limited per IP (30/min, 120/min for events), and capped at an 8 KB body.
They all answer with the same pair:

```jsonc
{
  "token": "eyJhbGciOiJIUzI1NiJ9…", // HS256 JWT, 30-day expiry
  "restoreId": "71e01fba-ba36-415a-a153-8f53a420f77e",
}
```

The token's claims are `sub` (the session id) plus whichever of `externalId`, `name`, `email`, `phone`
and `company` are known. The runtime decodes them client-side without asking the server, which is why
the claim names are part of the public contract.

| Route                        | Body                                          | Notes                                                                                             |
| ---------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `POST /v1/sessions`          | empty, or trait fields                        | Mints an anonymous session. An empty body is accepted, which is what the runtime sends            |
| `POST /v1/sessions/restore`  | `{ restoreId }`                               | Trades a stored `restoreId` for a fresh token. 404 for unknown, expired, and other projects alike |
| `POST /v1/sessions/identify` | traits + `sourceUrl`, `referrerUrl`           | Attaches traits to the session the `Authorization: Bearer` token names                            |
| `POST /v1/sessions/events`   | `{ name, type?, url?, widgetId?, metadata? }` | Requires a bearer token. `202 { ok: true }`                                                       |

Two behaviours worth knowing:

- **`identify` never merges by email or `externalId`.** It resolves a session from the bearer token and
  nothing else. Matching on an address would let anyone take over another visitor's session by guessing
  it. With no usable token it mints a new session carrying the traits, so identity survives a token
  expiring rather than failing permanently.
- **Only supplied fields are written.** A later call carrying just a phone number cannot blank out a name
  an earlier one established, and an unknown `widgetId` on an event is dropped to null rather than
  rejected, so a widget deleted mid-visit does not turn into a page full of failed requests.

`restoreId` is a credential: whoever holds it can restore that visitor's session, which is why it is a
random UUID and never derived from anything guessable.

## Admin

Cookie session, one operator, credentials from the environment. Every route under `/api` (other than
auth) requires it.

Two guards run before anything else:

1. **`onRequest` auth.** Unauthenticated calls get `401` before body validation, so a probe cannot
   learn a route's schema by sending garbage.
2. **Origin check on mutations.** Any non-`GET` with an `Origin` header that is not `PUBLIC_BASE_URL`
   (or `http://localhost:PORT`) gets `403`. A request with no `Origin` is allowed through, since that
   is a CLI or server-side client with no ambient cookie to abuse.

### Auth

| Route                   | Notes                                                                                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/login`  | `{ email, password }`. Sets the signed `wp_session` cookie (httpOnly, sameSite lax, 7 days, `secure` in production). Constant-time comparison, rate-limited to 10/min |
| `POST /api/auth/logout` | Clears the cookie                                                                                                                                                     |

### Templates and widgets

| Route                     | Returns                                                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/templates`      | Available templates with their name, description, chrome, and `src` (null when the template has no default)                |
| `GET /api/widgets`        | Every widget in the project with its status and derived health                                                             |
| `POST /api/widgets`       | `{ name, templateId }` → `201 { id }`. Created as a draft holding the template defaults                                    |
| `GET /api/widgets/:id`    | Widget (including `status`), its `values`, `version`, `publishedAt`, and the install snippet                               |
| `PATCH /api/widgets/:id`  | `{ name?, status? }` where status is `draft` or `published`. Publishing revalidates and answers `422` on an invalid config |
| `DELETE /api/widgets/:id` | Deletes the widget and its config                                                                                          |

### Config

| Route                         | Behavior                                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/widgets/:id/form`   | `{ schema, fields, values }` — the composed JSON Schema _and_ the derived field list, so the panel never hardcodes a form                   |
| `PUT /api/widgets/:id/config` | `{ values }`. Validates, overwrites the document and bumps `version`. `422` with per-field details on invalid input → `{ values, version }` |

A widget has exactly one config document, and `status` decides whether visitors get
it. So **saving a published widget is live immediately** — there is no staging copy to
promote. The panel therefore saves on an explicit action rather than on a keystroke.

Publishing is nothing more than `PATCH { status: 'published' }`, and unpublishing is
the same call with `draft`. Neither touches the document, so unpublishing and
republishing serves exactly what was there before.

`version` is a revision counter on that document: it moves on every save, because it
is what `/v1/config/version` reports and what every installed runtime polls to decide
whether to refetch. It never resets, so a cached config is never mistaken for a
current one.

Validation errors look like this, which is what the form renders inline:

```jsonc
{
  "error": "config is invalid",
  "details": [
    { "path": "/view/greeting", "message": "must NOT have fewer than 1 characters" },
    { "path": "/view", "message": "unexpected property \"greting\"" },
  ],
}
```

`path` is a JSON pointer, so the panel can map an error straight onto a field.

### Health

`GET /api/widgets/:id/health` returns the derived snapshot:

```jsonc
{
  "widgetId": "Ab3xK9pQ7r2m",
  "derivedStatus": "LIVE",
  "configDeployed": true,
  "configComplete": true,
  "lastSeenAt": "2026-09-19T12:09:44.001Z",
  "lastSeenAgoSeconds": 12,
  "lastVisibleAt": "2026-09-19T12:09:44.001Z",
  "lastHealthStatus": "OK",
  "lastConfigVersion": 4,
  "lastPageUrl": "https://shop.example.com/",
  "lastErrorCode": null,
  "lastErrorMessage": null,
}
```

`derivedStatus` combines the config state with the last report, in this order:

| Status              | Means                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| `NOT_DEPLOYED`      | Never published                                                                                       |
| `CONFIG_REQUIRED`   | Published, but required config is missing                                                             |
| `STALE`             | No heartbeat ever, or none in the last 30 days — the script was probably removed                      |
| `ISSUE`             | Last heartbeat reported `RUNTIME_ERROR`                                                               |
| `LIVE`              | Last heartbeat reported `OK`                                                                          |
| `DETECTED_NOT_LIVE` | Heartbeats are arriving, but the widget is not showing (hidden by rules, missing config, failed init) |

The 30-day staleness window is deliberate: a low-traffic site may go weeks between visitors, and that
is not a broken install.

### Preview tokens

A preview token is a short-lived HMAC over a widget id, and the only way to read a draft config:
`/v1/config?previewToken=…` accepts one, and there is no public draft endpoint.

There is no endpoint that hands one out. `/admin/preview/:id` is an authenticated page that mints its
own, and sends `Content-Security-Policy: frame-ancestors 'self'`, so a token never appears in the
editor's HTML for something else to lift.

## Errors

One shape everywhere: `{ "error": "message" }`, plus `details` when a validator produced them.
`500`s never include the message. The status codes in use are `400` (malformed request), `401`
(no session), `403` (bad origin), `404` (unknown widget or no published config), `422` (invalid
config), `429` (rate limit), and `503` (runtime bundle missing).

## Admin pages

Server-rendered, hydrated in place, all `no-store`:

| Route                       | Page                                                  |
| --------------------------- | ----------------------------------------------------- |
| `/` and `/admin`            | Redirect to `/admin/widgets`                          |
| `/admin/login`              | Login form. Works without JavaScript                  |
| `/admin/widgets`            | Widget list, create-from-template                     |
| `/admin/widgets/:id`        | Editor: generated form, live preview, install snippet |
| `/admin/widgets/:id/health` | Health detail                                         |
| `/admin/preview/:id`        | The page the editor's preview iframe loads            |

Unauthenticated page requests redirect to `/admin/login` rather than returning `401` — a browser
should land on the form, while the API answers with a status code.
