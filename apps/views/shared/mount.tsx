import type { ComponentType } from 'preact';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { VisitorIdentity, WidgetClient, WidgetConfig } from '@web-plugins/widget-kit';
import { useWidget } from '@web-plugins/widget-kit/preact';
import { Notice } from './ui';
import './styles.css';

/** What every module is handed once the host has answered. */
export interface ModuleProps<View> {
  /** `config.view`, shaped by the template's schema. */
  view: View;
  config: WidgetConfig;
  client: WidgetClient;
  /** Null until the host pushes one, and null for good when identity is off. */
  identity: VisitorIdentity | null;
}

export type Module<View> = ComponentType<ModuleProps<View>>;

/** Config colours become custom properties; nothing below reads a hex code. */
function useTheme(config: WidgetConfig | null): void {
  useEffect(() => {
    if (!config) return;

    const vars: Record<string, string | null | undefined> = {
      '--wp-primary': config.colors?.primaryColor,
      '--wp-on-primary': config.colors?.primaryTextColor,
      '--wp-text': config.colors?.secondaryTextColor,
      '--wp-surface': config.colors?.primaryBackgroundColor,
      '--wp-font': config.theme?.fontFamily,
    };

    const style = document.documentElement.style;
    for (const [name, value] of Object.entries(vars)) {
      if (value) style.setProperty(name, value);
      else style.removeProperty(name);
    }
  }, [config]);
}

/**
 * The host pushes identity whenever it resolves or changes, which is usually after
 * the first render, so this has to be a subscription rather than a snapshot.
 */
function useIdentity(client: WidgetClient): VisitorIdentity | null {
  const [identity, setIdentity] = useState<VisitorIdentity | null>(client.currentIdentity);

  useEffect(() => {
    // Re-read on subscribe: an event can land between the initial state and here.
    setIdentity(client.currentIdentity);
    return client.onIdentity(setIdentity);
  }, [client]);

  return identity;
}

function Boot<View>({ Body }: { Body: Module<View> }) {
  const { client, config, connected, error } = useWidget();
  const identity = useIdentity(client);
  useTheme(config);

  if (error) {
    return (
      <Notice>
        Not connected to a host: {error.message}
        <br />
        Open this page through a Web Plugins launcher rather than directly.
      </Notice>
    );
  }

  if (!config) return <Notice>{connected ? 'Loading…' : 'Connecting…'}</Notice>;

  return (
    <Body view={(config.view ?? {}) as View} config={config} client={client} identity={identity} />
  );
}

/**
 * The three lines every module's `main.tsx` needs. Connection state, theming and
 * the `config.view` unwrapping happen once, here, so a module is only its UI.
 */
export function mount<View>(Body: Module<View>): void {
  const root = document.getElementById('root');
  if (root) render(<Boot Body={Body} />, root);
}
