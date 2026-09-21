import { useState } from 'preact/hooks';
import { Preview } from '../components/Preview';
import { SchemaForm } from '../components/SchemaForm';
import { Alert, CopyField, Shell, StatusBadge } from '../components/ui';
import { type SaveState, useWidgetEditor } from '../lib/useWidgetEditor';
import type { EditorPageData } from '../types';

const SAVE_LABELS: Record<SaveState, string> = {
  clean: 'All changes saved',
  dirty: 'Unsaved changes',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Save failed',
};

export function WidgetEditorPage({ data }: { data: EditorPageData }) {
  const editor = useWidgetEditor(data);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const live = editor.status === 'published';

  return (
    <Shell active="widgets">
      <div class="mb-5 flex flex-wrap items-center gap-3">
        <a href="/admin/widgets" class="text-sm text-ink-500 hover:text-ink-900">
          ← Widgets
        </a>
        <input
          class="wp-title-input"
          aria-label="Widget name"
          defaultValue={editor.name}
          onBlur={(event) => {
            // Uncontrolled, so put back whatever the server ended up with: the
            // trimmed name, or the old one if it was empty or the save failed.
            const field = event.currentTarget as HTMLInputElement;
            void editor.saveName(field.value).then((settled) => {
              field.value = settled;
            });
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') (event.currentTarget as HTMLInputElement).blur();
          }}
        />
        <StatusBadge status={data.health.derivedStatus} />
        <span class="font-mono text-xs text-ink-500">{data.widget.id}</span>

        <div class="ml-auto flex items-center gap-3">
          <span
            class={`text-xs ${editor.saveState === 'error' ? 'text-rose-600' : 'text-ink-500'}`}
            aria-live="polite"
          >
            {SAVE_LABELS[editor.saveState]}
          </span>
          {live ? (
            <button
              type="button"
              class="wp-btn-ghost"
              disabled={editor.busy}
              onClick={() => void editor.unpublish()}
            >
              Unpublish
            </button>
          ) : (
            <button
              type="button"
              class="wp-btn-ghost"
              disabled={editor.busy}
              onClick={() => void editor.publish()}
            >
              Publish
            </button>
          )}
          <button
            type="button"
            class="wp-btn-primary"
            disabled={editor.busy || !editor.dirty}
            onClick={() => void editor.save()}
          >
            {live ? 'Save & go live' : 'Save'}
          </button>
        </div>
      </div>

      {editor.error ? (
        <div class="mb-4">
          <Alert kind="error">{editor.error}</Alert>
        </div>
      ) : null}

      <div class="grid items-start gap-6 xl:grid-cols-[26rem_1fr]">
        <div class="space-y-4">
          <SchemaForm
            fields={data.fields}
            values={editor.values}
            onChange={editor.setValue}
            onStructuralChange={editor.replaceValues}
          />
        </div>

        <div class="space-y-4 xl:sticky xl:top-6">
          <div class="h-[32rem]">
            <Preview widgetId={data.widget.id} config={editor.values} version={editor.version} />
          </div>

          <div class="wp-card space-y-2 p-4">
            <h2 class="text-sm font-semibold">Install</h2>
            <p class="text-xs text-ink-500">
              Paste this before <code class="font-mono">&lt;/body&gt;</code> on any page.
              {live
                ? ' Saving updates it for visitors straight away.'
                : ' Publish first, or it will serve nothing.'}
            </p>
            <CopyField value={data.installSnippet} />
            <div class="flex flex-wrap gap-x-5 gap-y-1 pt-1 text-xs text-ink-500">
              <span>
                <span class={live ? 'text-emerald-700' : 'text-ink-700'}>
                  {live ? 'Live' : 'Draft'}
                </span>{' '}
                · v{editor.version}
              </span>
              <a href={`/admin/widgets/${data.widget.id}/health`} class="hover:text-ink-900">
                View health
              </a>
            </div>
          </div>

          <div class="wp-card space-y-2 p-4">
            <h2 class="text-sm font-semibold">Delete widget</h2>
            <p class="text-xs text-ink-500">
              Removes the config and the health history too. Pages still loading this id will stop
              getting a widget.
            </p>
            {confirmingDelete ? (
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  class="wp-btn-danger"
                  disabled={editor.busy}
                  onClick={() => void editor.remove()}
                >
                  Delete {editor.name}
                </button>
                <button
                  type="button"
                  class="wp-btn-ghost"
                  disabled={editor.busy}
                  onClick={() => setConfirmingDelete(false)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                class="wp-btn-ghost text-rose-600"
                onClick={() => setConfirmingDelete(true)}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}
