import type { IdentifyPayload } from '@web-plugins/protocol/rpc';
import type { ResolvedIdentity } from './types.js';

/**
 * Visitor identity, ported from `IdentityManager`.
 *
 * Kept: the cross-tab localStorage lock, the BroadcastChannel handoff so a second
 * tab reuses the first tab's session instead of minting another, and the
 * source-priority merge that stops a low-trust enricher from overwriting a JWT
 * claim.
 *
 * Changed: the endpoints moved under `/v1/sessions` to sit with the rest of the
 * visitor-facing API, it is inert unless a base URL is configured (set
 * `IDENTITY_ENABLED=false` on the server to switch it off), and enrichers are
 * registered by the host page instead of one payment-provider enricher being
 * compiled in.
 */

const IDENTITY_KEY = 'wp_identity';
const RESTORE_KEY = 'wp_restore_id';
const LOCK_KEY = 'wp_identity_lock';
const LOCK_TTL_MS = 5000;
const CHANNEL_NAME = 'wp_identity';

/** Lower wins when two sources claim the same field. */
const SOURCE_PRIORITY: Record<string, number> = {
  jwt: 1,
  host: 2,
  enricher: 3,
};

const priorityOf = (source: string): number => SOURCE_PRIORITY[source] ?? 100;

export interface EnricherContext {
  getCookie(name: string): string | null;
  getLocalStorage(key: string): string | null;
  setLocalStorage(key: string, value: string): void;
  fetchJson<T>(url: string, init?: RequestInit): Promise<T | null>;
}

export interface IdentityEnricher {
  id: string;
  priority?: number;
  canRun?(context: EnricherContext): boolean;
  /** Stable key so a given visitor is only enriched once. */
  getCacheKey?(context: EnricherContext): string | null;
  fetch(context: EnricherContext): Promise<IdentifyPayload | null>;
}

interface IdentityField {
  value: string;
  source: string;
}

interface StoredIdentity {
  token: string;
  fields: Record<string, IdentityField | undefined>;
  meta?: Record<string, unknown>;
}

export class IdentityManager {
  readonly enabled: boolean;
  private readonly baseUrl: string;
  private readonly channel: BroadcastChannel | null;
  private readonly enrichers: IdentityEnricher[] = [];
  private initPromise: Promise<ResolvedIdentity | null> | null = null;

  onIdentityUpdated: ((identity: ResolvedIdentity) => void) | null = null;

  constructor(baseUrl?: string | null) {
    this.baseUrl = (baseUrl ?? '').replace(/\/+$/, '');
    this.enabled = Boolean(this.baseUrl);

    this.channel =
      this.enabled && typeof BroadcastChannel !== 'undefined'
        ? new BroadcastChannel(CHANNEL_NAME)
        : null;

    this.channel?.addEventListener('message', (event) => {
      const data = event.data as { type?: string; payload?: StoredIdentity };
      if (data?.type === 'request') {
        const current = this.readStored();
        if (current?.token) this.channel?.postMessage({ type: 'ready', payload: current });
        return;
      }
      if (data?.type === 'ready' && data.payload?.token) {
        const current = this.readStored();
        if (current?.token === data.payload.token) return;
        this.writeStored(data.payload, { emit: true });
      }
    });
  }

  registerEnricher(enricher: IdentityEnricher): void {
    if (!enricher?.id || typeof enricher.fetch !== 'function') return;
    if (this.enrichers.some((existing) => existing.id === enricher.id)) return;
    this.enrichers.push(enricher);
  }

  // ---- storage -------------------------------------------------------------

  private readStored(): StoredIdentity | null {
    try {
      const raw = window.localStorage.getItem(IDENTITY_KEY);
      return raw ? (JSON.parse(raw) as StoredIdentity) : null;
    } catch {
      return null;
    }
  }

  private writeStored(identity: StoredIdentity, options: { emit?: boolean } = {}): void {
    try {
      window.localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
    } catch {
      /* private mode */
    }
    if (options.emit !== false) {
      this.onIdentityUpdated?.(this.resolve(identity));
      this.channel?.postMessage({ type: 'ready', payload: identity });
    }
  }

  private readRestoreId(): string | null {
    try {
      return window.localStorage.getItem(RESTORE_KEY);
    } catch {
      return null;
    }
  }

  private writeRestoreId(restoreId: string): void {
    try {
      window.localStorage.setItem(RESTORE_KEY, restoreId);
    } catch {
      /* ignore */
    }
  }

  private lockActive(): boolean {
    try {
      const at = Number(window.localStorage.getItem(LOCK_KEY) ?? '0');
      return Date.now() - at < LOCK_TTL_MS;
    } catch {
      return false;
    }
  }

