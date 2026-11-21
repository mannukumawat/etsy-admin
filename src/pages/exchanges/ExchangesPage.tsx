import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/Page';
import { usePageMeta } from '@/hooks/misc';
import { useListParams } from '@/hooks/useListParams';
import { useQuery } from '@/hooks/useQuery';
import { fetchExchanges, type AdminExchange, type AdminExchangeList, type ExchangeStatus } from '@/api/exchanges';
import { formatDateTime } from '@/utils/dates';
import { cn } from '@/utils/misc';

/** M-O10: the exchanges list page — the backend has mounted /api/admin/exchanges
 *  since the exchanges feature landed, but the admin had no page, route or nav link
 *  for it. Follows the Returns list pattern (URL-synced status tabs + server paging). */

const STATUS_LABELS: Record<string, string> = {
  all: 'All',
  requested: 'Requested',
  approved: 'Approved',
  shipped: 'Shipped',
  delivered: 'Delivered',
  closed: 'Closed',
  rejected: 'Rejected',
};

const STATUS_BADGE: Record<string, string> = {
  requested: 'bg-sky-50 border-sky-200 text-sky-900',
  approved: 'bg-amber-50 border-amber-200 text-amber-900',
  shipped: 'bg-indigo-50 border-indigo-200 text-indigo-900',
  delivered: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  closed: 'bg-sand-100 border-sand-300 text-ink-muted',
  rejected: 'bg-red-50 border-red-200 text-red-900',
};

const REASON_LABELS: Record<string, string> = {
  wrong_size: 'Wrong size',
  wrong_color: 'Wrong colour',
  damaged: 'Damaged',
  not_as_described: 'Not as described',
  changed_mind: 'Changed mind',
  other: 'Other',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn('inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold', STATUS_BADGE[status] ?? 'bg-sand-100 border-sand-300 text-ink-muted')}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

const PAGE_SIZE = 20;
const STATUSES = ['all', 'requested', 'approved', 'shipped', 'delivered', 'closed', 'rejected'] as const;

export default function ExchangesPage() {
  usePageMeta('Exchanges', [{ label: 'Sales' }]);
  const list = useListParams(['status'], { pageSize: PAGE_SIZE });
  const status = (list.query.filters?.status ?? 'all') as string;
  const page = list.query.page ?? 1;

  const queryKey = `exchanges:list:${status}:${page}`;
  const { data, isLoading, error, refetch } = useQuery<AdminExchangeList>(queryKey, () =>
    fetchExchanges({ status: status === 'all' ? undefined : status, page, pageSize: PAGE_SIZE }),
    { keepPrevious: true },
  );

  const items: AdminExchange[] = data?.items ?? [];
  const pageCount = data?.pageCount ?? 1;

  return (
    <>
      <PageHeader description="Manage customer exchange requests — approve, ship the replacement, then mark delivery and close." />

      <div className="mb-3 flex gap-1 flex-wrap">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => list.update({ status: s === 'all' ? null : s })}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              status === s ? 'bg-ink text-white' : 'bg-white border border-sand-300 text-ink-soft hover:bg-sand-50',
            )}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="card">
        {isLoading ? (
          <div className="flex items-center justify-center gap-3 py-12 text-ink-muted text-sm">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-sand-300 border-t-brand-600" aria-hidden />
            Loading…
          </div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-red-700">
            Failed to load exchanges.{' '}
            <button type="button" onClick={refetch} className="underline">Retry</button>
          </div>
        ) : null}

        {!isLoading && !error && items.length === 0 && (
          <EmptyState
            icon={<RefreshCw className="h-6 w-6" aria-hidden />}
            title={status !== 'all' ? 'No exchanges with this status' : 'No exchange requests yet'}
            body={status !== 'all' ? 'Try a different status.' : 'Customer exchange requests will appear here.'}
            action={
              status !== 'all' ? (
                <Button variant="outline" size="sm" onClick={() => list.clear()}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        )}

        {!isLoading && !error && items.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-sand-200 text-left text-xs font-semibold text-ink-muted">
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3">Order</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Requested</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand-100">
                  {items.map((x) => (
                    <tr key={x.id} className="hover:bg-sand-50">
                      <td className="px-4 py-3">
                        <span className="font-mono font-medium text-ink">{x.reference}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Link to={`/orders/${x.orderId}`} className="font-mono text-brand-700 hover:underline">
                          {x.orderId}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-ink-soft">
                        {REASON_LABELS[x.reason] ?? x.reason}
                        {x.customerNote && <p className="text-xs text-ink-muted truncate max-w-[16rem]">{x.customerNote}</p>}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {x.approvedQty ?? x.requestedQty}
                        {x.approvedQty !== null && x.approvedQty !== x.requestedQty && (
                          <span className="text-xs text-ink-muted"> / {x.requestedQty}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={x.status} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-ink-muted">
                        {formatDateTime(x.requestedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Link to={`/exchanges/${x.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline whitespace-nowrap">
                          View <ArrowRight className="h-3 w-3" aria-hidden />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pageCount > 1 && (
              <div className="flex items-center justify-between border-t border-sand-200 px-4 py-3 text-xs text-ink-muted">
                <span>Page {page} of {pageCount} · {data?.total ?? 0} total</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => list.update({ page: page - 1 }, false)}>
                    <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Prev
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => list.update({ page: page + 1 }, false)}>
                    Next <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

export type { ExchangeStatus };
