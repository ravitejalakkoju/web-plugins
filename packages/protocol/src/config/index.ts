// Schema and types only. `validate.ts` is deliberately not re-exported here so
// browser bundles can import the config contract without pulling in ajv.
export * from './types.js';
export * from './core-schema.js';
