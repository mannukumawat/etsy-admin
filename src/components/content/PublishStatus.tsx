import { Badge } from '@/components/ui/Feedback';
import { PublishBadge } from '@/components/ui/StatusBadges';
import { API_MODE } from '@/api';
import { hasUnpublishedChanges } from '@/services/contentServices';
import type { Versioned } from '@/types';
import { formatDateTime } from '@/utils/dates';

/** Publish state + timestamps for a versioned content document. In live mode
 *  publishing is real; only demo mode simulates it inside this admin. */
export function PublishStatus({ doc, dirty }: { doc: Versioned<unknown>; dirty: boolean }) {
  const published = !!doc.published;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5" role="status">
        <PublishBadge published={published} changed={hasUnpublishedChanges(doc)} />
        {dirty && <Badge tone="info">Unsaved edits</Badge>}
        <span>
          {published ? (
            <>
              Published{API_MODE ? '' : ' in admin preview'} <span className="num">{formatDateTime(doc.publishedAt)}</span>
            </>
          ) : (
            'Never published'
          )}
        </span>
        <span aria-hidden className="hidden text-ink-faint sm:inline">
          ·
        </span>
        <span>
          Draft saved <span className="num">{formatDateTime(doc.updatedAt)}</span> by {doc.updatedBy}
        </span>
      </div>
      <p className="text-xs text-ink-muted">
        {API_MODE
          ? '“Publish” makes this version live on the storefront.'
          : '“Publish” is simulated: it only updates the published copy inside this admin preview. The storefront (a separate app) is not updated in demo mode, and changes reset on refresh.'}
      </p>
    </div>
  );
}
