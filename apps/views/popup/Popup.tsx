import type { ModuleProps } from '../shared/mount';
import { Body, ConfigPreview, Header, Screen, Stack } from '../shared/ui';

/** `view` for the `email-popup` template. */
export interface PopupView {
  welcomePrompt?: {
    image?: { enabled?: boolean; position?: string; url?: string | null };
    title?: string;
    subTitle?: string;
    message?: string;
    submitBtn?: { color?: string; text?: string; textColor?: string };
    inputs?: ('email' | 'phone' | 'name')[];
  };
  couponConfirmation?: {
    image?: { enabled?: boolean; position?: string; url?: string | null };
    title?: string;
    code?: string;
    message?: string;
    copyCodeBtn?: { color?: string; text?: string; textColor?: string };
  };
}

export function Popup({ view, client }: ModuleProps<PopupView>) {
  return (
    <Screen>
      <Header title={view.welcomePrompt?.title ?? 'Popup'} onClose={() => void client.close()} />
      <Body>
        <Stack>
          <p class="muted">Config for this widget:</p>
          <ConfigPreview value={view} />
        </Stack>
      </Body>
    </Screen>
  );
}
