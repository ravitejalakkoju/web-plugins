import { relations } from 'drizzle-orm';
import {
  index,
  integer,
  json,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

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
    /** `active` or `disabled`. A disabled widget serves no config. */
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('widget_project_idx').on(table.projectId)],
);

/**
 * Config versions. Exactly one row per widget is `draft` (the working copy) and
 * at most one is `published` (what `/v1/config` serves); superseded rows become
 * `archived`. Mirrors the draft-to-publish flow of `webext-config.service.ts`.
 */
export const widgetConfig = pgTable(
  'widget_config',
  {
    id: text('id').primaryKey(),
    widgetId: text('widget_id')
      .notNull()
      .references(() => widget.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    /** `draft`, `published` or `archived`. */
    status: text('status').notNull().default('draft'),
    values: jsonb('values').notNull().default({}),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('widget_config_version_uq').on(table.widgetId, table.version),
    index('widget_config_status_idx').on(table.widgetId, table.status),
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

export const widgetRelations = relations(widget, ({ one, many }) => ({
  project: one(project, { fields: [widget.projectId], references: [project.id] }),
  template: one(widgetTemplate, {
    fields: [widget.templateId],
    references: [widgetTemplate.id],
  }),
  configs: many(widgetConfig),
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

export const CONFIG_STATUS = {
  draft: 'draft',
  published: 'published',
  archived: 'archived',
} as const;

export const WIDGET_STATUS = {
  active: 'active',
  disabled: 'disabled',
} as const;
