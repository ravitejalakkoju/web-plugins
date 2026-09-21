import type { ConfigEnvelope, VersionEnvelope } from '@web-plugins/protocol/config';

/**
 * Version-first config cache, ported from `CacheManager`: fetch the cheap
 * version endpoint, and only re-download the document when it moved.
 *
 * The original assumed the Cache API. That needs a secure context, so plain-HTTP
 * installs threw. Storage now degrades to localStorage and then to memory.
 */

interface CacheStore {
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

const memoryStore = (): CacheStore => {
  const map = new Map<string, unknown>();
  return {
    async get(key) {
      return map.has(key) ? map.get(key) : null;
    },
    async set(key, value) {
      map.set(key, value);
    },
    async remove(key) {
      map.delete(key);
    },
  };
};

const localStorageStore = (namespace: string): CacheStore | null => {
  try {
    const probe = `${namespace}:probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
  } catch {
    return null;
  }

  return {
    async get(key) {
      try {
        const raw = window.localStorage.getItem(`${namespace}:${key}`);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    async set(key, value) {
      try {
        window.localStorage.setItem(`${namespace}:${key}`, JSON.stringify(value));
      } catch {
        /* quota or private mode: caching is best effort */
      }
    },
    async remove(key) {
      try {
        window.localStorage.removeItem(`${namespace}:${key}`);
      } catch {
        /* ignore */
      }
    },
  };
};

const cacheApiStore = (namespace: string): CacheStore | null => {
  // `typeof caches` is not enough: in a sandboxed iframe without
  // allow-same-origin the getter itself throws, which used to take the whole
  // host down before it rendered.
  try {
    if (typeof caches === 'undefined') return null;
  } catch {
    return null;
  }

  const urlFor = (key: string) =>
    `https://web-plugins.invalid/${namespace}/${encodeURIComponent(key)}`;

  return {
    async get(key) {
      try {
        const cache = await caches.open(namespace);
        const response = await cache.match(urlFor(key));
        if (!response) return null;
        return JSON.parse(await response.text());
      } catch {
        return null;
      }
    },
    async set(key, value) {
      try {
        const cache = await caches.open(namespace);
        await cache.put(
          urlFor(key),
          new Response(JSON.stringify(value), {
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      } catch {
        /* ignore */
      }
    },
    async remove(key) {
      try {
        const cache = await caches.open(namespace);
        await cache.delete(urlFor(key));
      } catch {
        /* ignore */
      }
    },
  };
};

const isEnvelope = (value: unknown): value is ConfigEnvelope =>
  Boolean(value) &&
  typeof value === 'object' &&
  typeof (value as ConfigEnvelope).version === 'number' &&
  Boolean((value as ConfigEnvelope).config);

export class CacheManager {
  private readonly store: CacheStore;

  constructor(namespace = 'wp_config_cache') {
    this.store = cacheApiStore(namespace) ?? localStorageStore(namespace) ?? memoryStore();
  }

  private async fetchJson<T>(url: string): Promise<T | null> {
    try {
      const response = await fetch(url, { credentials: 'omit' });
      if (!response.ok) return null;
      return (await response.json()) as T;
    } catch {
      return null;
    }
  }

  async read(key: string): Promise<ConfigEnvelope | null> {
    const cached = await this.store.get(key);
    if (!cached) return null;
    if (!isEnvelope(cached)) {
      await this.store.remove(key);
      return null;
    }
    return cached;
  }

  async write(key: string, envelope: ConfigEnvelope): Promise<void> {
    await this.store.set(key, envelope);
  }

  async clear(key: string): Promise<void> {
    await this.store.remove(key);
  }

  /**
   * Returns the freshest config available, preferring the network but never
   * failing closed while a cached copy exists.
   */
  async resolve(
    key: string,
    configUrl: string,
    versionUrl: string,
  ): Promise<ConfigEnvelope | null> {
    const cached = await this.read(key);

    if (cached) {
      const remote = await this.fetchJson<VersionEnvelope>(versionUrl);
      if (!remote || typeof remote.version !== 'number') return cached;
      if (remote.version === cached.version) return cached;
    }

    const fresh = await this.fetchJson<ConfigEnvelope>(configUrl);
    if (!isEnvelope(fresh)) return cached;

    await this.write(key, fresh);
    return fresh;
  }
}
