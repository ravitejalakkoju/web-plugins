import Ajv from 'ajv';
import type { ErrorObject, ValidateFunction } from 'ajv';
import addFormatsImport from 'ajv-formats';
import { coreConfigSchema, type JsonSchema } from './core-schema.js';

// ajv and ajv-formats are CJS; under ESM the callable lands on `.default`.
const AjvCtor = ((Ajv as unknown as { default?: typeof Ajv }).default ?? Ajv) as typeof Ajv;
const addFormats = ((addFormatsImport as unknown as { default?: typeof addFormatsImport })
  .default ?? addFormatsImport) as typeof addFormatsImport;

export interface ConfigValidationError {
  /** JSON pointer into the config, e.g. `/colors/primaryColor`. */
  path: string;
  message: string;
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: ConfigValidationError[];
}

/**
 * `coerceTypes` is on because configs arrive from HTML forms where numbers and
 * booleans are strings. The original used `'array'`, which also wraps scalars
 * into arrays; plain coercion is enough and less surprising.
 */
function createValidator(): Ajv {
  const ajv = new AjvCtor({
    allErrors: true,
    coerceTypes: true,
    useDefaults: true,
    strict: false,
  });
  addFormats(ajv, ['uri', 'uri-reference', 'email']);
  return ajv;
}

const sharedAjv = createValidator();

const MAX_CACHED_VALIDATORS = 100;
const validatorCache = new Map<string, ValidateFunction>();

function compile(schema: JsonSchema): ValidateFunction {
  const key = JSON.stringify(schema);
  const cached = validatorCache.get(key);
  if (cached) return cached;

  const validate = sharedAjv.compile(schema);
  if (validatorCache.size >= MAX_CACHED_VALIDATORS) {
    const oldest = validatorCache.keys().next().value;
    if (oldest !== undefined) validatorCache.delete(oldest);
  }
  validatorCache.set(key, validate);
  return validate;
}

function formatErrors(errors: ErrorObject[] | null | undefined): ConfigValidationError[] {
  if (!errors) return [];
  return errors.map((error) => ({
    path: error.instancePath || '/',
    message:
      error.keyword === 'additionalProperties' && error.params?.additionalProperty
        ? `unexpected property "${error.params.additionalProperty}"`
        : (error.message ?? 'is invalid'),
  }));
}

/**
 * Validate a config document. Mutates `data` when coercion or defaults apply,
 * which is what callers want before persisting a draft.
 */
export function validateConfig(schema: JsonSchema, data: unknown): ConfigValidationResult {
  const validate = compile(schema);
  const valid = validate(data) as boolean;
  return { valid, errors: valid ? [] : formatErrors(validate.errors) };
}

/**
 * Whether a config satisfies its schema well enough to install. Replaces
 * `isBaseConfigComplete`, which had to guess the shape from a widget type.
 */
export function isConfigComplete(config: unknown, schema?: JsonSchema | null): boolean {
  if (!config || typeof config !== 'object') return false;
  const structuredClone = JSON.parse(JSON.stringify(config));
  return validateConfig(schema ?? coreConfigSchema, structuredClone).valid;
}
