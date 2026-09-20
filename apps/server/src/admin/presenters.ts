import type { TemplateSummary, WidgetDetail, WidgetSummary } from '../../admin/types.js';
import type { Widget, WidgetTemplate } from '../db/schema.js';
import type { HealthSummary } from '../services/health.service.js';
import {
  draftValues,
  hasUnpublishedChanges,
  isPublished,
  publishedValues,
  type WidgetRecord,
} from '../services/widget.service.js';

/**
 * One place where a widget becomes JSON. The admin API and the SSR panel serve
 * the same shape, so hydration cannot disagree with a later fetch.
 */
export function widgetSummary(entry: WidgetRecord, health: HealthSummary | null): WidgetSummary {
  const { widget, template, config } = entry;
  // The list shows how a widget behaves for visitors, so prefer what is live and
  // fall back to the draft only for a widget that has never been published.
  const effective = publishedValues(entry) ?? draftValues(entry);

  return {
    id: widget.id,
    name: widget.name,
    status: widget.status,
    templateId: widget.templateId,
    templateName: template?.name ?? null,
    chrome: typeof effective.chrome === 'string' ? effective.chrome : null,
    published: isPublished(entry),
    version: config?.version ?? 0,
    publishedAt: config?.publishedAt?.toISOString() ?? null,
    hasUnpublishedChanges: hasUnpublishedChanges(entry),
    createdAt: widget.createdAt.toISOString(),
    health,
  };
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
