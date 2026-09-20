import {
  buildWidgetConfigSchema,
  schemaToFormFields,
  validateConfig,
  type ConfigValidationError,
  type FormField,
  type JsonSchema,
  type WidgetSchemaParts,
} from '@web-plugins/protocol';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import {
  CONFIG_STATUS,
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

export interface WidgetWithConfigs {
  widget: Widget;
  template: WidgetTemplate | null;
  draft: WidgetConfigRow | null;
  published: WidgetConfigRow | null;
}

/**
 * Widget CRUD plus the draft-to-publish flow.
 *
 * The version rules mirror `webext-config.service.ts`: one mutable draft per
 * widget, one published row serving traffic, and superseded rows archived rather
 * than deleted so a publish is auditable.
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

  async listWidgets(projectId: string): Promise<WidgetWithConfigs[]> {
    const widgets = await this.db
      .select()
      .from(widget)
      .where(eq(widget.projectId, projectId))
      .orderBy(desc(widget.createdAt));

    return Promise.all(widgets.map((row) => this.hydrate(row)));
  }

  async getWidget(widgetId: string): Promise<WidgetWithConfigs | null> {
    const [row] = await this.db.select().from(widget).where(eq(widget.id, widgetId)).limit(1);
    if (!row) return null;
    return this.hydrate(row);
  }

  private async hydrate(row: Widget): Promise<WidgetWithConfigs> {
    const [template, draft, published] = await Promise.all([
      row.templateId ? this.getTemplate(row.templateId) : Promise.resolve(null),
      this.configByStatus(row.id, CONFIG_STATUS.draft),
      this.configByStatus(row.id, CONFIG_STATUS.published),
    ]);

    return { widget: row, template, draft, published };
  }

  async configByStatus(widgetId: string, status: string): Promise<WidgetConfigRow | null> {
    const [row] = await this.db
      .select()
      .from(widgetConfig)
      .where(and(eq(widgetConfig.widgetId, widgetId), eq(widgetConfig.status, status)))
      .orderBy(desc(widgetConfig.version))
      .limit(1);
    return row ?? null;
  }

  /** Create a widget from a template, with the template defaults as its draft. */
  async createWidget(input: {
    projectId: string;
    name: string;
    templateId: string;
  }): Promise<WidgetWithConfigs> {
    const template = await this.getTemplate(input.templateId);
    if (!template) throw notFound(`template "${input.templateId}" does not exist`);

    const widgetId = shortId(12);
    const defaults = {
      ...(template.defaults as Record<string, unknown>),
      chrome: (template.defaults as Record<string, unknown>).chrome ?? template.chrome,
      src: (template.defaults as Record<string, unknown>).src ?? template.src,
    };

    await this.db.insert(widget).values({
      id: widgetId,
      projectId: input.projectId,
      name: input.name,
      templateId: template.id,
      schema: template.schema,
      status: WIDGET_STATUS.active,
    });

    await this.db.insert(widgetConfig).values({
      id: shortId(20),
      widgetId,
      projectId: input.projectId,
      version: 1,
      status: CONFIG_STATUS.draft,
      values: defaults,
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
   * Save the working copy. Invalid values are rejected here rather than at
   * publish time so the panel can show field errors while editing.
   */
  async saveDraft(widgetId: string, values: unknown): Promise<WidgetConfigRow> {
    const found = await this.getWidget(widgetId);
    if (!found) throw notFound(`widget "${widgetId}" does not exist`);

    const errors = this.validate(found.widget, values);
    if (errors.length) throw unprocessable('config is invalid', errors);

    const nextVersion = found.draft?.version ?? (await this.nextVersion(widgetId));

    if (found.draft) {
      const [updated] = await this.db
        .update(widgetConfig)
        .set({ values: values as Record<string, unknown>, updatedAt: new Date() })
        .where(eq(widgetConfig.id, found.draft.id))
        .returning();
      return updated!;
    }

    const [created] = await this.db
      .insert(widgetConfig)
      .values({
        id: shortId(20),
        widgetId,
        projectId: found.widget.projectId,
        version: nextVersion,
        status: CONFIG_STATUS.draft,
        values: values as Record<string, unknown>,
      })
      .returning();
    return created!;
  }

  private async nextVersion(widgetId: string): Promise<number> {
    const [row] = await this.db
      .select({ max: sql<number>`coalesce(max(${widgetConfig.version}), 0)` })
      .from(widgetConfig)
      .where(eq(widgetConfig.widgetId, widgetId));
    return (row?.max ?? 0) + 1;
  }

  /**
   * Promote the draft, archive whatever was live, then open a fresh draft at the
   * next version so editing can continue immediately.
   */
  async publish(widgetId: string): Promise<WidgetConfigRow> {
    const found = await this.getWidget(widgetId);
    if (!found) throw notFound(`widget "${widgetId}" does not exist`);
    if (!found.draft) throw unprocessable('nothing to publish: this widget has no draft');

    const errors = this.validate(found.widget, found.draft.values);
    if (errors.length) throw unprocessable('cannot publish an invalid config', errors);

    const now = new Date();

    if (found.published) {
      await this.db
        .update(widgetConfig)
        .set({ status: CONFIG_STATUS.archived, updatedAt: now })
        .where(eq(widgetConfig.id, found.published.id));
    }

    const [published] = await this.db
      .update(widgetConfig)
      .set({ status: CONFIG_STATUS.published, publishedAt: now, updatedAt: now })
      .where(eq(widgetConfig.id, found.draft.id))
      .returning();

    await this.db
      .insert(widgetConfig)
      .values({
        id: shortId(20),
        widgetId,
        projectId: found.widget.projectId,
        version: published!.version + 1,
        status: CONFIG_STATUS.draft,
        values: published!.values as Record<string, unknown>,
      })
      .onConflictDoNothing({ target: [widgetConfig.widgetId, widgetConfig.version] });

    return published!;
  }

  /** Take the widget offline without deleting anything. */
  async unpublish(widgetId: string): Promise<void> {
    const published = await this.configByStatus(widgetId, CONFIG_STATUS.published);
    if (!published) return;

    await this.db
      .update(widgetConfig)
      .set({ status: CONFIG_STATUS.archived, updatedAt: new Date() })
      .where(eq(widgetConfig.id, published.id));
  }
}