  private acquireLock(): void {
    try {
      window.localStorage.setItem(LOCK_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  }

  private releaseLock(): void {
    try {
      window.localStorage.removeItem(LOCK_KEY);
    } catch {
      /* ignore */
    }
  }

  // ---- token helpers -------------------------------------------------------

  private decodeToken(token: string): Record<string, any> {
    try {
      const payload = token.split('.')[1] ?? '';
      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
      return JSON.parse(atob(padded));
    } catch {
      return {};
    }
  }

  private fromToken(token: string, meta?: Record<string, unknown>): StoredIdentity {
    const claims = this.decodeToken(token);
    const field = (value: unknown): IdentityField | undefined =>
      value ? { value: String(value), source: 'jwt' } : undefined;

    return {
      token,
      fields: {
        externalId: field(claims.externalId),
        // No 'Anonymous User' placeholder here, unlike the original. Writing one
        // recorded a display default as a `jwt`-sourced field, which then outranked
        // every real name the host page supplied. `resolve` applies the fallback.
        name: field(claims.name),
        email: field(claims.email),
        phone: field(claims.phone),
        company: field(claims.company),
      },
      meta: this.withPageMeta(meta),
    };
  }

  private withPageMeta(meta?: Record<string, unknown>): Record<string, unknown> {
    return {
      ...(meta ?? {}),
      sourceUrl: window.location?.href ?? null,
      referrerUrl: (meta?.referrerUrl as string) || document.referrer || null,
    };
  }

  resolve(identity: StoredIdentity): ResolvedIdentity {
    const fields = identity.fields ?? {};
    return {
      token: identity.token,
      externalId: fields.externalId?.value,
      name: fields.name?.value ?? 'Anonymous User',
      email: fields.email?.value,
      phone: fields.phone?.value,
      company: fields.company?.value,
      meta: identity.meta,
    };
  }

  getIdentity(): ResolvedIdentity | null {
    const stored = this.readStored();
    return stored?.token ? this.resolve(stored) : null;
  }

  // ---- network -------------------------------------------------------------

  private async postJson<T>(path: string, body?: unknown, token?: string): Promise<T | null> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) return null;
      return (await response.json()) as T;
    } catch {
      return null;
    }
  }

  private waitForChannelIdentity(timeoutMs = 250): Promise<StoredIdentity | null> {
    const channel = this.channel;
    if (!channel) return Promise.resolve(null);

    return new Promise((resolve) => {
      let settled = false;
      const handler = (event: MessageEvent) => {
        const data = event.data as { type?: string; payload?: StoredIdentity };
        if (data?.type === 'ready' && data.payload?.token) {
          settled = true;
          channel.removeEventListener('message', handler);
          resolve(data.payload);
        }
      };

      channel.addEventListener('message', handler);
      channel.postMessage({ type: 'request' });

      window.setTimeout(() => {
        if (settled) return;
        channel.removeEventListener('message', handler);
        resolve(null);
      }, timeoutMs);
    });
  }

  /** Create or restore a visitor session. Safe to call repeatedly. */
  async initialize(): Promise<ResolvedIdentity | null> {
    if (!this.enabled) return null;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const existing = this.readStored();
      if (existing?.token) {
        await this.runEnrichers();
        return this.getIdentity();
      }

      const fromChannel = await this.waitForChannelIdentity();
      if (fromChannel?.token) {
        this.writeStored(fromChannel, { emit: true });
        await this.runEnrichers();
        return this.getIdentity();
      }

      while (this.lockActive()) {
        await new Promise((resolve) => window.setTimeout(resolve, 200));
        const again = this.readStored();
        if (again?.token) {
          await this.runEnrichers();
          return this.getIdentity();
        }
      }

      this.acquireLock();
      try {
        const restoreId = this.readRestoreId();
        if (restoreId) {
          const restored = await this.postJson<{ token: string; restoreId: string }>(
            '/v1/sessions/restore',
            { restoreId },
          );
          if (restored?.token) {
            this.writeStored(this.fromToken(restored.token), { emit: true });
            this.writeRestoreId(restored.restoreId);
            await this.runEnrichers();
            return this.getIdentity();
          }
        }

        const created = await this.postJson<{ token: string; restoreId: string }>('/v1/sessions');
        if (created?.token) {
          this.writeStored(this.fromToken(created.token), { emit: true });
          this.writeRestoreId(created.restoreId);
          await this.runEnrichers();
          return this.getIdentity();
        }

        return null;
      } finally {
        this.releaseLock();
      }
    })();

    try {
      return await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private enricherContext(): EnricherContext {
    return {
      getCookie: (name) => {
        const match = document.cookie.split('; ').find((row) => row.startsWith(`${name}=`));
        return match ? decodeURIComponent(match.split('=')[1] ?? '') : null;
      },
      getLocalStorage: (key) => {
        try {
          return window.localStorage.getItem(key);
        } catch {
          return null;
        }
      },
      setLocalStorage: (key, value) => {
        try {
          window.localStorage.setItem(key, value);
        } catch {
          /* ignore */
        }
      },
      fetchJson: async <T>(url: string, init?: RequestInit) => {
        try {
          const response = await fetch(url, init);
          if (!response.ok) return null;
          return (await response.json()) as T;
        } catch {
          return null;
        }
      },
    };
  }

  private async runEnrichers(): Promise<void> {
    if (!this.enrichers.length) return;
    const identity = this.readStored();
    if (!identity?.token) return;

    const context = this.enricherContext();
    const sorted = [...this.enrichers].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));

    for (const enricher of sorted) {
      try {
        if (enricher.canRun && !enricher.canRun(context)) continue;

        const cacheKey = enricher.getCacheKey?.(context) ?? null;
        const usedKey = cacheKey ? `wp_enricher_used:${enricher.id}:${cacheKey}` : null;
        if (usedKey && context.getLocalStorage(usedKey)) continue;

        const data = await enricher.fetch(context);
        if (!data) continue;
        if (!data.email && !data.phone && !data.name && !data.company && !data.meta) continue;

        await this.identify(data, 'enricher');
        if (usedKey) context.setLocalStorage(usedKey, '1');
      } catch (error) {
        console.warn(`[web-plugins] enricher "${enricher.id}" failed`, error);
      }
    }
  }

  private mergeField(
    identity: StoredIdentity,
    key: string,
    value: string | undefined,
    source: string,
  ): void {
    if (!value) return;
    if (!identity.fields) identity.fields = {};

    const current = identity.fields[key];
    if (current && priorityOf(source) > priorityOf(current.source)) return;
    identity.fields[key] = { value, source };
  }

  /** Attach known traits to the current session. */
  async identify(user: IdentifyPayload, source = 'host'): Promise<ResolvedIdentity | null> {
    if (!this.enabled) return null;

    let stored = this.readStored();
    if (!stored?.token) {
      await this.initialize();
      stored = this.readStored();
    }
    if (!stored?.token) return null;

    this.mergeField(stored, 'externalId', user.externalId, source);
    this.mergeField(stored, 'name', user.name, source);
    this.mergeField(stored, 'email', user.email, source);
    this.mergeField(stored, 'phone', user.phone, source);
    this.mergeField(stored, 'company', user.company, source);
    stored.meta = this.withPageMeta({ ...(stored.meta ?? {}), ...(user.meta ?? {}) });

    const resolved = this.resolve(stored);
    const fields = stored.fields ?? {};
    const response = await this.postJson<{ token: string; restoreId: string }>(
      '/v1/sessions/identify',
      {
        token: stored.token,
        // Sent from the fields rather than from `resolved`, which carries display
        // fallbacks. Posting those would persist 'Anonymous User' as a real name.
        externalId: fields.externalId?.value,
        name: fields.name?.value,
        email: fields.email?.value,
        phone: fields.phone?.value,
        company: fields.company?.value,
        sourceUrl: resolved.meta?.sourceUrl,
        referrerUrl: resolved.meta?.referrerUrl,
      },
      stored.token,
    );

    if (response?.token) {
      const next = this.fromToken(response.token, stored.meta);
      // The response echoes back what was just sent, so a claim appearing in it is
      // not evidence of a higher-trust source. Keep the source each field already
      // had unless the server actually changed the value, otherwise the first
      // identify would relabel everything `jwt` and freeze it against later calls.
      for (const [key, field] of Object.entries(fields)) {
        if (!field) continue;
        const echoed = next.fields[key];
        if (!echoed || echoed.value === field.value) next.fields[key] = field;
      }
      this.writeStored(next, { emit: true });
      this.writeRestoreId(response.restoreId);
      return this.getIdentity();
    }

    this.writeStored(stored, { emit: true });
    return resolved;
  }

  async trackEvent(widgetId: string, name: string, props?: Record<string, unknown>): Promise<void> {
    if (!this.enabled) return;

    let identity = this.getIdentity();
    if (!identity?.token) {
      await this.initialize();
      identity = this.getIdentity();
    }
    if (!identity?.token) return;

    await this.postJson(
      '/v1/sessions/events',
      {
        type: 'click',
        name,
        url: window.location?.href ?? null,
        widgetId,
        metadata: props ?? null,
      },
      identity.token,
    );
  }

  clear(): void {
    try {
      window.localStorage.removeItem(IDENTITY_KEY);
      window.localStorage.removeItem(RESTORE_KEY);
      window.localStorage.removeItem(LOCK_KEY);
      Object.keys(window.localStorage)
        .filter((key) => key.startsWith('wp_enricher_used:'))
        .forEach((key) => window.localStorage.removeItem(key));
    } catch {
      /* ignore */
    }
  }

  destroy(): void {
    this.channel?.close();
  }
}
