import { useState } from 'preact/hooks';
import { api } from '../lib/api';
import { Alert } from '../components/ui';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: Event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(email, password);
      window.location.href = '/admin/widgets';
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'login failed');
      setBusy(false);
    }
  };

  return (
    <div class="flex min-h-screen items-center justify-center px-6">
      <form class="wp-card w-full max-w-sm space-y-4 p-6" onSubmit={submit}>
        <div>
          <h1 class="text-lg font-semibold tracking-tight">Web Plugins</h1>
          <p class="mt-1 text-sm text-ink-500">Sign in to manage your widgets.</p>
        </div>

        {error ? <Alert kind="error">{error}</Alert> : null}

        <div>
          <label class="wp-label" for="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autocomplete="username"
            class="wp-input"
            value={email}
            onInput={(event) => setEmail((event.currentTarget as HTMLInputElement).value)}
          />
        </div>

        <div>
          <label class="wp-label" for="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autocomplete="current-password"
            class="wp-input"
            value={password}
            onInput={(event) => setPassword((event.currentTarget as HTMLInputElement).value)}
          />
        </div>

        <button type="submit" class="wp-btn-primary w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
