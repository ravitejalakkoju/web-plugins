import { HEX_COLOR_PATTERN, type JsonSchema } from '../config/core-schema.js';
import type { FormField, FormFieldType, FormValidator } from './types.js';

/**
 * Turn a JSON Schema into a field list the panel can render.
 *
 * Ported from `dynamic-form-config.ts` with three fixes: `required` from the
 * parent schema is now applied (it was computed but never passed), array items
 * keep every property instead of only the first, and hex/number/long-text
 * fields get specific control types.
 */

function getFieldType(prop: JsonSchema): FormFieldType {
  if (prop.enum) return 'select';
  if (prop.type === 'boolean') return 'checkbox';
  if (prop.type === 'array') return 'array';
  if (prop.type === 'object') return 'group';
  if (prop.type === 'integer' || prop.type === 'number') return 'number';
  if (prop.type === 'string') {
    if (prop.format === 'email') return 'email';
    if (prop.format === 'uri' || prop.format === 'uri-reference') return 'url';
    if (prop.pattern === HEX_COLOR_PATTERN) return 'color';
    if (typeof prop.maxLength === 'number' && prop.maxLength > 240) return 'textarea';
  }
  return 'text';
}

function extractValidators(schema: JsonSchema, isRequired: boolean): FormValidator[] {
  const validators: FormValidator[] = [];

  if (isRequired) validators.push({ type: 'required' });
  if (schema.format === 'email') validators.push({ type: 'email' });
  if (typeof schema.minLength === 'number')
    validators.push({ type: 'minLength', value: schema.minLength });
  if (typeof schema.maxLength === 'number')
    validators.push({ type: 'maxLength', value: schema.maxLength });
  if (typeof schema.minimum === 'number') validators.push({ type: 'min', value: schema.minimum });
  if (typeof schema.maximum === 'number') validators.push({ type: 'max', value: schema.maximum });
  if (typeof schema.pattern === 'string')
    validators.push({ type: 'pattern', value: schema.pattern });

  return validators;
}

export function toReadableLabel(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (s) => s.toUpperCase());
}

export function schemaToFormFields(schema: JsonSchema | null | undefined): FormField[] {
  if (!schema || schema.type !== 'object' || !schema.properties) return [];

  const required: string[] = Array.isArray(schema.required) ? schema.required : [];

  const entries = Object.entries(schema.properties as Record<string, JsonSchema>).filter(
    ([, property]) => property['x-ui-hidden'] !== true,
  );

  return entries.map(([key, property]) => {
    const field: FormField = {
      name: key,
      type: getFieldType(property),
      label: toReadableLabel(property.title ?? key),
      validators: extractValidators(property, required.includes(key)),
    };

    if (property['x-ui-placeholder']) field.placeholder = property['x-ui-placeholder'];
    if (property['x-ui-note'] ?? property.description)
      field.note = property['x-ui-note'] ?? property.description;
    if (property.default !== undefined) field.defaultValue = property.default;

    if (property.enum) {
      field.type = 'select';
      field.options = (property.enum as unknown[])
        .filter((value): value is string | number => value !== null)
        .map((value) => ({ label: toReadableLabel(String(value)), value: String(value) }));
    }

    if (property.type === 'object' && property.properties) {
      field.type = 'group';
      field.children = schemaToFormFields(property);
    }

    if (property.type === 'array' && property.items && !Array.isArray(property.items)) {
      const items = property.items as JsonSchema;
      field.type = 'array';
      field.item =
        items.type === 'object'
          ? {
              name: 'item',
              type: 'group',
              label: toReadableLabel(key),
              children: schemaToFormFields(items),
            }
          : {
              name: 'item',
              type: getFieldType(items),
              label: toReadableLabel(key),
              validators: extractValidators(items, false),
            };
    }

    return field;
  });
}
