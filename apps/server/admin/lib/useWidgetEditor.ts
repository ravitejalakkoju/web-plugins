import { useCallback, useEffect, useState } from 'preact/hooks';
import type { EditorPageData, WidgetStatus } from '../types';
import { api } from './api';
import { setPath } from './paths';

export type SaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'error';

export interface WidgetEditorState {
  values: Record<string, unknown>;
  saveState: SaveState;
  /** Whichever of saving, publishing or unpublishing failed last. */
  error: string | null;
  status: WidgetStatus;
  /** Revision of the saved document, which is what heartbeats report. */
  version: number;
  /** The form holds edits the server has not accepted. */
  dirty: boolean;
  /** A request is running; every button should be inert. */
  busy: boolean;
  /** Edit one field, addressed by its path through the values tree. */
  setValue(path: (string | number)[], value: unknown): void;
  /** Swap the whole tree, for edits that add or drop array items. */
  replaceValues(next: Record<string, unknown>): void;
  save(): Promise<void>;
  publish(): Promise<void>;
  unpublish(): Promise<void>;
}

const reason = (cause: unknown, fallback: string): string =>
  cause instanceof Error ? cause.message : fallback;

/**
 * Everything the editor needs from the server: the config document and whether it
 * is live.
 *
 * There is one document, so saving a published widget changes what visitors get.
 * That is why nothing here is debounced: the operator says when to write.
 */
export function useWidgetEditor(data: EditorPageData): WidgetEditorState {
  const widgetId = data.widget.id;

  const [values, setValues] = useState<Record<string, unknown>>(data.values);
  const [saveState, setSaveState] = useState<SaveState>('clean');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<WidgetStatus>(data.widget.status);
  const [version, setVersion] = useState(data.version);
  const [busy, setBusy] = useState(false);

  // A failed save leaves the server holding something other than what is on screen,
  // which is still unsaved work.
  const dirty = saveState === 'dirty' || saveState === 'error';

  const setValue = useCallback((path: (string | number)[], value: unknown) => {
    setValues((current) => setPath(current, path, value));
    setSaveState('dirty');
  }, []);

  const replaceValues = useCallback((next: Record<string, unknown>) => {
    setValues(next);
    setSaveState('dirty');
  }, []);

  /** Writes the document and reports whether the server accepted it. */
  const persist = useCallback(
    async (next: Record<string, unknown>): Promise<boolean> => {
      setSaveState('saving');
      try {
        const saved = await api.saveConfig(widgetId, next);
        setVersion(saved.version);
        setSaveState('saved');
        setError(null);
        return true;
      } catch (cause) {
        setSaveState('error');
        setError(reason(cause, 'could not save'));
        return false;
      }
    },
    [widgetId],
  );

  const save = useCallback(async () => {
    setBusy(true);
    try {
      await persist(values);
    } finally {
      setBusy(false);
    }
  }, [persist, values]);

  const publish = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      // Publishing makes the saved document live, so pending edits have to land
      // first or the operator would publish values they can no longer see.
      if (dirty && !(await persist(values))) return;

      const result = await api.setStatus(widgetId, 'published');
      setStatus(result.status);
    } catch (cause) {
      setError(reason(cause, 'could not publish'));
    } finally {
      setBusy(false);
    }
  }, [dirty, persist, values, widgetId]);

  const unpublish = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.setStatus(widgetId, 'draft');
      setStatus(result.status);
    } catch (cause) {
      setError(reason(cause, 'could not unpublish'));
    } finally {
      setBusy(false);
    }
  }, [widgetId]);

  /** Nothing autosaves any more, so leaving with edits on screen loses them. */
  useEffect(() => {
    if (!dirty) return;

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  return {
    values,
    saveState,
    error,
    status,
    version,
    dirty,
    busy,
    setValue,
    replaceValues,
    save,
    publish,
    unpublish,
  };
}
