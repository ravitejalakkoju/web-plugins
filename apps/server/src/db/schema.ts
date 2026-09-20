import { relations } from 'drizzle-orm';
import { index, integer, json, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * One store for what used to be split across DynamoDB (`versionTag: "current"`)
 * and a TypeORM `WebExtConfiguration` table.
 *
 * `projectId` is on every row from day one. Self-host seeds a single project, so
 * multi-tenant is an auth change rather than a migration.
 */

export const project = pgTable('project', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** Public identifier safe to expose in install snippets. */
  publicKey: text('public_key').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A widget blueprint. This is where "whatsapp-like" or "chat-like" lives, as
 * data: `schema` holds the variable parts (`launcher`, `view`, `meta`) that
 * `buildWidgetConfigSchema` composes onto the core contract.
 */
export const widgetTemplate = pgTable('widget_template', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  /** Default chrome. Editable per widget. */
  chrome: text('chrome').notNull().default('fab'),
  /** Default iframe URL, null for host-only widgets. */
  src: text('src'),
  /** `json`, not `jsonb`: jsonb reorders keys and the panel renders fields in schema order. */
  schema: json('schema').notNull().default({}),
  defaults: jsonb('defaults').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const WIDGET_STATUS = {
  draft: 'draft',
  published: 'published',
} as const;

export type WidgetStatus = (typeof WIDGET_STATUS)[keyof typeof WIDGET_STATUS];

export const widget = pgTable(
  'widget',
  {
    /** Short public id that appears in the script URL. */
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    templateId: text('template_id').references(() => widgetTemplate.id, { onDelete: 'set null' }),
    /**
     * Snapshot of the template's schema parts taken at creation, so editing a
     * template never invalidates a live widget.
     */
    schema: json('schema').notNull().default({}),
    /**
     * `draft` or `published`, and the only thing that decides whether `/v1/config`
     * serves this widget. A widget starts as a draft, because template defaults
     * are rarely complete enough to put in front of visitors.
     */
    status: text('status').$type<WidgetStatus>().notNull().default(WIDGET_STATUS.draft),
    /** When it last went live. Null while it has never been published. */
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('widget_project_idx').on(table.projectId)],
);

/**
 * Exactly one config document per widget. There is no separate published copy:
 * saving a published widget changes what visitors get, which is why the panel
 * saves on an explicit action rather than on a keystroke.
 */
export const widgetConfig = pgTable('widget_config', {
  widgetId: text('widget_id')
    .primaryKey()
    .references(() => widget.id, { onDelete: 'cascade' }),
  projectId: text('project_id')
    .notNull()
    .references(() => project.id, { onDelete: 'cascade' }),
  /**
   * Bumped on every save. The runtime polls `/v1/config/version` and refetches the
   * document whenever this number changes, so it is a revision counter rather than
   * a release number.
   */
  version: integer('version').notNull().default(0),
  /** Always present: a widget is created with its template defaults. */
  values: jsonb('values').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A visitor session: the anonymous identity a widget mints on first load, plus any
 * traits the host page later attaches through `identify`.
 *
 * Deliberately thinner than the `session` table this is ported from. That one also
 * stored country, device, OS and a browser fingerprint - analytics dimensions
 * rather than identity, and the country lookup needed a bundled IP database.
 * Anything a deploy wants beyond these columns goes in `meta`.
 */
export const visitorSession = pgTable(
  'visitor_session',
  {
    id: uuid('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    /**
     * Long-lived handle kept in the visitor's `localStorage`. Presenting it restores
     * the session, so it is treated as a credential: random UUID, never derived from
     * anything guessable, and unique so a restore cannot match two rows.
     */
    restoreId: uuid('restore_id').notNull().unique(),
    externalId: text('external_id'),
    name: text('name'),
    email: text('email'),
    phone: text('phone'),
    company: text('company'),
    /** Taken from the request, never from the body a visitor can set. */
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    meta: jsonb('meta').notNull().default({}),
    /** Set the first time traits arrive, so anonymous sessions are countable. */
    identifiedAt: timestamp('identified_at', { withTimezone: true }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    /** Restores past this are refused. Matches the token lifetime. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('visitor_session_project_idx').on(table.projectId),
    index('visitor_session_external_idx').on(table.externalId),
    index('visitor_session_expires_idx').on(table.expiresAt),
  ],
);

/** Events a widget reports against a visitor session. Write-only for now. */
export const visitorEvent = pgTable(
  'visitor_event',
  {
    id: uuid('id').primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => visitorSession.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    /** Null once the widget is deleted, so the history outlives it. */
    widgetId: text('widget_id').references(() => widget.id, { onDelete: 'set null' }),
    type: text('type').notNull().default('click'),
    name: text('name').notNull(),
    url: text('url'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('visitor_event_session_idx').on(table.sessionId),
    index('visitor_event_widget_idx').on(table.widgetId, table.createdAt),
  ],
);

/** Last known install state, written by the unauthenticated heartbeat. */
export const widgetHealth = pgTable('widget_health', {
  widgetId: text('widget_id')
    .primaryKey()
    .references(() => widget.id, { onDelete: 'cascade' }),
  projectId: text('project_id')
    .notNull()
    .references(() => project.id, { onDelete: 'cascade' }),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  lastVisibleAt: timestamp('last_visible_at', { withTimezone: true }),
  lastHealthStatus: text('last_health_status'),
  lastConfigVersion: integer('last_config_version'),
  lastPageUrl: text('last_page_url'),
  lastErrorCode: text('last_error_code'),
  lastErrorMessage: text('last_error_message'),
  seenCount: integer('seen_count').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const projectRelations = relations(project, ({ many }) => ({
  widgets: many(widget),
}));

export const widgetRelations = relations(widget, ({ one }) => ({
  project: one(project, { fields: [widget.projectId], references: [project.id] }),
  template: one(widgetTemplate, {
    fields: [widget.templateId],
    references: [widgetTemplate.id],
  }),
  config: one(widgetConfig, {
    fields: [widget.id],
    references: [widgetConfig.widgetId],
  }),
  health: one(widgetHealth, {
    fields: [widget.id],
    references: [widgetHealth.widgetId],
  }),
}));

export const widgetConfigRelations = relations(widgetConfig, ({ one }) => ({
  widget: one(widget, { fields: [widgetConfig.widgetId], references: [widget.id] }),
}));

export type Project = typeof project.$inferSelect;
export type WidgetTemplate = typeof widgetTemplate.$inferSelect;
export type Widget = typeof widget.$inferSelect;
export type WidgetConfigRow = typeof widgetConfig.$inferSelect;
export type WidgetHealthRow = typeof widgetHealth.$inferSelect;
export type VisitorSessionRow = typeof visitorSession.$inferSelect;
export type VisitorEventRow = typeof visitorEvent.$inferSelect;
