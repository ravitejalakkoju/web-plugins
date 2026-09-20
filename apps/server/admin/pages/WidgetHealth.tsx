import { useEffect, useState } from 'preact/hooks';
import type { DerivedStatus, HealthSnapshot } from '@web-plugins/protocol';
import { CopyField, Shell, StatusBadge } from '../components/ui';
import { api } from '../lib/api';
import type { HealthPageData } from '../types';

const EXPLANATIONS: Record<DerivedStatus, string> = {
  LIVE: 'The runtime reported in recently and the widget was visible.',
  DETECTED_NOT_LIVE: 'The script is on the page but the widget did not render visibly.',
  STALE: 'No heartbeat recently. The script may have been removed from the page.',
  ISSUE: 'The runtime reported an error on the last heartbeat.',
  NOT_DEPLOYED: 'Nothing is published, so the script would serve no config.',
  CONFIG_REQUIRED: 'The config does not satisfy the widget schema yet.',
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div class="flex gap-4 border-t border-ink-100 py-2 text-sm first:border-t-0">
      <dt class="w-44 shrink-0 text-ink-500">{label}</dt>
      <dd class="min-w-0 break-words text-ink-900">{value}</dd>
    </div>
  );
}

const when = (iso: string | null): string => (iso ? new Date(iso).toLocaleString() : '—');

export function WidgetHealthPage({ data }: { data: HealthPageData }) {
  const [health, setHealth] = useState<HealthSnapshot>(data.health);

  /** Heartbeats arrive every 30s from the runtime, so poll at the same cadence. */
  useEffect(() => {
    const id = window.setInterval(() => {
      void api
        .health(data.widget.id)
        .then(setHealth)
        .catch(() => undefined);
    }, 15_000);
    return () => window.clearInterval(id);
  }, [data.widget.id]);

  return (
    <Shell active="widgets">
      <div class="mb-5 flex flex-wrap items-center gap-3">
        <a
          href={`/admin/widgets/${data.widget.id}`}
          class="text-sm text-ink-500 hover:text-ink-900"
        >
          ← {data.widget.name}
        </a>
        <h1 class="text-xl font-semibold tracking-tight">Health</h1>
        <StatusBadge status={health.derivedStatus} />
      </div>

      <div class="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div class="wp-card p-4">
          <p class="mb-3 text-sm text-ink-500">{EXPLANATIONS[health.derivedStatus]}</p>
          <dl>
            <Row label="Last seen" value={when(health.lastSeenAt)} />
            <Row label="Last visible" value={when(health.lastVisibleAt)} />
            <Row label="Reported status" value={health.lastHealthStatus ?? '—'} />
            <Row
              label="Config version in use"
              value={health.lastConfigVersion === null ? '—' : `v${health.lastConfigVersion}`}
            />
            <Row label="Last page" value={health.lastPageUrl ?? '—'} />
            <Row label="Error code" value={health.lastErrorCode ?? '—'} />
            <Row label="Error message" value={health.lastErrorMessage ?? '—'} />
            <Row label="Config complete" value={health.configComplete ? 'yes' : 'no'} />
            <Row label="Published" value={health.configDeployed ? 'yes' : 'no'} />
          </dl>
        </div>

        <div class="wp-card h-fit space-y-2 p-4">
          <h2 class="text-sm font-semibold">Install snippet</h2>
          <CopyField value={data.installSnippet} />
          <p class="text-xs text-ink-500">
            Health only updates while a real page is loading the script. This view refreshes every
            15 seconds.
          </p>
        </div>
      </div>
    </Shell>
  );
}
