import type { WidgetStatus } from '../types';

/** Thin wrapper over the admin API: same-origin, cookie session, JSON in and out. */
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 401) {
    window.location.href = '/admin/login';
    throw new Error('session expired');
  }

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const problem = payload as { error?: string; details?: { path?: string; message?: string }[] };
    const detail = problem?.details
      ?.map((item) => `${item.path ?? ''} ${item.message ?? ''}`.trim())
      .filter(Boolean)
      .join('; ');
    throw new Error(
      detail ? `${problem.error}: ${detail}` : (problem?.error ?? response.statusText),
    );
  }

  return payload as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ ok: true }>('POST', '/api/auth/login', { email, password }),
  logout: () => request<{ ok: true }>('POST', '/api/auth/logout'),
  createWidget: (name: string, templateId: string) =>
    request<{ id: string }>('POST', '/api/widgets', { name, templateId }),
  renameWidget: (id: string, name: string) =>
    request<{ ok: true }>('PATCH', `/api/widgets/${id}`, { name }),
  deleteWidget: (id: string) => request<{ ok: true }>('DELETE', `/api/widgets/${id}`),
  saveConfig: (id: string, values: Record<string, unknown>) =>
    request<{ values: Record<string, unknown>; version: number }>(
      'PUT',
      `/api/widgets/${id}/config`,
      { values },
    ),
  /** Publishing and unpublishing are the same call: a widget is either a draft or live. */
  setStatus: (id: string, status: WidgetStatus) =>
    request<{ ok: true; status: WidgetStatus; publishedAt: string | null }>(
      'PATCH',
      `/api/widgets/${id}`,
      { status },
    ),
  health: (id: string) =>
    request<import('@web-plugins/protocol').HealthSnapshot>('GET', `/api/widgets/${id}/health`),
  previewToken: (id: string) =>
    request<{ token: string; expiresAt: string }>('POST', `/api/widgets/${id}/preview-token`),
};
