import type { ModuleProps } from '../shared/mount';
import { Body, ConfigPreview, Header, Screen, Stack } from '../shared/ui';

/** `view` for the `newsletter` template. */
export interface NewsletterView {
  headline?: string;
  message?: string;
  collectName?: boolean;
  consentText?: string | null;
  submitLabel?: string;
  successTitle?: string;
  successMessage?: string;
  tags?: string[];
}

export function Newsletter({ view, client }: ModuleProps<NewsletterView>) {
  return (
    <Screen>
      <Header title={view.headline ?? 'Newsletter'} onClose={() => void client.close()} />
      <Body>
        <Stack>
          <p class="muted">Config for this widget:</p>
          <ConfigPreview value={view} />
        </Stack>
      </Body>
    </Screen>
  );
}
