import type { ComponentChildren } from 'preact';
import type { DerivedStatus } from '@web-plugins/protocol';

export function Shell({ children, active }: { children: ComponentChildren; active?: 'widgets' }) {
  return (
    <div class="min-h-screen">
      <header class="border-b border-ink-200 bg-white">
        <div class="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <a href="/admin/widgets" class="text-sm font-semibold tracking-tight">
            Web Plugins
          </a>
          <nav class="flex-1">
            <a
              href="/admin/widgets"
              class={`rounded-md px-2 py-1 text-sm ${
                active === 'widgets' ? 'bg-ink-100 text-ink-900' : 'text-ink-500 hover:text-ink-900'
              }`}
            >
              Widgets
            </a>
          </nav>
          <form method="post" action="/admin/logout">
            <button type="submit" class="text-sm text-ink-500 hover:text-ink-900">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main class="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}

const STATUS_STYLES: Record<DerivedStatus, string> = {
  LIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  DETECTED_NOT_LIVE: 'bg-amber-50 text-amber-700 ring-amber-200',
  STALE: 'bg-orange-50 text-orange-700 ring-orange-200',
  ISSUE: 'bg-rose-50 text-rose-700 ring-rose-200',
  NOT_DEPLOYED: 'bg-ink-100 text-ink-500 ring-ink-200',
  CONFIG_REQUIRED: 'bg-ink-100 text-ink-500 ring-ink-200',
};

const STATUS_LABELS: Record<DerivedStatus, string> = {
  LIVE: 'Live',
  DETECTED_NOT_LIVE: 'Loaded, not visible',
  STALE: 'Stale',
  ISSUE: 'Issue',
  NOT_DEPLOYED: 'Not published',
  CONFIG_REQUIRED: 'Config required',
};

export function StatusBadge({ status }: { status: DerivedStatus }) {
  return (
    <span
      class={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function Alert({ kind, children }: { kind: 'error' | 'ok'; children: ComponentChildren }) {
  const styles =
    kind === 'error'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return <div class={`rounded-md border px-3 py-2 text-sm ${styles}`}>{children}</div>;
}

export function CopyField({ value }: { value: string }) {
  return (
    <div class="flex items-stretch gap-2">
      <code class="flex-1 overflow-x-auto rounded-md bg-ink-900 px-3 py-2 font-mono text-xs whitespace-nowrap text-ink-100">
        {value}
      </code>
      <button
        type="button"
        class="wp-btn-ghost shrink-0"
        onClick={(event) => {
          void navigator.clipboard?.writeText(value);
          const button = event.currentTarget as HTMLButtonElement;
          const previous = button.textContent;
          button.textContent = 'Copied';
          window.setTimeout(() => {
            button.textContent = previous;
          }, 1200);
        }}
      >
        Copy
      </button>
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div class="wp-card px-6 py-12 text-center">
      <p class="text-sm font-medium text-ink-900">{title}</p>
      <p class="mt-1 text-sm text-ink-500">{body}</p>
    </div>
  );
}
