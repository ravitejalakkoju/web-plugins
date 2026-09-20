import type { WidgetConfig } from '@web-plugins/protocol/config';
// Imported from the `/rpc` subpath, not the package root: the root reaches the Ajv
// validators, which would land in the panel bundle for the sake of one helper.
import { previewConfigMessage } from '@web-plugins/protocol/rpc';
import { useEffect, useRef, useState } from 'preact/hooks';

export interface PreviewProps {
  widgetId: string;
  config: Record<string, unknown>;
  version: number;
}

/**
 * The preview is the real runtime, not a mock. `/admin/preview/:id` serves a page
 * that loads `widget.js?mode=preview`, and edits are pushed in over postMessage,
 * which is what `WidgetHost.listenForPreviewConfig` waits for.
 */
export function Preview({ widgetId, config, version }: PreviewProps) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [nonce, setNonce] = useState(0);
  const [ready, setReady] = useState(false);

  const src = `/admin/preview/${widgetId}`;

  /**
   * The frame can finish loading before this component hydrates, which would lose
   * a one-shot ready message. It is same-origin, so read `readyState` directly and
   * only fall back to the load event when the document is still parsing.
   */
  useEffect(() => {
    setReady(false);

    const element = frame.current;
    if (!element) return;

    const markReady = () => setReady(true);

    if (element.contentDocument?.readyState === 'complete') {
      markReady();
      return;
    }

    element.addEventListener('load', markReady);
    return () => element.removeEventListener('load', markReady);
  }, [nonce]);

  useEffect(() => {
    if (!ready) return;
    const target = frame.current?.contentWindow;
    if (!target) return;

    // Debounced so a burst of keystrokes does not re-render the chrome per char.
    const timer = window.setTimeout(() => {
      // Form state, so mid-edit it can be any shape the schema allows. Preview
      // renders it anyway - showing an in-progress config is the whole point.
      const message = previewConfigMessage(config as unknown as WidgetConfig, version);
      target.postMessage(message, window.location.origin);
    }, 120);

    return () => window.clearTimeout(timer);
  }, [config, version, ready]);

  return (
    <section class="wp-card flex h-full flex-col overflow-hidden">
      <header class="flex items-center gap-2 border-b border-ink-200 px-3 py-2">
        <span class="text-xs font-semibold text-ink-700">Preview</span>
        <span class="text-xs text-ink-500">{ready ? 'live' : 'loading…'}</span>
        <div class="ml-auto flex items-center gap-1">
          {(['desktop', 'mobile'] as const).map((option) => (
            <button
              key={option}
              type="button"
              class={`rounded px-2 py-1 text-xs capitalize ${
                device === option ? 'bg-ink-900 text-white' : 'text-ink-500 hover:bg-ink-100'
              }`}
              onClick={() => setDevice(option)}
            >
              {option}
            </button>
          ))}
          <button
            type="button"
            class="rounded px-2 py-1 text-xs text-ink-500 hover:bg-ink-100"
            onClick={() => setNonce((value) => value + 1)}
          >
            Reload
          </button>
        </div>
      </header>
      <div class="wp-checkerboard flex flex-1 justify-center overflow-hidden p-3">
        <iframe
          key={nonce}
          ref={frame}
          title="Widget preview"
          src={src}
          class="h-full rounded-md border border-ink-200 bg-white"
          style={{ width: device === 'mobile' ? '390px' : '100%' }}
        />
      </div>
    </section>
  );
}
