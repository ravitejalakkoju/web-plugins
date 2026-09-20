import { useEffect, useRef, useState } from 'preact/hooks';
import type { WidgetConfig } from '@web-plugins/protocol/config';
import { getWidgetClient, type WidgetClient, type WidgetClientOptions } from '../client.js';

export interface WidgetState {
  client: WidgetClient;
  config: WidgetConfig | null;
  version: number;
  /** False until the host has answered `ready`. */
  connected: boolean;
  error: Error | null;
}

/**
 * Connect once, then re-render on every config push. In preview the panel pushes
 * edits continuously, which is what makes the live preview work without a
 * reload.
 */
export function useWidget(options?: WidgetClientOptions): WidgetState {
  const client = getWidgetClient(options);
  const [config, setConfig] = useState<WidgetConfig | null>(client.currentConfig);
  const [version, setVersion] = useState(client.configVersion);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;

    const stop = client.onConfig((event) => {
      if (!active) return;
      setConfig(event.config);
      setVersion(event.version);
    });

    client
      .connect()
      .then((event) => {
        if (!active) return;
        setConfig(event.config);
        setVersion(event.version);
        setConnected(true);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause : new Error(String(cause)));
      });

    return () => {
      active = false;
      stop();
    };
  }, [client]);

  return { client, config, version, connected, error };
}

/** Keep the iframe sized to an element. Attach the ref to your outermost node. */
export function useAutoResize<T extends HTMLElement>(enabled = true) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!enabled || !ref.current) return;
    return getWidgetClient().autoResize(ref.current);
  }, [enabled]);

  return ref;
}
