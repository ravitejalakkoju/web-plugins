import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { Preview } from '../components/Preview';
import { SchemaForm } from '../components/SchemaForm';
import { Alert, CopyField, Shell, StatusBadge } from '../components/ui';
import { api } from '../lib/api';
import { setPath } from '../lib/paths';
import type { EditorPageData } from '../types';

type SaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'error';

const SAVE_LABELS: Record<SaveState, string> = {
  clean: 'All changes saved',
  dirty: 'Unsaved changes',
  saving: 'Saving…',
  saved: 'Draft saved',
  error: 'Save failed',
};

export function WidgetEditorPage({ data }: { data: EditorPageData }) {
  const [values, setValues] = useState<Record<string, unknown>>(data.values);
  const [saveState, setSaveState] = useState<SaveState>('clean');
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState(data.published);
  const [dirtySincePublish, setDirtySincePublish] = useState(data.hasUnpublishedChanges);
  const [busy, setBusy] = useState(false);

  const timer = useRef<number | null>(null);
  const pending = useRef<Record<string, unknown> | null>(null);
  /** Whether the last save attempt failed, so publish can refuse to run. */
  const unsaved = useRef(false);

  /** Returns whether the server now holds what the form shows. */
  const flush = useCallback(async (): Promise<boolean> => {
    const next = pending.current;
    if (!next) return !unsaved.current;
    pending.current = null;

    setSaveState('saving');
    try {
      const saved = await api.saveDraft(data.widget.id, next);
      unsaved.current = false;
      setSaveState(pending.current ? 'dirty' : 'saved');
      setError(null);
      setDirtySincePublish(saved.hasUnpublishedChanges);
      return true;
    } catch (cause) {
      unsaved.current = true;
      setSaveState('error');
      setError(cause instanceof Error ? cause.message : 'could not save draft');
      return false;
    }
  }, [data.widget.id]);

  /** Debounced autosave: typing should not fire a request per keystroke. */
  const queue = useCallback(
    (next: Record<string, unknown>) => {
      pending.current = next;
      setSaveState('dirty');
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), 700);
    },
    [flush],
  );

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const onChange = useCallback(
    (path: (string | number)[], value: unknown) => {
      setValues((current) => {
        const next = setPath(current, path, value);
        queue(next);
        return next;
      });
    },
    [queue],
  );

  const onStructuralChange = useCallback(
    (next: Record<string, unknown>) => {
      setValues(next);
      queue(next);
    },
    [queue],
  );

  const publish = async () => {
    setBusy(true);
    setError(null);
    try {
      if (timer.current !== null) window.clearTimeout(timer.current);
      // Publish promotes whatever the server holds. If the pending save failed we
      // would publish the previous values while the form shows the new ones, so
      // stop here and leave the save error on screen.
      if (!(await flush())) return;

      const result = await api.publish(data.widget.id);
      setPublished({ version: result.version, publishedAt: result.publishedAt });
      setDirtySincePublish(false);
      setSaveState('clean');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'could not publish');
    } finally {
      setBusy(false);
    }
  };

  const unpublish = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.unpublish(data.widget.id);
      setPublished(null);
      setDirtySincePublish(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'could not unpublish');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell active="widgets">
      <div class="mb-5 flex flex-wrap items-center gap-3">
        <a href="/admin/widgets" class="text-sm text-ink-500 hover:text-ink-900">
          ← Widgets
        </a>
        <h1 class="text-xl font-semibold tracking-tight">{data.widget.name}</h1>
        <StatusBadge status={data.health.derivedStatus} />
        <span class="font-mono text-xs text-ink-500">{data.widget.id}</span>

        <div class="ml-auto flex items-center gap-3">
          <span
            class={`text-xs ${saveState === 'error' ? 'text-rose-600' : 'text-ink-500'}`}
            aria-live="polite"
          >
            {SAVE_LABELS[saveState]}
          </span>
          {published ? (
            <button type="button" class="wp-btn-ghost" disabled={busy} onClick={unpublish}>
              Unpublish
            </button>
          ) : null}
          <button
            type="button"
            class="wp-btn-primary"
            disabled={busy || (Boolean(published) && !dirtySincePublish)}
            onClick={publish}
          >
            {published ? 'Publish changes' : 'Publish'}
          </button>
        </div>
      </div>

      {error ? (
        <div class="mb-4">
          <Alert kind="error">{error}</Alert>
        </div>
      ) : null}

      <div class="grid items-start gap-6 xl:grid-cols-[26rem_1fr]">
        <div class="space-y-4">
          <SchemaForm
            fields={data.fields}
            values={values}
            onChange={onChange}
            onStructuralChange={onStructuralChange}
          />
        </div>

        <div class="space-y-4 xl:sticky xl:top-6">
          <div class="h-[32rem]">
            <Preview widgetId={data.widget.id} config={values} version={published?.version ?? 0} />
          </div>

          <div class="wp-card space-y-2 p-4">
            <h2 class="text-sm font-semibold">Install</h2>
            <p class="text-xs text-ink-500">
              Paste this before <code class="font-mono">&lt;/body&gt;</code> on any page.
              {published ? null : ' Publish first, or it will serve nothing.'}
            </p>
            <CopyField value={data.installSnippet} />
            <div class="flex flex-wrap gap-x-5 gap-y-1 pt-1 text-xs text-ink-500">
              <span>
                Published{' '}
                <span class="text-ink-700">{published ? `v${published.version}` : 'no'}</span>
              </span>
              {published && dirtySincePublish ? (
                <span class="text-amber-700">Unpublished changes</span>
              ) : null}
              <a href={`/admin/widgets/${data.widget.id}/health`} class="hover:text-ink-900">
                View health
              </a>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
