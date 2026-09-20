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
| `previewToken=…` | Read the draft instead of the published config                                                                  |
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

Returns 404 when there is nothing to serve, which covers all four cases that look identical from the
outside: unknown widget, never published, unpublished, or `status: disabled`.

With a valid `previewToken` the draft is served instead and the response becomes `no-store`.

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

| Route                     | Returns                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------- |
| `GET /api/templates`      | Available templates with their name, description, chrome, and whether they need a `src` |
| `GET /api/widgets`        | Every widget in the project with its publish state and derived health                   |
| `POST /api/widgets`       | `{ name, templateId }` → `201 { id }`. The draft starts as the template defaults        |
| `GET /api/widgets/:id`    | Widget, draft, published (with `publishedAt`), and the install snippet                  |
| `PATCH /api/widgets/:id`  | `{ name?, status? }` where status is `active` or `disabled`                             |
| `DELETE /api/widgets/:id` | Deletes the widget and its configs                                                      |

### Config

| Route                             | Behavior                                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/widgets/:id/form`       | `{ schema, fields, values, version }` — the composed JSON Schema _and_ the derived field list, so the panel never hardcodes a form    |
| `PUT /api/widgets/:id/config`     | `{ values }`. Validates, then writes the draft. `422` with per-field details on invalid input                                         |
| `POST /api/widgets/:id/publish`   | Revalidates, archives the live row, promotes the draft, then opens a fresh draft at the next version so editing continues immediately |
| `POST /api/widgets/:id/unpublish` | Archives the published row. Nothing is deleted, and `/v1/config` starts 404ing                                                        |

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

`POST /api/widgets/:id/preview-token` returns `{ token, expiresAt }` — a short-lived HMAC over the
widget id. It exists so the editor can render an unpublished draft without a public draft endpoint.

The panel's preview iframe does not use a token from the page; `/admin/preview/:id` is itself an
authenticated route that mints its own and sends `Content-Security-Policy: frame-ancestors 'self'`, so
a token cannot be lifted out of the editor's HTML.

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
