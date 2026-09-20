import { useWidget } from '@web-plugins/widget-kit/preact';

interface HelloView {
  greeting?: string;
  body?: string;
  ctaLabel?: string;
  ctaUrl?: string | null;
}

/**
 * A complete widget in one component. Note what it does not do: no fetching, no
 * knowledge of the API, no widget id handling. The host resolves config and hands
 * it over, and pushes a new one whenever the operator edits it.
 */
export function App() {
  const { client, config, connected, error } = useWidget();

  if (error) {
    return (
      <div class="card">
        <p class="card__state">
          Not connected to a host: {error.message}
          <br />
          Open this page through a Web Plugins launcher instead of directly.
        </p>
      </div>
    );
  }

  if (!config) {
    return (
      <div class="card">
        <p class="card__state">{connected ? 'Waiting for config…' : 'Connecting…'}</p>
      </div>
    );
  }

  const view = (config.view ?? {}) as HelloView;
  const primary = config.colors?.primaryColor ?? '#2563eb';
  const onPrimary = config.colors?.primaryTextColor ?? '#ffffff';

  return (
    <div
      class="card"
      style={{ '--wp-primary': primary, '--wp-on-primary': onPrimary } as Record<string, string>}
    >
      <header class="card__header">
        <h1 class="card__title">{view.greeting ?? 'Hello'}</h1>
        <button
          type="button"
          class="card__close"
          onClick={() => void client.close()}
          aria-label="Close"
        >
          Close
        </button>
      </header>

      <div class="card__body">
        <p>{view.body}</p>
        {view.ctaLabel ? (
          <button
            type="button"
            class="card__cta"
            onClick={() => {
              void client.track('hello_cta_clicked', { url: view.ctaUrl ?? null });
              // Navigation goes through the host so the top window moves, not
              // this iframe. The host rejects anything that is not http(s).
              if (view.ctaUrl) void client.openUrl(view.ctaUrl);
            }}
          >
            {view.ctaLabel}
          </button>
        ) : null}
      </div>

      <footer class="card__footer">
        <span>widget {client.meta.widgetId}</span>
        <span>config v{client.configVersion}</span>
        <span>{client.meta.mode}</span>
      </footer>
    </div>
  );
}
