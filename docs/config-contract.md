# Config contract

Every widget is one JSON document. The runtime understands the _core_ keys; the rest is yours.

```jsonc
{
  "chrome": "panel",                      // how it is presented
  "src": "https://widget.example.com/",   // the iframe, or null
  "frame": { "height": 520, "width": 380, "position": "absolute" },
  "visibility": { /* devices + page rules */ },
  "colors": { "primaryColor": "#2563EB", "primaryTextColor": "#FFFFFF" },
  "placement": { "desktop": { ... }, "mobile": { ... } },
  "launcher": { /* button, tooltip, callout, auto-open, action */ },
  "analytics": { "gtagId": null },
  "theme": { "fontFamily": null, "fontUrl": null },

  "view": { /* your widget's own settings, passed to the iframe */ },
  "meta": { /* your widget's own data, passed to the iframe */ }
}
```

Core keys are defined and validated by `@web-plugins/protocol`
([core-schema.ts](../packages/protocol/src/config/core-schema.ts)). `view` and `meta` are opaque to
the platform: only the widget's own schema says what belongs in them, and the runtime hands them to
the iframe untouched.

`version` is also present on a served config, stamped by the server. It is a revision counter that
moves on every save, which is what installed runtimes poll to decide whether to refetch. It is hidden
in the admin form and you never set it by hand.

## Core keys

### `chrome`

What the visitor sees before they interact. One of four strategies, looked up at mount time — there
is no widget type enum anywhere else in the system.

| Value   | Renders                                                         | Typical use                                          |
| ------- | --------------------------------------------------------------- | ---------------------------------------------------- |
| `fab`   | A floating button, no iframe                                    | WhatsApp deep link, phone call, any one-click action |
| `panel` | Launcher button plus a side panel iframe                        | Support chat, rewards, account panels                |
| `modal` | Centered dialog with a backdrop and scroll lock                 | Email capture, announcements                         |
| `none`  | Nothing of its own; the iframe mounts invisibly if `src` is set | Headless tracking or a widget that draws its own UI  |

Registering a fifth is a client-side call, no server change:

```js
window.WebPlugins.registerChrome('banner', (context) => {
  // context: { config, shadow, stylesheet, open, close, track, ... }
  return { frame: null, destroy() {} };
});
```

### `src`

The iframe URL, or `null`. With `src` set, the runtime mounts an iframe and opens an RPC channel to
it; without it, the widget is pure chrome and the launcher's `action` does the work. `fab` warns if
you give it a `src` — use `panel` or `modal` when there is a UI to show.

### `frame`

`height` and `width` in pixels (120–2000), plus `position: absolute | relative`. Panel and modal
chromes use these as the frame's size; a widget can ask for a different height at runtime via
`client.resize()`.

### `visibility`

```jsonc
{
  "device": { "desktop": true, "mobile": false },
  "pages": {
    "specific": true,
    "values": [
      { "operator": "starts_with", "value": "/products" },
      { "operator": "regex", "value": "^/collections/.*sale" },
    ],
  },
}
```

Operators are `equals`, `contains`, `starts_with`, `ends_with`, and `regex`. `starts_with` and
`ends_with` match the path; `contains` and `regex` match path plus query string; `equals` matches
either, so `/cart` and `/cart?step=2` both satisfy a rule of `/cart?step=2`. With `specific: false`
(or an empty rule list) the widget shows everywhere.

Device flags are resolved against a 732px viewport breakpoint and combined with the page rules, so a
rule that fails hides the widget on both devices. This decides whether the widget shows _by default_
— `WebPlugins.get(id).show()` still works from the host page.

### `colors`

`primaryColor` is required and must be a hex code. `primaryTextColor`, `secondaryTextColor`, and
`primaryBackgroundColor` are optional. When `primaryTextColor` is absent the runtime picks black or
white by the luminance of `primaryColor`, so the launcher glyph stays readable on any brand color.
Hover and active states are a scale transform, not a derived shade, which is why one color is enough.

### `placement`

Per device: `align` is `left`, `right`, or `center`, and `values.side` / `values.bottom` are pixel
insets. `side` applies to whichever edge `align` picked, which is why one number covers both sides.
The host element exposes this as `:host([data-align])` in the shadow root, so chrome CSS positions
itself off an attribute instead of inline styles.

