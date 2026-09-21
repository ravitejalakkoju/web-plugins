import type { ModuleProps } from '../shared/mount';
import { Body, ConfigPreview, Header, Screen, Stack } from '../shared/ui';

/** `view` for the `rewards` template. */
export interface RewardsView {
  bestSellerPageUrl?: string;
  whatsapp?: string;
  pointsOnFeedback?: boolean;
  registerFromWidget?: boolean | null;
  referEnabled?: boolean | null;
  redeemEnabled?: boolean | null;
  earnEnabled?: boolean | null;
  faq?: { question: string; answer: string }[];
}

export function Rewards({ view, client, identity }: ModuleProps<RewardsView>) {
  return (
    <Screen>
      <Header
        title="Rewards"
        subtitle={identity?.externalId ? `member ${identity.externalId}` : undefined}
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
