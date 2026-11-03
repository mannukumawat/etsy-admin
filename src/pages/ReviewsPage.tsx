import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EyeOff, RotateCcw, SearchX, Star } from 'lucide-react';
import { reviewsApi, productsApi, type AdminReview } from '@/api';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Badge, EmptyState, Notice } from '@/components/ui/Feedback';
import { FilterBar } from '@/components/ui/FilterBar';
import { PageHeader } from '@/components/ui/Page';
import { usePageMeta } from '@/hooks/misc';
import { useListParams } from '@/hooks/useListParams';
import { invalidate, useQuery } from '@/hooks/useQuery';
import { errorMessage } from '@/services/api';
import { toast } from '@/store';
import { formatDate } from '@/utils/dates';

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 whitespace-nowrap" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={n <= value ? 'h-3.5 w-3.5 text-amber-500' : 'h-3.5 w-3.5 text-sand-300'} fill="currentColor" strokeWidth={0} aria-hidden />
      ))}
    </span>
  );
}

/** Hide/restore dialog. The same controls and wording apply to every rating — moderation is for
 *  abuse/spam, never for removing negative opinions. */
function ModerateDialog({ review, onClose }: { review: AdminReview; onClose: () => void }) {
  const hiding = review.status === 'published';
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <ConfirmDialog
      open
      onClose={onClose}
      title={hiding ? 'Hide review' : 'Restore review'}
      confirmLabel={hiding ? 'Hide review' : 'Restore review'}
      tone={hiding ? 'danger' : 'primary'}
      disabled={reason.trim().length < 3}
      onConfirm={async () => {
        setError(null);
        try {
          if (hiding) await reviewsApi.hideReview(review.id, reason.trim());
          else await reviewsApi.restoreReview(review.id, reason.trim());
          invalidate('reviews');
          toast(hiding ? 'Review hidden from the storefront.' : 'Review restored to the storefront.', 'success');
          onClose();
        } catch (e) {
          setError(errorMessage(e));
        }
      }}
    >
      <div className="space-y-3 text-[13px]">
        <p className="text-ink-soft">
          {hiding
            ? 'Hidden reviews disappear from the product page and are excluded from its average, count and rating breakdown. The customer’s original rating and text are kept unchanged.'
            : 'The review becomes visible again and counts toward the product’s rating.'}
        </p>
        <p className="text-ink-muted">Use this for abuse, spam or personal information — not to remove an honest negative opinion.</p>
        {error && <Notice tone="error">{error}</Notice>}
        <label className="block">
          <span className="mb-1 block font-medium text-ink">Reason (recorded in the moderation history) *</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} className="input min-h-[80px] py-2" />
        </label>
      </div>
    </ConfirmDialog>
  );
}

