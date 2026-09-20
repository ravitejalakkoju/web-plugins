# @web-plugins/protocol

The contracts the [Web Plugins](../../README.md) runtime, server, and widgets all agree on. No
browser or server dependencies, so both sides import the same definitions instead of keeping two
copies in sync.

MIT licensed.

## Subpath exports

Each entry point is separate so the browser runtime can take the types and schema helpers without
pulling Ajv into the bundle.

| Import                         | Contains                                                              |
| ------------------------------ | --------------------------------------------------------------------- |
| `@web-plugins/protocol`        | Everything below, for server-side use                                 |
| `@web-plugins/protocol/config` | Config types, core JSON Schema, `buildWidgetConfigSchema`, validators |
| `@web-plugins/protocol/rpc`    | Message envelopes, `HOST_METHODS`, `HOST_EVENTS`, type guards         |
| `@web-plugins/protocol/health` | Heartbeat payload, health statuses, `deriveWidgetStatus`              |
| `@web-plugins/protocol/form`   | `schemaToFormFields` and its field types                              |

## Config

```ts
import { buildWidgetConfigSchema, validateConfig } from '@web-plugins/protocol/config';

// Core keys plus one template's contributions.
const schema = buildWidgetConfigSchema({
  view: { type: 'object', properties: { greeting: { type: 'string' } }, required: ['greeting'] },
});

const { valid, errors } = validateConfig(schema, values);
// errors: [{ path: '/view/greeting', message: 'must be string' }]
```

`validateConfig` coerces types and applies defaults in place, because configs arrive from HTML forms
where every number is a string. Compiled validators are cached by schema.

Also here: `isConfigComplete`, which is what decides whether a widget shows as `CONFIG_REQUIRED` in
health. It falls back to the core schema when a widget has no template parts of its own.

See the [config contract](../../docs/config-contract.md) for what the keys mean.

## RPC

```ts
import { HOST_METHODS, PROTOCOL_VERSION, isEnvelopeFor } from '@web-plugins/protocol/rpc';

if (!isEnvelopeFor(event.data, widgetId)) return; // wrong protocol, or another widget's traffic
```

Every message carries `wp` (protocol version) and `widgetId`, which is what lets several widgets share
a page without reading each other's messages.

The same module holds the one message that is not host-to-widget: `previewConfigMessage()` and
`isPreviewConfig()`, which the admin panel and the runtime use to push an unpublished config into a
preview frame. It lives here so renaming the event cannot leave the two sides disagreeing.

## Health

```ts
import { deriveWidgetStatus } from '@web-plugins/protocol/health';

deriveWidgetStatus({ configComplete, configDeployed, lastSeenAt, lastHealthStatus });
// 'NOT_DEPLOYED' | 'CONFIG_REQUIRED' | 'STALE' | 'ISSUE' | 'LIVE' | 'DETECTED_NOT_LIVE'
```

## Form generation

```ts
import { schemaToFormFields } from '@web-plugins/protocol/form';

schemaToFormFields(schema); // field descriptors: type, label, validators, children
```

The server and the admin panel both call this, so a schema change shows up as a form change with no
code in between.
