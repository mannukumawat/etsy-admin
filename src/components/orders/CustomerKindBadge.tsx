import { Badge } from '@/components/ui/Feedback';

/** "Account" / "Guest" — text + colour. */
export function CustomerKindBadge({ kind }: { kind: 'account' | 'guest' }) {
  return kind === 'account' ? <Badge tone="info">Account</Badge> : <Badge tone="neutral">Guest</Badge>;
}
