import {
  buildWidgetConfigSchema,
  schemaToFormFields,
  validateConfig,
  type ConfigValidationError,
  type FormField,
  type JsonSchema,
  type WidgetSchemaParts,
} from '@web-plugins/protocol';
import { desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import {
  WIDGET_STATUS,
  widget,
  widgetConfig,
  widgetTemplate,
  type Widget,
  type WidgetConfigRow,
  type WidgetStatus,
  type WidgetTemplate,
} from '../db/schema.js';
import { shortId } from '../lib/ids.js';
import { notFound, unprocessable } from '../lib/errors.js';

export type ConfigValues = Record<string, unknown>;

/** A widget plus its template and its single config row. */
export interface WidgetRecord {
  widget: Widget;
  template: WidgetTemplate | null;
  config: WidgetConfigRow | null;
}

/** The widget's one config document, which is both what the panel edits and what visitors get. */
export const configValues = (record: WidgetRecord): ConfigValues =>
  (record.config?.values ?? {}) as ConfigValues;

export const isPublished = (record: WidgetRecord): boolean =>
  record.widget.status === WIDGET_STATUS.published;

/**
 * Widget CRUD plus publishing.
 *
 * One config document per widget, and `widget.status` decides whether visitors
 * see it. So a save to a published widget is live immediately, and publishing is
 * a status change rather than a copy between columns.
 */
export class WidgetService {
  constructor(private readonly db: Database) {}

  /** Compose the widget's full config schema from its snapshot of template parts. */
  schemaFor(row: Pick<Widget, 'schema'>): JsonSchema {
    return buildWidgetConfigSchema((row.schema ?? {}) as WidgetSchemaParts);
  }

  formFieldsFor(row: Pick<Widget, 'schema'>): FormField[] {
    return schemaToFormFields(this.schemaFor(row));
  }

  async listTemplates(): Promise<WidgetTemplate[]> {
    return this.db.select().from(widgetTemplate).orderBy(widgetTemplate.name);
  }

  async getTemplate(templateId: string): Promise<WidgetTemplate | null> {
    const [row] = await this.db
      .select()
      .from(widgetTemplate)
      .where(eq(widgetTemplate.id, templateId))
      .limit(1);
    return row ?? null;
  }

  async listWidgets(projectId: string): Promise<WidgetRecord[]> {
    const rows = await this.db
      .select()
      .from(widget)
      .leftJoin(widgetTemplate, eq(widget.templateId, widgetTemplate.id))
      .leftJoin(widgetConfig, eq(widgetConfig.widgetId, widget.id))
      .where(eq(widget.projectId, projectId))
      .orderBy(desc(widget.createdAt));

    return rows.map((row) => ({
      widget: row.widget,
      template: row.widget_template,
      config: row.widget_config,
    }));
  }

  async getWidget(widgetId: string): Promise<WidgetRecord | null> {
    const [row] = await this.db
      .select()
      .from(widget)
      .leftJoin(widgetTemplate, eq(widget.templateId, widgetTemplate.id))
      .leftJoin(widgetConfig, eq(widgetConfig.widgetId, widget.id))
      .where(eq(widget.id, widgetId))
      .limit(1);

    if (!row) return null;
    return { widget: row.widget, template: row.widget_template, config: row.widget_config };
  }

  /** Create a widget from a template. It starts as a draft holding the template defaults. */
  async createWidget(input: {
    projectId: string;
    name: string;
    templateId: string;
  }): Promise<WidgetRecord> {
    const template = await this.getTemplate(input.templateId);
    if (!template) throw notFound(`template "${input.templateId}" does not exist`);

    const widgetId = shortId(12);
    const defaults = template.defaults as ConfigValues;

    // One transaction, because a widget without its config row is not a widget:
    // it would list with an empty config and refuse to publish, with nothing in
    // the panel explaining why.
    await this.db.transaction(async (tx) => {
      await tx.insert(widget).values({
        id: widgetId,
        projectId: input.projectId,
        name: input.name,
        templateId: template.id,
        schema: template.schema,
        status: WIDGET_STATUS.draft,
      });

      await tx.insert(widgetConfig).values({
        widgetId,
        projectId: input.projectId,
        values: {
          ...defaults,
          chrome: defaults.chrome ?? template.chrome,
          src: defaults.src ?? template.src,
        },
      });
    });

    const created = await this.getWidget(widgetId);
    if (!created) throw notFound('widget disappeared right after creation');
    return created;
  }

  async renameWidget(widgetId: string, name: string): Promise<void> {
    // `returning` is how a single statement reports that it matched nothing, which
    // is otherwise indistinguishable from a successful rename.
    const [renamed] = await this.db
      .update(widget)
      .set({ name, updatedAt: new Date() })
      .where(eq(widget.id, widgetId))
      .returning({ id: widget.id });

    if (!renamed) throw notFound(`widget "${widgetId}" does not exist`);
  }

  /**
   * Publish or unpublish. Publishing validates first: a widget created from template
   * defaults has never been through `saveConfig`, and defaults are not necessarily a
   * complete config.
   */
  async setStatus(widgetId: string, status: WidgetStatus): Promise<WidgetRecord> {
    const found = await this.getWidget(widgetId);
    if (!found) throw notFound(`widget "${widgetId}" does not exist`);

    if (status === WIDGET_STATUS.published) {
      const errors = this.validate(found.widget, configValues(found));
      if (errors.length) throw unprocessable('cannot publish an invalid config', errors);
    }

    const now = new Date();
    const [updated] = await this.db
      .update(widget)
      .set({
        status,
        // Left alone when unpublishing, so the panel can still say when it was last live.
        ...(status === WIDGET_STATUS.published ? { publishedAt: now } : {}),
        updatedAt: now,
      })
      .where(eq(widget.id, widgetId))
      .returning();

    return { ...found, widget: updated! };
  }

  async deleteWidget(widgetId: string): Promise<void> {
    const [deleted] = await this.db
      .delete(widget)
      .where(eq(widget.id, widgetId))
      .returning({ id: widget.id });

    if (!deleted) throw notFound(`widget "${widgetId}" does not exist`);
  }

  validate(row: Pick<Widget, 'schema'>, values: unknown): ConfigValidationError[] {
    const clone = JSON.parse(JSON.stringify(values ?? {}));
    const result = validateConfig(this.schemaFor(row), clone);
    return result.errors;
  }

  /**
   * Write the config document. Invalid values are rejected here rather than at
   * publish time so the panel can show field errors while editing, and `version`
   * moves so every installed runtime picks the change up on its next poll.
   */
  async saveConfig(widgetId: string, values: unknown): Promise<WidgetRecord> {
    const found = await this.getWidget(widgetId);
    if (!found) throw notFound(`widget "${widgetId}" does not exist`);

    const errors = this.validate(found.widget, values);
    if (errors.length) throw unprocessable('config is invalid', errors);

    const now = new Date();
    const next = values as ConfigValues;

    const [saved] = await this.db
      .insert(widgetConfig)
      .values({
        widgetId,
        projectId: found.widget.projectId,
        values: next,
        version: 1,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: widgetConfig.widgetId,
        // Incremented in SQL rather than from the row just read, so two saves
        // racing cannot both land on the same version.
        set: { values: next, version: sql`${widgetConfig.version} + 1`, updatedAt: now },
      })
      .returning();

    return { ...found, config: saved! };
  }
}