### `launcher`

Core properties the runtime understands:

| Key                                | Meaning                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| `label`, `tooltip`                 | Button text and hover tooltip                                      |
| `icon.svg`                         | Inline SVG. Rejected by the schema if it contains a `<script>` tag |
| `icon.url`                         | Image URL, used when `svg` is absent                               |
| `callout.text` / `.mode` / `.show` | The attention pill. Modes: `slide_in`, `expand`, `typing_expand`   |
| `autoOpen`, `timer`                | Open without a click, after `timer` seconds (0–600)                |
| `action.type`                      | `open` (default: open the widget) or `open-url`                    |
| `action.url`, `action.target`      | Destination for `open-url`; `_blank` or `_self`                    |

A template may add its own launcher properties; they are merged into this schema rather than
replacing it.

#### URL templating

`action.url` supports `{{path}}` placeholders resolved against the config itself. This is the trick
that makes a WhatsApp widget config rather than code:

```jsonc
{
  "launcher": {
    "messageTemplate": "Hi! I would like to connect with you.",
    "action": {
      "type": "open-url",
      "url": "https://wa.me/{{meta.phone|digits}}?text={{launcher.messageTemplate}}",
      "target": "_blank",
    },
  },
  "meta": { "phone": "+919812345678" },
}
```

Values are URL-encoded by default. `|digits` strips everything but digits (needed for phone numbers
in a path segment) and `|raw` interpolates verbatim.

### `analytics` and `theme`

`analytics.gtagId` enables GA4 events, and does nothing when it is absent — there is no hardcoded
measurement id. `theme.fontFamily` and `theme.fontUrl` load a stylesheet into the shadow root, so
fonts are opt-in per widget instead of a global side effect.

### What is deliberately missing

No `customCss` or `customJs`. A config document is operator input that gets served to every visitor;
arbitrary CSS and JS in it is stored XSS with extra steps. Presentation you need beyond the core keys
belongs in your iframe app, which is already a separate origin.

## `view` and `meta`

Both are free-form objects whose shape comes from the widget's own schema. The distinction is
convention, not enforcement:

- **`view`** — what the widget renders: copy, toggles, feature flags, colors it manages itself.
- **`meta`** — data about the install: a phone number, a logo URL, an account id.

They validate with the same strictness as the core keys. `additionalProperties: false` is the default,
so a typo in a key name fails the save instead of silently doing nothing.

## Validation

`buildWidgetConfigSchema(parts)` composes the full schema: core keys, plus the template's `launcher`
additions, `view`, and `meta`. Ajv validates against it in three places, all the same schema:

1. **Save** — invalid values are rejected with per-field errors, so the panel shows them while
   editing rather than once the widget is already live.
2. **Publish** — revalidated, which catches the one config a save never saw: the template defaults a
   widget is created with.
3. **Health** — `isConfigComplete()` decides whether a widget shows as `CONFIG_REQUIRED`.

Each widget stores a **snapshot** of its template's schema parts at creation time. Editing a template
afterwards cannot invalidate a live widget's config; new widgets get the new parts.

## Schema-to-form

The admin form is generated, never hand-written: `schemaToFormFields()` walks the JSON Schema and
emits field descriptors, so adding a property to a template's schema adds an input to the panel.
Annotations control presentation:

| Annotation                     | Effect                                         |
| ------------------------------ | ---------------------------------------------- |
| `x-ui-hidden: true`            | Omit the field from the form                   |
| `x-ui-note` (or `description`) | Helper text under the input                    |
| `x-ui-placeholder`             | Input placeholder                              |
| `title`                        | Label override, otherwise the key is humanized |

The control type follows the schema: `enum` becomes a select, `format: uri` a URL input, `format:
email` an email input, a hex-code `pattern` a color picker, `maxLength > 240` a textarea, `boolean` a
checkbox, `object` a collapsible group, and `array` a repeatable group. `minLength`, `maximum`,
`pattern`, and `required` come through as client-side validators as well, so the form catches most
mistakes before the request.
