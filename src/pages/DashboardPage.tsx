import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, BadgeDollarSign, Boxes, PackageCheck, ReceiptText, ShoppingBag, Users } from 'lucide-react';
import { BarList, SalesChart } from '@/components/charts/Charts';
import { ErrorState, Notice, Skeleton } from '@/components/ui/Feedback';
import { Card, StatCard } from '@/components/ui/Page';
import { FulfilmentBadge, PaymentBadge } from '@/components/ui/StatusBadges';
import { usePageMeta } from '@/hooks/misc';
import { useQuery } from '@/hooks/useQuery';
import { dashboardService } from '@/services/settingsService';
import type { DateRange } from '@/types';
import { formatDate, isValidRange, presetRange, type RangePreset } from '@/utils/dates';
import { METRIC_NOTES } from '@/utils/metrics';
import { formatUsd, formatWithCode } from '@/utils/money';
import { cn } from '@/utils/misc';

const PRESETS: Array<{ id: Exclude<RangePreset, 'custom'>; label: string }> = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
  { id: 'ytd', label: 'Year to date' },
];

function useRange(): { range: DateRange; preset: RangePreset; setPreset: (p: Exclude<RangePreset, 'custom'>) => void; setCustom: (r: DateRange) => void } {
  const [params, setParams] = useSearchParams();
  const p = params.get('range') as RangePreset | null;
  const from = params.get('from');
  const to = params.get('to');
  let preset: RangePreset = p && ['7d', '30d', '90d', 'ytd'].includes(p) ? p : '30d';
  let range = presetRange(preset === 'custom' ? '30d' : preset);
  if (p === 'custom' && from && to) {
    preset = 'custom';
    range = { from, to };
  }
  return {
    range,
    preset,
    setPreset: (id) => setParams({ range: id }, { replace: true }),
    setCustom: (r) => setParams({ range: 'custom', from: r.from, to: r.to }, { replace: true }),
  };
}