export default function ReviewsPage() {
  usePageMeta('Reviews', [{ label: 'Sales' }]);
  const list = useListParams(['status', 'rating', 'productId', 'from', 'to'], { sort: 'newest' });
  const [moderating, setModerating] = useState<AdminReview | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const products = useQuery('reviews:products', () => productsApi.fetchProducts());
  const f = list.query.filters ?? {};
  const { data, isLoading, isFetching, error, refetch } = useQuery(
    `reviews:list:${list.key}`,
    () =>
      reviewsApi.fetchReviews({
        q: list.query.q || undefined,
        status: f.status,
        rating: f.rating,
        productId: f.productId,
        from: f.from,
        to: f.to,
        sort: list.query.sort,
        page: list.query.page,
        pageSize: list.query.pageSize,
      }),
    { keepPrevious: true },
  );

  const columns: Column<AdminReview>[] = [
    {
      key: 'review',
      header: 'Review',
      cell: (r) => (
        <div className="min-w-[16rem] max-w-[28rem]">
          <Stars value={r.rating} />
          {r.title && <p className="mt-1 font-medium text-ink">{r.title}</p>}
          {r.body && (
            <p className={expanded === r.id ? 'mt-0.5 whitespace-pre-line break-words text-ink-soft' : 'mt-0.5 line-clamp-2 break-words text-ink-soft'}>{r.body}</p>
          )}
          {!r.title && !r.body && <p className="mt-1 text-ink-faint">Rating only, no text</p>}
          {(r.body.length > 140 || r.moderation.length > 0) && (
            <button type="button" className="link mt-1 text-xs" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
              {expanded === r.id ? 'Show less' : 'Show full text & history'}
            </button>
          )}
          {expanded === r.id && r.moderation.length > 0 && (
            <ol className="mt-2 space-y-1 border-l-2 border-sand-200 pl-3 text-xs text-ink-muted">
              {r.moderation.map((m) => (
                <li key={m.id}>
                  <span className="font-medium text-ink-soft">{m.action === 'hidden' ? 'Hidden' : 'Restored'}</span> · {formatDate(m.at)} — {m.reason}
                </li>
              ))}
            </ol>
          )}
        </div>
      ),
    },
    {
      key: 'product',
      header: 'Product',
      hideBelow: 'md',
      cell: (r) => (
        <div className="max-w-[12rem]">
          <Link to={`/products/${r.product.id}/edit`} className="block truncate hover:underline">
            {r.product.name.en}
          </Link>
          {r.product.status !== 'active' && <span className="text-xs text-ink-muted">({r.product.status})</span>}
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      hideBelow: 'lg',
      cell: (r) => (
        <div className="max-w-[12rem]">
          <Link to={`/customers/${r.customer.id}`} className="block truncate hover:underline">
            {r.customer.name}
          </Link>
          <Link to={`/orders/${r.order.id}`} className="font-mono text-xs text-ink-muted hover:underline">
            {r.order.number}
          </Link>
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      sortKey: 'newest',
      hideBelow: 'sm',
      cell: (r) => (
        <span className="whitespace-nowrap text-ink-soft">
          {formatDate(r.createdAt)}
          {r.editedAt && <span className="block text-xs text-ink-muted">edited {formatDate(r.editedAt)}</span>}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (r.status === 'published' ? <Badge tone="success">Published</Badge> : <Badge tone="warning">Hidden</Badge>),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (r) =>
        r.status === 'published' ? (
          <Button size="sm" variant="outline" onClick={() => setModerating(r)} icon={<EyeOff className="h-3.5 w-3.5" />}>
            Hide
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setModerating(r)} icon={<RotateCcw className="h-3.5 w-3.5" />}>
            Restore
          </Button>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        description={
          <p>
            Verified-purchase reviews from customers whose order was delivered. New reviews publish immediately. Hide abusive or spam reviews with a reason — hidden reviews are removed from
            the storefront and from product ratings, and the customer’s original text is kept.
            {data && (
              <span className="ml-1 text-ink-muted">
                ({data.counts.published} published · {data.counts.hidden} hidden)
              </span>
            )}
          </p>
        }
      />
      <div className="card">
        <FilterBar
          search={list.query.q ?? ''}
          onSearch={(q) => list.update({ q })}
          searchPlaceholder="Search text, customer or product"
          filters={[
            { key: 'status', label: 'Status', options: [{ value: 'published', label: 'Published' }, { value: 'hidden', label: 'Hidden' }] },
            { key: 'rating', label: 'Rating', options: [5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} star${n === 1 ? '' : 's'}` })) },
            { key: 'productId', label: 'Product', options: (products.data ?? []).map((p) => ({ value: p.id, label: p.name.en })) },
          ]}
          values={f}
          onFilter={(k, v) => list.update({ [k]: v })}
          activeCount={list.activeFilters}
          onClear={list.clear}
        >
          <label className="flex items-center gap-1 text-xs text-ink-muted">
            From
            <input type="date" value={f.from ?? ''} max={f.to} onChange={(e) => list.update({ from: e.target.value })} className="input h-9 w-36 py-1" />
          </label>
          <label className="flex items-center gap-1 text-xs text-ink-muted">
            To
            <input type="date" value={f.to ?? ''} min={f.from} onChange={(e) => list.update({ to: e.target.value })} className="input h-9 w-36 py-1" />
          </label>
          <select value={list.query.sort ?? 'newest'} onChange={(e) => list.update({ sort: e.target.value })} className="input h-9 w-40 py-1 text-[13px]" aria-label="Sort">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="highest">Highest rating</option>
            <option value="lowest">Lowest rating</option>
          </select>
        </FilterBar>
        <DataTable
          caption="Reviews"
          columns={columns}
          rows={data?.items}
          getRowId={(r) => r.id}
          loading={isLoading}
          refreshing={isFetching && !isLoading}
          error={error}
          onRetry={refetch}
          page={data?.page}
          pageCount={data?.pageCount}
          total={data?.total}
          pageSize={data?.pageSize}
          onPage={(page) => list.update({ page }, false)}
          empty={
            <EmptyState
              icon={<SearchX className="h-6 w-6" aria-hidden />}
              title={list.activeFilters ? 'No reviews match' : 'No reviews yet'}
              body={list.activeFilters ? 'Try a different search or clear the filters.' : 'Reviews appear here when customers review products from delivered orders.'}
            />
          }
        />
      </div>
      {moderating && (
        <ModerateDialog
          review={moderating}
          onClose={() => {
            setModerating(null);
            void refetch();
          }}
        />
      )}
    </>
  );
}
