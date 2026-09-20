import type { FormField, HealthSnapshot } from '@web-plugins/protocol';

export interface TemplateSummary {
  id: string;
  name: string;
  description: string | null;
  chrome: string;
  src: string | null;
}

export type WidgetStatus = 'draft' | 'published';

export interface WidgetSummary {
  id: string;
  name: string;
  status: WidgetStatus;
  templateId: string | null;
  templateName: string | null;
  chrome: string | null;
  published: boolean;
  /** Revision of the config document, bumped on every save. */
  version: number;
  publishedAt: string | null;
  createdAt: string;
  health: Pick<HealthSnapshot, 'derivedStatus' | 'lastSeenAgoSeconds'> | null;
}

export interface WidgetDetail {
  id: string;
  name: string;
  status: WidgetStatus;
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
  /** The one config document. Saving it is what visitors see, once published. */
  values: Record<string, unknown>;
  version: number;
  publishedAt: string | null;
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
