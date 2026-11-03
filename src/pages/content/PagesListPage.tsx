import { Link } from 'react-router-dom';
import { ChevronRight, FileText } from 'lucide-react';
import { PAGE_LABEL, PAGE_PATH } from '@/components/content/contentMeta';
import { Badge, EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/Page';
import { PublishBadge } from '@/components/ui/StatusBadges';
import { usePageMeta } from '@/hooks/misc';
import { useQuery } from '@/hooks/useQuery';
import { contentService, hasUnpublishedChanges } from '@/services/contentServices';
import type { PageDoc } from '@/types';
import { formatDateTime } from '@/utils/dates';

const GRID = 'md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.3fr)_1.5rem] md:items-center md:gap-4';

function PageRow({ doc }: { doc: PageDoc }) {
  const title = doc.draft.title.en || PAGE_LABEL[doc.key];
  return (
    <li className="relative px-4 py-3 hover:bg-ivory-50 sm:px-5">
      <div className={`flex flex-col gap-2 ${GRID}`}>
        <div className="min-w-0">
          {/* The stretched link makes the whole row clickable while keeping one focus stop per page. */}
          <Link to={`/content/pages/${doc.key}`} className="font-medium text-ink after:absolute after:inset-0 hover:underline">
            {title}
          </Link>
          <p className="font-mono text-xs text-ink-muted">
            <span className="sr-only">Storefront path: </span>
            {PAGE_PATH[doc.key]}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="sr-only">Status: </span>
          <PublishBadge published={!!doc.published} changed={hasUnpublishedChanges(doc)} />
          {doc.isLegal && <Badge tone="warning">Sample policy — needs legal review</Badge>}
        </div>
        <div className="text-[13px] text-ink-muted">
          <span className="text-xs md:sr-only">Last updated: </span>
          <span className="num">{formatDateTime(doc.updatedAt)}</span>
        </div>
        <ChevronRight className="hidden h-4 w-4 text-ink-faint md:block" aria-hidden />
      </div>
    </li>
  );
}

export default function PagesListPage() {
  usePageMeta('Pages & policies', [{ label: 'Content' }]);
  const { data, isLoading, error, refetch } = useQuery('pages', () => contentService.listPages());

  return (
    <>
      <PageHeader
        description={
          <div className="max-w-3xl space-y-1">
            <p>Storefront information pages and policies, edited as drafts in English. Shopper translations are on the Translations page.</p>
            <p>
              Publishing here is an admin-preview simulation: the storefront (a separate app) keeps its own copy until backend integration. Policy pages contain sample text that must be reviewed
              before launch.
            </p>
          </div>
        }
      />
      <section className="card overflow-hidden" aria-label="Content pages">
        {error && !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 7 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : !data?.length ? (
          <EmptyState icon={<FileText className="h-6 w-6" aria-hidden />} title="No pages found" />
        ) : (
          <>
            <div className={`hidden border-b border-sand-200 bg-ivory-50 px-5 py-2.5 text-xs font-medium text-ink-muted ${GRID}`} aria-hidden>
              <span>Page</span>
              <span>Status</span>
              <span>Last updated</span>
              <span />
            </div>
            <ul className="divide-y divide-sand-200">
              {data.map((d) => (
                <PageRow key={d.key} doc={d} />
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