export default function DashboardPage() {
  usePageMeta('Dashboard', [{ label: 'Overview' }]);
  const { range, preset, setPreset, setCustom } = useRange();
  const valid = isValidRange(range);
  const { data: m, isLoading, isFetching, error, refetch } = useQuery(valid ? `dashboard:${range.from}:${range.to}` : null, () => dashboardService.metrics(range), { keepPrevious: true });
  const rangeQs = `from=${range.from}&to=${range.to}`;

  return (
    <div className="space-y-6">
      {/* Date range filter — one row above all cards and charts */}
      <div className="flex flex-col gap-3 rounded-xl border border-sand-200 bg-white p-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="group" aria-label="Date range" className="flex flex-wrap gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={preset === p.id}
              onClick={() => setPreset(p.id)}
              className={cn('rounded-lg px-3 py-1.5 text-[13px] font-medium', preset === p.id ? 'bg-ink text-white' : 'text-ink-soft hover:bg-sand-100')}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-ink-muted">
            From
            <input type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setCustom({ from: e.target.value, to: range.to })} className="input mt-0.5 h-9 py-1" />
          </label>
          <label className="text-xs text-ink-muted">
            To
            <input type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && setCustom({ from: range.from, to: e.target.value })} className="input mt-0.5 h-9 py-1" />
          </label>
          {isFetching && <span className="pb-2 text-xs text-ink-muted" role="status">Updating…</span>}
        </div>
      </div>

      {!valid && (
        <Notice tone="error" role="alert">
          The start date must be on or before the end date.
        </Notice>
      )}

      {error && !m ? (
        <div className="card">
          <ErrorState error={error} onRetry={refetch} />
        </div>
      ) : isLoading || !m ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
      ) : (
        <>
          <section aria-label="Key metrics" className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-3', isFetching && 'opacity-70')}>
            <StatCard
              label="Paid revenue (net, USD)"
              value={formatUsd(m.netRevenueUsd)}
              sub={`Gross ${formatUsd(m.grossSalesUsd)} − refunds ${formatUsd(m.refundsUsd)}`}
              icon={<BadgeDollarSign className="h-4 w-4" aria-hidden />}
              to={`/orders?paidOnly=1&${rangeQs}`}
            />
            <StatCard
              label="Orders"
              value={m.totalOrders}
              sub={`${m.paidOrders} paid · ${m.cancelledOrders} cancelled · ${m.failedOrders} failed`}
              icon={<ShoppingBag className="h-4 w-4" aria-hidden />}
              to={`/orders?${rangeQs}`}
            />
            <StatCard label="Average order value (USD)" value={formatUsd(m.aovUsd)} sub="Gross sales ÷ paid orders" icon={<ReceiptText className="h-4 w-4" aria-hidden />} to={`/orders?paidOnly=1&${rangeQs}`} />
            <StatCard
              label="Registered customers"
              value={m.totalRegisteredCustomers}
              sub="Lifetime signed-up accounts · all dates"
              icon={<Users className="h-4 w-4" aria-hidden />}
              to="/customers?kind=account"
            />
            <StatCard label="Buyers in range" value={m.customers} sub="Distinct buyers with a paid order, this range" icon={<Users className="h-4 w-4" aria-hidden />} to={`/orders?paidOnly=1&${rangeQs}`} />
            <StatCard
              label="Pending fulfilment"
              value={m.pendingFulfilment}
              sub="Paid, not yet shipped · all dates"
              icon={<PackageCheck className="h-4 w-4" aria-hidden />}
              tone={m.pendingFulfilment ? 'warning' : 'neutral'}
              to="/orders?pending=1"
            />
            <StatCard
              label="Low-stock variants"
              value={m.lowStockVariants}
              sub={`${m.outOfStockVariants} out of stock · current`}
              icon={<Boxes className="h-4 w-4" aria-hidden />}
              tone={m.outOfStockVariants ? 'danger' : m.lowStockVariants ? 'warning' : 'neutral'}
              to="/inventory?stock=low"
            />
          </section>

          {(m.outOfStockVariants > 0 || m.pendingFulfilment > 0) && (
            <div className="grid gap-3 md:grid-cols-2">
              {m.pendingFulfilment > 0 && (
                <Notice tone="warning" title={`${m.pendingFulfilment} paid order${m.pendingFulfilment === 1 ? '' : 's'} waiting to ship`} action={<Link to="/orders?pending=1" className="link text-[13px]">Review</Link>} />
              )}
              {m.outOfStockVariants > 0 && (
                <Notice tone="error" title={`${m.outOfStockVariants} variant${m.outOfStockVariants === 1 ? ' is' : 's are'} out of stock`} action={<Link to="/inventory?stock=out" className="link text-[13px]">Restock</Link>} />
              )}
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
            <Card title="Sales over time" description={`Net paid revenue per day in USD · ${formatDate(range.from)} – ${formatDate(range.to)}`}>
              <SalesChart points={m.salesSeries} title="Net paid revenue per day (USD)" />
            </Card>
            <Card title="Top products" description="By paid revenue in the range (USD, before order discounts)">
              {m.topProducts.length ? (
                <BarList
                  valueLabel="Top products by revenue"
                  items={m.topProducts.map((p) => ({ key: p.productId, label: p.name.en, value: p.revenueUsd, display: formatUsd(p.revenueUsd), sub: `${p.units} sold`, href: `/products/${p.productId}/edit` }))}
                />
              ) : (
                <p className="text-[13px] text-ink-muted">No paid orders in this range.</p>
              )}
            </Card>
          </div>

          <Card title="Recent orders" actions={<Link to={`/orders?${rangeQs}`} className="link text-[13px]">View all</Link>} bodyClassName="p-0">
            {m.recentOrders.length ? (
              <ul className="divide-y divide-sand-200">
                {m.recentOrders.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 sm:px-5">
                    <Link to={`/orders/${o.id}`} className="font-mono text-[13px] font-semibold hover:underline">
                      {o.number}
                    </Link>
                    <span className="min-w-0 flex-1 truncate text-[13px]">
                      {o.customer.name}
                      {o.customer.kind === 'guest' && <span className="ml-1.5 text-xs text-ink-muted">(guest)</span>}
                    </span>
                    <span className="text-xs text-ink-muted">{formatDate(o.createdAt)}</span>
                    <span className="text-[13px] num">{formatWithCode(o.total, o.currency)}</span>
                    <PaymentBadge status={o.payment.status} />
                    <FulfilmentBadge status={o.fulfilment.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-6 text-[13px] text-ink-muted">No orders in this range.</p>
            )}
          </Card>

          <details className="card px-4 py-3 text-[13px] sm:px-5">
            <summary className="cursor-pointer font-medium text-ink">How these numbers are calculated</summary>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-ink-soft">
              <li>
                <strong>Currency:</strong> every amount is shown in USD. Each order is converted with the exchange rate captured at its checkout; different currencies are never added together unconverted, and today’s settings rates are not applied to past orders.
              </li>
              <li>
                <strong>Paid revenue:</strong> {METRIC_NOTES.revenue} Unpaid and failed payments count as zero.
              </li>
              <li>
                <strong>Cancelled and refunded orders:</strong> only money still kept counts. A cancelled order that was fully refunded adds nothing; a partial refund reduces revenue by the refunded amount.
              </li>
              <li>
                <strong>Orders:</strong> {METRIC_NOTES.orders}
              </li>
              <li>
                <strong>Average order value:</strong> {METRIC_NOTES.aov}
              </li>
              <li>
                <strong>Registered customers:</strong> {METRIC_NOTES.totalRegisteredCustomers}
              </li>
              <li>
                <strong>Buyers in range:</strong> {METRIC_NOTES.customers}
              </li>
              <li>
                <strong>Pending fulfilment and stock:</strong> {METRIC_NOTES.pending} {METRIC_NOTES.stock}
              </li>
              <li>All figures are computed live from orders and accounts in the store database.</li>
            </ul>
          </details>
          <p className="flex items-center gap-1.5 text-xs text-ink-muted">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Only cash-on-delivery payments are real today; no online payment gateway is configured.
          </p>
        </>
      )}
    </div>
  );
}
