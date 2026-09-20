import type { FormField, HealthSnapshot } from '@web-plugins/protocol';

export interface TemplateSummary {
  id: string;
  name: string;
  description: string | null;
  chrome: string;
  src: string | null;
}

export interface WidgetSummary {
  id: string;
  name: string;
  status: string;
  templateId: string | null;
  templateName: string | null;
  chrome: string | null;
  draftVersion: number | null;
  publishedVersion: number | null;
  publishedAt: string | null;
  hasUnpublishedChanges: boolean;
  createdAt: string;
  health: Pick<HealthSnapshot, 'derivedStatus' | 'lastSeenAgoSeconds'> | null;
}

export interface WidgetDetail {
  id: string;
  name: string;
  status: string;
  templateId: string | null;
  templateName: string | null;
  createdAt: string;
}

export interface WidgetsPageData {
  widgets: WidgetSummary[];
  templates: TemplateSummary[];
}

export interface EditorPageData {
  widget: WidgetDetail;
  fields: FormField[];
  values: Record<string, unknown>;
  version: number;
  published: { version: number; publishedAt: string | null } | null;
  hasUnpublishedChanges: boolean;
  installSnippet: string;
  health: HealthSnapshot;
}

export interface HealthPageData {
  widget: WidgetDetail;
  health: HealthSnapshot;
  installSnippet: string;
}

export type AdminRoute =
  | { name: 'login'; data: Record<string, never> }
  | { name: 'widgets'; data: WidgetsPageData }
  | { name: 'editor'; data: EditorPageData }
  | { name: 'health'; data: HealthPageData };

export interface AdminState {
  route: AdminRoute;
  /** Origin the runtime bundle and preview iframe are loaded from. */
  publicBaseUrl: string;
}
