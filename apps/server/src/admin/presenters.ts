import type { TemplateSummary, WidgetDetail, WidgetSummary } from '../../admin/types.js';
import type { Widget, WidgetTemplate } from '../db/schema.js';
import type { HealthSummary } from '../services/health.service.js';
import type { WidgetWithConfigs } from '../services/widget.service.js';

/**
 * One place where a widget becomes JSON. The admin API and the SSR panel serve
 * the same shape, so hydration cannot disagree with a later fetch.
 */
export function widgetSummary(
  entry: WidgetWithConfigs,
  health: HealthSummary | null,
): WidgetSummary {
  const { widget, template, draft, published } = entry;
  const effective = (published?.values ?? draft?.values ?? {}) as Record<string, unknown>;

  return {
    id: widget.id,
    name: widget.name,
    status: widget.status,
    templateId: widget.templateId,
    templateName: template?.name ?? null,
    chrome: typeof effective.chrome === 'string' ? effective.chrome : null,
    draftVersion: draft?.version ?? null,
    publishedVersion: published?.version ?? null,
    publishedAt: published?.publishedAt?.toISOString() ?? null,
    hasUnpublishedChanges: hasUnpublishedChanges(entry),
    createdAt: widget.createdAt.toISOString(),
    health,
  };
}

export function hasUnpublishedChanges(entry: WidgetWithConfigs): boolean {
  if (!entry.draft) return false;
  return (
    JSON.stringify(entry.draft.values ?? null) !== JSON.stringify(entry.published?.values ?? null)
  );
}

export function widgetDetail(widget: Widget, template: WidgetTemplate | null): WidgetDetail {
  return {
    id: widget.id,
    name: widget.name,
    status: widget.status,
    templateId: widget.templateId,
    templateName: template?.name ?? null,
    createdAt: widget.createdAt.toISOString(),
  };
}

export function templateSummary(template: WidgetTemplate): TemplateSummary {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    chrome: template.chrome,
    src: template.src,
  };
}
