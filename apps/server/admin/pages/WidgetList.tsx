import { useState } from 'preact/hooks';
import { api } from '../lib/api';
import { Alert, EmptyState, Shell, StatusBadge } from '../components/ui';
import type { WidgetsPageData } from '../types';

function relative(seconds: number | null): string {
  if (seconds === null) return 'never';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

export function WidgetListPage({ data }: { data: WidgetsPageData }) {
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState(data.templates[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async (event: Event) => {
    event.preventDefault();
    if (!name.trim() || !templateId) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.createWidget(name.trim(), templateId);
      window.location.href = `/admin/widgets/${created.id}`;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'could not create widget');
      setBusy(false);
    }
  };

  const selected = data.templates.find((template) => template.id === templateId);

  return (
    <Shell active="widgets">
      <div class="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div class="space-y-4">
          <h1 class="text-xl font-semibold tracking-tight">Widgets</h1>

          {data.widgets.length === 0 ? (
            <EmptyState
              title="No widgets yet"
              body="Create one from a template to get an install snippet."
            />
          ) : (
            <ul class="space-y-3">
              {data.widgets.map((widget) => (
                <li key={widget.id} class="wp-card p-4">
                  <div class="flex flex-wrap items-center gap-3">
                    <a
                      href={`/admin/widgets/${widget.id}`}
                      class="text-sm font-medium hover:underline"
                    >
                      {widget.name}
                    </a>
                    {widget.health ? <StatusBadge status={widget.health.derivedStatus} /> : null}
                    {widget.published ? null : (
                      <span class="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-700">
                        Draft
                      </span>
                    )}
                    <a
                      href={`/admin/widgets/${widget.id}/health`}
                      class="ml-auto text-xs text-ink-500 hover:text-ink-900"
                    >
                      Health
                    </a>
                  </div>
                  <dl class="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-500">
                    <div>
                      <dt class="inline">ID </dt>
                      <dd class="inline font-mono text-ink-700">{widget.id}</dd>
                    </div>
                    <div>
                      <dt class="inline">Template </dt>
                      <dd class="inline text-ink-700">{widget.templateName ?? '—'}</dd>
                    </div>
                    <div>
                      <dt class="inline">Chrome </dt>
                      <dd class="inline text-ink-700">{widget.chrome ?? '—'}</dd>
                    </div>
                    <div>
                      <dt class="inline">Config </dt>
                      <dd class="inline text-ink-700">
                        v{widget.version}
                        {widget.published ? <span class="text-emerald-700"> · live</span> : null}
                      </dd>
                    </div>
                    <div>
                      <dt class="inline">Last seen </dt>
                      <dd class="inline text-ink-700">
                        {relative(widget.health?.lastSeenAgoSeconds ?? null)}
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form class="wp-card h-fit space-y-3 p-4" onSubmit={create}>
          <h2 class="text-sm font-semibold">New widget</h2>
          {error ? <Alert kind="error">{error}</Alert> : null}

          <div>
            <label class="wp-label" for="new-name">
              Name
            </label>
            <input
              id="new-name"
              class="wp-input"
              placeholder="Support chat"
              value={name}
              onInput={(event) => setName((event.currentTarget as HTMLInputElement).value)}
            />
          </div>

          <div>
            <label class="wp-label" for="new-template">
              Template
            </label>
            <select
              id="new-template"
              class="wp-input"
              value={templateId}
              onChange={(event) => setTemplateId((event.currentTarget as HTMLSelectElement).value)}
            >
              {data.templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            {selected?.description ? <span class="wp-note">{selected.description}</span> : null}
          </div>

          <button type="submit" class="wp-btn-primary w-full" disabled={busy}>
            {busy ? 'Creating…' : 'Create widget'}
          </button>
          <p class="text-xs text-ink-500">
            A template is just data: a JSON Schema, defaults, a chrome and an optional iframe URL.
          </p>
        </form>
      </div>
    </Shell>
  );
}
