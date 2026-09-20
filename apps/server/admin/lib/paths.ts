type Bag = Record<string, unknown>;

const isBag = (value: unknown): value is Bag =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function getPath(source: unknown, path: (string | number)[]): unknown {
  return path.reduce<unknown>((current, key) => {
    if (Array.isArray(current) && typeof key === 'number') return current[key];
    if (isBag(current)) return current[String(key)];
    return undefined;
  }, source);
}

/**
 * Structural copy-on-write down `path`. The form edits one leaf at a time, and a
 * fresh object at every level is what lets the preview diff cheaply on identity.
 */
export function setPath<T>(source: T, path: (string | number)[], value: unknown): T {
  if (path.length === 0) return value as T;

  const [key, ...rest] = path;

  if (typeof key === 'number') {
    const list = Array.isArray(source) ? [...(source as unknown[])] : [];
    list[key] = setPath(list[key], rest, value);
    return list as unknown as T;
  }

  const bag: Bag = isBag(source) ? { ...source } : {};
  bag[key] = setPath(bag[key], rest, value);
  return bag as unknown as T;
}

export function removeIndex<T>(source: T, path: (string | number)[], index: number): T {
  const list = getPath(source, path);
  const next = Array.isArray(list) ? list.filter((_, i) => i !== index) : [];
  return setPath(source, path, next);
}

export function appendItem<T>(source: T, path: (string | number)[], item: unknown): T {
  const list = getPath(source, path);
  const next = Array.isArray(list) ? [...list, item] : [item];
  return setPath(source, path, next);
}
