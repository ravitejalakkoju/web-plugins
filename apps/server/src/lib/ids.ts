import { randomBytes, randomUUID } from 'node:crypto';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Short, URL-safe, unguessable id for public identifiers such as the widget id
 * that ends up in the script tag. 12 chars of base62 is ~71 bits.
 */
export function shortId(length = 12): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let index = 0; index < length; index += 1) {
    out += ALPHABET[bytes[index]! % ALPHABET.length];
  }
  return out;
}

export const uuid = (): string => randomUUID();

/** Lowercase, hyphenated identifier derived from a display name. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}
