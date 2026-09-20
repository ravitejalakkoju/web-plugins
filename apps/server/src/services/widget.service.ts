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

/**
 * The values being edited. This is what the panel loads and what publish promotes.
 */
export const draftValues = (record: WidgetRecord): ConfigValues =>
  (record.config?.draftValues ?? {}) as ConfigValues;

/**
 * The values visitors receive, or null when the widget is unpublished. Deliberately
 * a different function from `draftValues`: which of the two a caller wants is a
 * decision, not a fallback, and reading the wrong one either leaks unpublished
 * edits or shows the operator stale fields.
 */
export const publishedValues = (record: WidgetRecord): ConfigValues | null =>
  (record.config?.publishedValues ?? null) as ConfigValues | null;

export const isPublished = (record: WidgetRecord): boolean => publishedValues(record) !== null;

/** Whether the working copy has drifted from what is live. */
export function hasUnpublishedChanges(record: WidgetRecord): boolean {
  const published = publishedValues(record);
  if (!published) return Boolean(record.config);
  return JSON.stringify(draftValues(record)) !== JSON.stringify(published);
}

/**
 * Widget CRUD plus the draft-to-publish flow.
 *
 * One mutable draft and one published snapshot per widget. Publishing copies the
 * draft across and bumps `version`; unpublishing clears the snapshot. There are no
 * archived revisions, so a widget's config never accumulates rows.
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

  /** Create a widget from a template, with the template defaults as its draft. */
  async createWidget(input: {
    projectId: string;
    name: string;
    templateId: string;
  }): Promise<WidgetRecord> {
    const template = await this.getTemplate(input.templateId);
    if (!template) throw notFound(`template "${input.templateId}" does not exist`);

    const widgetId = shortId(12);
    const defaults = template.defaults as ConfigValues;

    await this.db.insert(widget).values({
      id: widgetId,
      projectId: input.projectId,
      name: input.name,
      templateId: template.id,
      schema: template.schema,
      status: WIDGET_STATUS.active,
    });

    await this.db.insert(widgetConfig).values({
      widgetId,
      projectId: input.projectId,
      draftValues: {
        ...defaults,
        chrome: defaults.chrome ?? template.chrome,
        src: defaults.src ?? template.src,
      },
    });

    const created = await this.getWidget(widgetId);
    if (!created) throw notFound('widget disappeared right after creation');
    return created;
  }

  async renameWidget(widgetId: string, name: string): Promise<void> {
    await this.db
      .update(widget)
      .set({ name, updatedAt: new Date() })
      .where(eq(widget.id, widgetId));
  }

  async setStatus(widgetId: string, status: 'active' | 'disabled'): Promise<void> {
    await this.db
      .update(widget)
      .set({ status, updatedAt: new Date() })
      .where(eq(widget.id, widgetId));
  }

  async deleteWidget(widgetId: string): Promise<void> {
    await this.db.delete(widget).where(eq(widget.id, widgetId));
  }

  validate(row: Pick<Widget, 'schema'>, values: unknown): ConfigValidationError[] {
    const clone = JSON.parse(JSON.stringify(values ?? {}));
    const result = validateConfig(this.schemaFor(row), clone);
    return result.errors;
  }

  /**
   * Save the working copy. Invalid values are rejected here rather than at publish
   * time so the panel can show field errors while editing.
   */
  async saveDraft(widgetId: string, values: unknown): Promise<WidgetRecord> {
    const found = await this.getWidget(widgetId);
    if (!found) throw notFound(`widget "${widgetId}" does not exist`);

    const errors = this.validate(found.widget, values);
    if (errors.length) throw unprocessable('config is invalid', errors);

    const now = new Date();
    const draft = values as ConfigValues;

    const [saved] = await this.db
      .insert(widgetConfig)
      .values({
        widgetId,
        projectId: found.widget.projectId,
        draftValues: draft,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: widgetConfig.widgetId,
        set: { draftValues: draft, updatedAt: now },
      })
      .returning();

    return { ...found, config: saved! };
  }

  /**
   * Promote the draft. `version` moves here and only here, which is the signal
   * every installed runtime polls for.
   */
  async publish(widgetId: string): Promise<WidgetRecord> {
    const found = await this.getWidget(widgetId);
    if (!found) throw notFound(`widget "${widgetId}" does not exist`);
    if (!found.config) throw unprocessable('nothing to publish: this widget has no draft');

    const values = draftValues(found);
    const errors = this.validate(found.widget, values);
    if (errors.length) throw unprocessable('cannot publish an invalid config', errors);

    const now = new Date();

    const [updated] = await this.db
      .update(widgetConfig)
      .set({
        publishedValues: values,
        // Incremented in SQL rather than from the row we just read, so two
        // publishes racing cannot both land on the same version.
        version: sql`${widgetConfig.version} + 1`,
        publishedAt: now,
        updatedAt: now,
      })
      .where(eq(widgetConfig.widgetId, widgetId))
      .returning();

    return { ...found, config: updated! };
  }

  /** Take the widget offline. The draft is untouched, so publishing restores it. */
  async unpublish(widgetId: string): Promise<void> {
    await this.db
      .update(widgetConfig)
      .set({ publishedValues: null, publishedAt: null, updatedAt: new Date() })
      .where(eq(widgetConfig.widgetId, widgetId));
  }
}
