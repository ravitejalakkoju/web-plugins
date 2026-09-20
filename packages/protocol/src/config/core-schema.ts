import { CHROME_MODES, PAGE_RULE_OPERATORS } from './types.js';

/**
 * JSON Schema for the core config keys. Ported from the `web-extensions`
 * validator, minus `customCss` / `customJs` (arbitrary CSS and JS in a config
 * document is a stored-XSS surface), plus `chrome`, `src` and `frame`.
 */

export type JsonSchema = Record<string, any>;

const hexCodePattern = '^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$';
const svgPattern = '^\\s*<svg[\\s\\S]*</svg>\\s*$';
const noScriptPattern = '^(?!.*<script)[\\s\\S]*$';

export const deviceTogglesSchema: JsonSchema = {
  type: 'object',
  properties: {
    desktop: { type: 'boolean' },
    mobile: { type: 'boolean' },
  },
  required: ['desktop', 'mobile'],
  additionalProperties: false,
};

export const visibilitySchema: JsonSchema = {
  type: 'object',
  properties: {
    device: deviceTogglesSchema,
    pages: {
      type: 'object',
      properties: {
        specific: { type: 'boolean' },
        values: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              operator: { type: 'string', enum: [...PAGE_RULE_OPERATORS] },
              value: { type: 'string' },
            },
            required: ['operator', 'value'],
            additionalProperties: false,
          },
        },
      },
      required: ['specific'],
      additionalProperties: false,
    },
  },
  required: ['device', 'pages'],
  additionalProperties: false,
};

export const colorsSchema: JsonSchema = {
  type: 'object',
  properties: {
    primaryColor: { type: 'string', pattern: hexCodePattern },
    primaryTextColor: { type: 'string', pattern: hexCodePattern, nullable: true },
    secondaryTextColor: { type: 'string', pattern: hexCodePattern, nullable: true },
    primaryBackgroundColor: { type: 'string', pattern: hexCodePattern, nullable: true },
  },
  required: ['primaryColor'],
  additionalProperties: false,
};

const placementSideSchema: JsonSchema = {
  type: 'object',
  properties: {
    align: { type: 'string', enum: ['left', 'right', 'center'] },
    values: {
      type: 'object',
      properties: {
        side: { type: 'integer', minimum: 0 },
        bottom: { type: 'integer', minimum: 0 },
      },
      required: ['side'],
      additionalProperties: false,
    },
  },
  required: ['align'],
  additionalProperties: false,
};

export const placementSchema: JsonSchema = {
  type: 'object',
  properties: {
    desktop: placementSideSchema,
    mobile: placementSideSchema,
  },
  required: ['desktop', 'mobile'],
  additionalProperties: false,
};

export const chromeSchema: JsonSchema = {
  type: 'string',
  enum: [...CHROME_MODES],
};

export const srcSchema: JsonSchema = {
  type: 'string',
  format: 'uri-reference',
  nullable: true,
  maxLength: 2048,
};

export const frameSchema: JsonSchema = {
  type: 'object',
  properties: {
    height: { type: 'integer', minimum: 120, maximum: 2000 },
    width: { type: 'integer', minimum: 120, maximum: 2000 },
    position: { type: 'string', enum: ['absolute', 'relative'] },
  },
  additionalProperties: false,
};

export const analyticsSchema: JsonSchema = {
  type: 'object',
  properties: {
    gtagId: { type: 'string', nullable: true, maxLength: 64 },
  },
  additionalProperties: false,
};

export const themeSchema: JsonSchema = {
  type: 'object',
  properties: {
    fontFamily: { type: 'string', nullable: true, maxLength: 256 },
    fontUrl: { type: 'string', format: 'uri', nullable: true, maxLength: 1024 },
  },
  additionalProperties: false,
};

/** Launcher keys the runtime itself understands. Templates may add their own. */
export const launcherCoreSchema: JsonSchema = {
  type: 'object',
  properties: {
    label: { type: 'string', nullable: true, maxLength: 120 },
    tooltip: { type: 'string', nullable: true, maxLength: 120 },
    icon: {
      type: 'object',
      properties: {
        svg: {
          type: 'string',
          nullable: true,
          maxLength: 20000,
          allOf: [{ pattern: svgPattern }, { pattern: noScriptPattern }],
        },
        url: { type: 'string', format: 'uri', nullable: true, maxLength: 1024 },
      },
      additionalProperties: false,
    },
    callout: {
      type: 'object',
      properties: {
        text: { type: 'string', nullable: true, maxLength: 240 },
        mode: {
          type: 'string',
          enum: ['slide_in', 'expand', 'typing_expand'],
          nullable: true,
        },
        show: deviceTogglesSchema,
      },
      additionalProperties: false,
    },
    autoOpen: { type: 'boolean', nullable: true },
    timer: { type: 'integer', minimum: 0, maximum: 600, nullable: true },
    action: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['open', 'open-url'] },
        url: { type: 'string', nullable: true, maxLength: 2048 },
        target: { type: 'string', enum: ['_blank', '_self'] },
      },
      required: ['type'],
      additionalProperties: false,
    },
  },
  additionalProperties: false,
};

/** The variable parts a template contributes on top of the core schema. */
export interface WidgetSchemaParts {
  /** Extra `launcher` properties, merged into `launcherCoreSchema`. */
  launcher?: JsonSchema;
  /** Shape of `config.view`. */
  view?: JsonSchema;
  /** Shape of `config.meta`. */
  meta?: JsonSchema;
}

const mergeObjectSchemas = (base: JsonSchema, extra?: JsonSchema): JsonSchema => {
  if (!extra) return base;
  return {
    ...base,
    ...extra,
    type: 'object',
    properties: { ...(base.properties ?? {}), ...(extra.properties ?? {}) },
    required: Array.from(new Set([...(base.required ?? []), ...(extra.required ?? [])])),
    additionalProperties: extra.additionalProperties ?? base.additionalProperties ?? false,
  };
};

/**
 * Compose the full schema for one widget: core keys plus the template's
 * `launcher` / `view` / `meta` contributions. Mirrors `generateSchema` from the
 * original `web-extensions` validator, which is why saved configs stay valid.
 */
export function buildWidgetConfigSchema(
  parts: WidgetSchemaParts = {},
  options: { additionalProperties?: boolean } = {},
): JsonSchema {
  const required = ['chrome', 'visibility', 'colors', 'placement'];
  if (parts.view) required.push('view');
  if (parts.meta) required.push('meta');

  return {
    type: 'object',
    properties: {
      version: { type: 'integer', minimum: 0, 'x-ui-hidden': true },
      chrome: chromeSchema,
      src: srcSchema,
      frame: frameSchema,
      visibility: visibilitySchema,
      colors: colorsSchema,
      placement: placementSchema,
      launcher: mergeObjectSchemas(launcherCoreSchema, parts.launcher),
      analytics: analyticsSchema,
      theme: themeSchema,
      ...(parts.view ? { view: parts.view } : {}),
      ...(parts.meta ? { meta: parts.meta } : {}),
    },
    required,
    additionalProperties: options.additionalProperties ?? false,
  };
}

/**
 * Core-only schema. Tolerates unknown keys so it can check the runtime contract
 * of a config whose template schema is not at hand.
 */
export const coreConfigSchema: JsonSchema = buildWidgetConfigSchema(
  {},
  { additionalProperties: true },
);
