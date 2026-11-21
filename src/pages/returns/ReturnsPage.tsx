import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight, PackageSearch } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/Page';
import { usePageMeta, useDebounced } from '@/hooks/misc';
import { useListParams } from '@/hooks/useListParams';
import { useQuery } from '@/hooks/useQuery';
import { fetchReturns, type AdminReturn, type AdminReturnList } from '@/api/returns';
import { formatDateTime } from '@/utils/dates';
import { cn } from '@/utils/misc';


const STATUS_LABELS: Record<string, string> = {
  all: 'All',
  requested: 'Requested',
  approved: 'Approved',
  rejected: 'Rejected',
  shipping_arranged: 'Pickup arranged',
  in_transit: 'In transit',
  received: 'Received',
  inspected: 'Inspected',
  refunded: 'Refunded',
  withdrawn: 'Withdrawn',
  closed: 'Closed',
};

const STATUS_BADGE: Record<string, string> = {
  requested: 'bg-sky-50 border-sky-200 text-sky-900',
  approved: 'bg-amber-50 border-amber-200 text-amber-900',
  rejected: 'bg-red-50 border-red-200 text-red-900',
  shipping_arranged: 'bg-purple-50 border-purple-200 text-purple-900',
  in_transit: 'bg-indigo-50 border-indigo-200 text-indigo-900',
  received: 'bg-teal-50 border-teal-200 text-teal-900',
  inspected: 'bg-orange-50 border-orange-200 text-orange-900',
  refunded: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  withdrawn: 'bg-sand-100 border-sand-300 text-ink-muted',
  closed: 'bg-sand-100 border-sand-300 text-ink-muted',
};

const REASON_LABELS: Record<string, string> = {
  damaged: 'Damaged',
  wrong_item: 'Wrong item',
  not_as_described: 'Not as described',
  changed_mind: 'Changed mind',
  quality_issue: 'Quality issue',
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

export default function ReturnsPage() {
  usePageMeta('Returns', [{ label: 'Sales' }]);
  // M-O3: list state lives in the URL (shareable, survives refresh/back) and the
  // search is debounced — the old local useState fired a request per keystroke.
  const list = useListParams(['status'], { pageSize: PAGE_SIZE });
  const status = list.query.filters?.status ?? 'all';
  const page = list.query.page ?? 1;
  const [qInput, setQInput] = useState(list.query.q ?? '');
  const q = useDebounced(qInput, 300);

  const queryKey = `returns:list:${status}:${q}:${page}`;
  const { data, isLoading, error, refetch } = useQuery<AdminReturnList>(queryKey, () =>
    fetchReturns({ q: q || undefined, status: status === 'all' ? undefined : status, page, pageSize: PAGE_SIZE }),
    { keepPrevious: true },
  );

  const statusCounts = data?.statusCounts ?? {};
  const items: AdminReturn[] = data?.items ?? [];
  const pageCount = data?.pageCount ?? 1;

  return (
    <>
      <PageHeader description="Manage customer return requests from request through refund." />

      {/* Status tabs — M-O2: every status is a tab now, not just seven of them. */}
      <div className="mb-3 flex gap-1 flex-wrap">
        {(['all', 'requested', 'approved', 'shipping_arranged', 'in_transit', 'received', 'inspected', 'refunded', 'rejected', 'withdrawn', 'closed'] as const).map((s) => (
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
            {s !== 'all' && statusCounts[s] ? (
              <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold', status === s ? 'bg-white/20 text-white' : 'bg-sand-100 text-ink-muted')}>
                {statusCounts[s]}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="card">
        {/* Search bar */}
        <div className="border-b border-sand-200 p-4">
          <input
            type="search"
            value={qInput}
            onChange={(e) => { setQInput(e.target.value); list.update({ q: e.target.value }); }}
            placeholder="Search reference, order number, customer…"
            className="input w-full sm:w-80"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-3 py-12 text-ink-muted text-sm">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-sand-300 border-t-brand-600" aria-hidden />
            Loading…
          </div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-red-700">
            Failed to load returns.{' '}
            <button type="button" onClick={refetch} className="underline">Retry</button>
          </div>
        ) : null}

        {!isLoading && !error && items.length === 0 && (
          <EmptyState
            icon={<PackageSearch className="h-6 w-6" aria-hidden />}
            title={status !== 'all' || q ? 'No returns match' : 'No return requests yet'}
            body={status !== 'all' || q ? 'Try a different status or search term.' : 'Customer return requests will appear here.'}
            action={
              (status !== 'all' || q) ? (
                <Button variant="outline" size="sm" onClick={() => { setQInput(''); list.clear(); }}>
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
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand-100">
                  {items.map((r) => (
                    <tr key={r.id} className="hover:bg-sand-50">
                      <td className="px-4 py-3">
                        <span className="font-mono font-medium text-ink">{r.reference}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Link to={`/orders/${r.orderId}`} className="font-mono text-brand-700 hover:underline">
                          {r.orderNumber ?? r.orderId}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-ink-soft">
                        {REASON_LABELS[r.reason] ?? r.reason}
                        {r.customerNote && <p className="text-xs text-ink-muted truncate max-w-[16rem]">{r.customerNote}</p>}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{r.requestedQty}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-ink-muted">
                        {formatDateTime(r.requestedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Link to={`/returns/${r.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline whitespace-nowrap">
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
