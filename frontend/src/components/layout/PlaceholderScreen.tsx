import { EmptyState, type IconName } from '@/components/ui';

import { Screen } from './Screen';

/** Temporary body for routes whose feature lands in a later phase. */
export function PlaceholderScreen({ icon, title }: { icon: IconName; title: string }) {
  return (
    <Screen>
      <EmptyState icon={icon} title={title} message="Coming up in the next build phase." />
    </Screen>
  );
}
