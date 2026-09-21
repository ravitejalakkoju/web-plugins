import type { ModuleProps } from '../shared/mount';
import { Body, ConfigPreview, Header, Screen, Stack } from '../shared/ui';

/**
 * `view` for the `support-chat` template. Mirror the template's schema here and
 * the config becomes typed; the host validates it before it ever arrives.
 */
export interface ChatView {
  chat?: {
    enabled?: boolean;
    composerPrefill?: string;
    autoMessage?: { delay?: number; message?: string; chatbotName?: string };
    maintainSession?: boolean;
    collectUserDetails?: boolean;
    botEnabled?: boolean;
  };
}

export function Chat({ view, client }: ModuleProps<ChatView>) {
  return (
    <Screen>
      <Header
        title={view.chat?.autoMessage?.chatbotName ?? 'Chat'}
        onClose={() => void client.close()}
      />
      <Body>
        <Stack>
          <p class="muted">Config for this widget:</p>
          <ConfigPreview value={view} />
        </Stack>
      </Body>
    </Screen>
  );
}
