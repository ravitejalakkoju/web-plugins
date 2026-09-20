import { and, eq, gt } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Database } from '../db/client.js';
import { visitorEvent, visitorSession, widget, type VisitorSessionRow } from '../db/schema.js';
import {
  signVisitorToken,
  VISITOR_TOKEN_TTL_SECONDS,
  type VisitorTraits,
} from '../lib/visitor-token.js';

/** What the runtime gets back from every session call. */
export interface SessionCredentials {
  token: string;
  restoreId: string;
}

/** Request-derived facts. Never taken from the body, which a visitor controls. */
export interface ClientContext {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface IdentifyInput extends VisitorTraits {
  meta?: Record<string, unknown>;
}

export interface EventInput {
  sessionId: string;
  projectId: string;
  widgetId?: string | null;
  type?: string;
  name: string;
  url?: string | null;
  metadata?: Record<string, unknown> | null;
}

const MAX_META_KEYS = 50;

/** Cap what an anonymous caller can write into a JSONB column. */
const boundMeta = (meta: Record<string, unknown> | null | undefined): Record<string, unknown> => {
  if (!meta || typeof meta !== 'object') return {};
  return Object.fromEntries(Object.entries(meta).slice(0, MAX_META_KEYS));
};

/**
 * Visitor sessions and their events.
 *
 * Every route reaching this is unauthenticated, so two rules hold throughout:
 * a session is only ever resolved from a signed token or an unguessable
 * `restoreId`, and traits are written to the session that presented the
 * credential. Nothing here looks a visitor up by email or `externalId`.
 */
export class SessionService {
  constructor(
    private readonly db: Database,
    private readonly options: { tokenSecret: string },
  ) {}

  /**
   * A row's lifetime has to track the token's, because every call that touches a
   * session also hands back a token minted from now. Letting the row expire first
   * would leave a visitor holding a token this server refuses to honour.
   */
  private expiry(): Date {
    return new Date(Date.now() + VISITOR_TOKEN_TTL_SECONDS * 1000);
  }

  private async credentials(row: VisitorSessionRow): Promise<SessionCredentials> {
    const token = await signVisitorToken(this.options.tokenSecret, row.id, {
      externalId: row.externalId,
      name: row.name,
      email: row.email,
      phone: row.phone,
      company: row.company,
    });
    return { token, restoreId: row.restoreId };
  }

  /** Mint an anonymous session. Traits are optional: `identify` can arrive later. */
  async create(input: {
    projectId: string;
    client: ClientContext;
    traits?: IdentifyInput;
  }): Promise<SessionCredentials> {
    const traits = input.traits ?? {};
    const identified = Boolean(traits.externalId || traits.email || traits.phone);
    const now = new Date();

    const [row] = await this.db
      .insert(visitorSession)
      .values({
        id: randomUUID(),
        projectId: input.projectId,
        restoreId: randomUUID(),
        externalId: traits.externalId ?? null,
        name: traits.name ?? null,
        email: traits.email ?? null,
        phone: traits.phone ?? null,
        company: traits.company ?? null,
        ipAddress: input.client.ipAddress,
        userAgent: input.client.userAgent,
        meta: boundMeta(traits.meta),
        identifiedAt: identified ? now : null,
        expiresAt: this.expiry(),
      })
      .returning();

    return this.credentials(row!);
  }

  /**
   * Trade a `restoreId` for a fresh token. Scoped to the project and to unexpired
   * rows, so a leaked id from another install or a long-dead session is useless.
   */
  async restore(input: {
    projectId: string;
    restoreId: string;
    client: ClientContext;
  }): Promise<SessionCredentials | null> {
    const [found] = await this.db
      .select()
      .from(visitorSession)
      .where(
        and(
          eq(visitorSession.restoreId, input.restoreId),
          eq(visitorSession.projectId, input.projectId),
          gt(visitorSession.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!found) return null;

    const [touched] = await this.db
      .update(visitorSession)
      .set({
        ipAddress: input.client.ipAddress,
        userAgent: input.client.userAgent,
        lastSeenAt: new Date(),
        expiresAt: this.expiry(),
        updatedAt: new Date(),
      })
      .where(eq(visitorSession.id, found.id))
      .returning();

    return this.credentials(touched ?? found);
  }

  /**
   * Attach traits to the session the token names.
   *
   * The lookup is by session id from the verified token and nothing else. Matching
   * on email or `externalId` would let anyone take over another visitor's session
   * by guessing an address, which is the one mistake this endpoint must not make.
   *
   * Only fields actually supplied are written, so a later call carrying just an
   * email cannot blank out a name an earlier call established.
   */
  async identify(input: {
    sessionId: string;
    traits: IdentifyInput;
    client: ClientContext;
  }): Promise<SessionCredentials | null> {
    const { traits } = input;
    const now = new Date();

    const [found] = await this.db
      .select()
      .from(visitorSession)
      .where(and(eq(visitorSession.id, input.sessionId), gt(visitorSession.expiresAt, now)))
      .limit(1);

    if (!found) return null;

    const [updated] = await this.db
      .update(visitorSession)
      .set({
        externalId: traits.externalId ?? found.externalId,
        name: traits.name ?? found.name,
        email: traits.email ?? found.email,
        phone: traits.phone ?? found.phone,
        company: traits.company ?? found.company,
        meta: { ...(found.meta as Record<string, unknown>), ...boundMeta(traits.meta) },
        identifiedAt: found.identifiedAt ?? now,
        ipAddress: input.client.ipAddress,
        userAgent: input.client.userAgent,
        lastSeenAt: now,
        // Slid forward because `credentials` below returns a token good for another
        // full TTL from now.
        expiresAt: this.expiry(),
        updatedAt: now,
      })
      .where(eq(visitorSession.id, found.id))
      .returning();

    return this.credentials(updated!);
  }

  /** The session a verified token speaks for, if it is still live. */
  async find(sessionId: string): Promise<VisitorSessionRow | null> {
    const [found] = await this.db
      .select()
      .from(visitorSession)
      .where(and(eq(visitorSession.id, sessionId), gt(visitorSession.expiresAt, new Date())))
      .limit(1);
    return found ?? null;
  }

  /** Whether a widget id belongs to this project, so events cannot name junk. */
  async widgetExists(projectId: string, widgetId: string): Promise<boolean> {
    const [found] = await this.db
      .select({ id: widget.id })
      .from(widget)
      .where(and(eq(widget.id, widgetId), eq(widget.projectId, projectId)))
      .limit(1);
    return Boolean(found);
  }

  async recordEvent(input: EventInput): Promise<void> {
    const now = new Date();

    await this.db.insert(visitorEvent).values({
      id: randomUUID(),
      sessionId: input.sessionId,
      projectId: input.projectId,
      widgetId: input.widgetId ?? null,
      type: input.type ?? 'click',
      name: input.name,
      url: input.url ?? null,
      metadata: boundMeta(input.metadata),
    });

    // An active visitor keeps their session alive. Without this a session that
    // only ever reports events would expire underneath a still-valid token.
    await this.db
      .update(visitorSession)
      .set({ lastSeenAt: now, expiresAt: this.expiry(), updatedAt: now })
      .where(eq(visitorSession.id, input.sessionId));
  }
}
