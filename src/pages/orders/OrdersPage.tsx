import { useId } from 'react';
import { Link } from 'react-router-dom';
import { SearchX, X } from 'lucide-react';
import { CustomerKindBadge } from '@/components/orders/CustomerKindBadge';
import { itemCount } from '@/components/orders/orderDisplay';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/Feedback';
import { FilterBar } from '@/components/ui/FilterBar';
import { PageHeader } from '@/components/ui/Page';
import { FulfilmentBadge, PaymentBadge } from '@/components/ui/StatusBadges';
import { usePageMeta, useSettings } from '@/hooks/misc';
import { useListParams } from '@/hooks/useListParams';
import { useQuery } from '@/hooks/useQuery';
import { orderService } from '@/services/salesServices';
import type { FulfilmentStatus, Order, PaymentStatus } from '@/types';
import { formatDate } from '@/utils/dates';
import { formatWithCode } from '@/utils/money';
import { FULFILMENT_LABEL, PAYMENT_LABEL } from '@/utils/orderRules';

const FILTER_KEYS = ['payment', 'fulfilment', 'currency', 'customer', 'from', 'to', 'pending', 'paidOnly'];
const FALLBACK_CURRENCIES = ['USD', 'INR', 'EUR', 'GBP'];
const PAYMENT_ORDER: PaymentStatus[] = ['unpaid', 'paid', 'partially_refunded', 'refunded', 'failed'];
const FULFILMENT_ORDER: FulfilmentStatus[] = ['unfulfilled', 'processing', 'shipped', 'delivered', 'cancelled'];
const TOTAL_SORT_HINT = 'Sorting by total compares USD equivalents, converted at each order’s checkout rate.';

/** Removable chip for flag-style URL filters (dashboard deep links). */
function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex min-h-9 items-center gap-1 rounded-full border border-brand-600 bg-brand-50/60 py-1 pl-3 pr-1 text-[13px] text-brand-900">
      {label}
      <button type="button" onClick={onRemove} aria-label={`Remove filter: ${label}`} title="Remove filter" className="rounded-full p-1 hover:bg-brand-100">
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </span>
  );
}

export default function OrdersPage() {
  usePageMeta('Orders', [{ label: 'Sales' }]);
  const id = useId();
  const list = useListParams(FILTER_KEYS, { sort: 'date', dir: 'desc' });
  const { data, isLoading, isFetching, error, refetch } = useQuery(`orders:list:${list.key}`, () => orderService.list(list.query), { keepPrevious: true });
  const { data: settings } = useSettings();
  const currencies = settings?.currencies.currencies.map((c) => c.code) ?? FALLBACK_CURRENCIES;
  const f = list.query.filters ?? {};
  const from = f.from ?? '';
  const to = f.to ?? '';
  const badRange = !!from && !!to && from > to;

  const columns: Column<Order>[] = [
    {
      key: 'number',
      header: 'Order',
      sortKey: 'number',
      cell: (o) => (
        <Link to={`/orders/${o.id}`} className="whitespace-nowrap font-medium text-ink hover:underline">
          {o.number}
        </Link>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      cell: (o) => (
        <div className="min-w-[10rem] max-w-[16rem]">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium text-ink">{o.customer.name}</span>
            {o.customer.kind === 'guest' && <CustomerKindBadge kind="guest" />}
          </div>
          <p className="truncate text-xs text-ink-muted">{o.customer.email}</p>
        </div>
      ),
    },
    { key: 'date', header: 'Date', sortKey: 'date', hideBelow: 'sm', cell: (o) => <span className="whitespace-nowrap text-ink-soft">{formatDate(o.createdAt)}</span> },
    { key: 'items', header: 'Items', align: 'right', hideBelow: 'lg', cell: (o) => <span className="num">{itemCount(o)}</span> },
    {
      key: 'total',
      header: <span title={TOTAL_SORT_HINT}>Total</span>,
      sortKey: 'total',
      align: 'right',
      cell: (o) => <span className="num whitespace-nowrap font-medium">{formatWithCode(o.total, o.currency)}</span>,
    },
    { key: 'payment', header: 'Payment', cell: (o) => <PaymentBadge status={o.payment.status} /> },
    { key: 'fulfilment', header: 'Fulfilment', cell: (o) => <FulfilmentBadge status={o.fulfilment.status} /> },
  ];

  return (
    <>
      <PageHeader
        description={
          <>
            <p>Each order keeps the currency and exchange rate captured at checkout. Payments and refunds here are simulations — no money moves.</p>
            <p className="mt-1">Status changes do not notify customers and do not update the storefront (separate app, demo).</p>
          </>
        }
      />
      <div className="card">
        <FilterBar
          search={list.query.q ?? ''}
          onSearch={(q) => list.update({ q })}
          searchPlaceholder="Search order number, name or email"
          filters={[
            { key: 'payment', label: 'Payment', options: PAYMENT_ORDER.map((s) => ({ value: s, label: PAYMENT_LABEL[s] })) },
            { key: 'fulfilment', label: 'Fulfilment', options: FULFILMENT_ORDER.map((s) => ({ value: s, label: FULFILMENT_LABEL[s] })) },
            { key: 'currency', label: 'Currency', options: currencies.map((c) => ({ value: c, label: c })) },
            { key: 'customer', label: 'Customer', options: [{ value: 'account', label: 'Account' }, { value: 'guest', label: 'Guest' }] },
          ]}
          values={f}
          onFilter={(k, v) => list.update({ [k]: v })}
          activeCount={list.activeFilters}
          onClear={list.clear}
        >
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Order date range">
            <div className="flex items-center gap-1.5">
              <label htmlFor={`${id}-from`} className="text-xs text-ink-muted">
                From
              </label>
              <input
                id={`${id}-from`}
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => list.update({ from: e.target.value })}
                aria-invalid={badRange || undefined}
                className="input h-9 w-auto py-1 text-[13px]"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label htmlFor={`${id}-to`} className="text-xs text-ink-muted">
                To
              </label>
              <input
                id={`${id}-to`}
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => list.update({ to: e.target.value })}
                aria-invalid={badRange || undefined}
                className="input h-9 w-auto py-1 text-[13px]"
              />
            </div>
          </div>
          {f.pending === '1' && <FilterChip label="Pending fulfilment (paid, not shipped)" onRemove={() => list.update({ pending: null })} />}
          {f.paidOnly === '1' && <FilterChip label="Successfully paid only" onRemove={() => list.update({ paidOnly: null })} />}
        </FilterBar>
        {(badRange || list.query.sort === 'total') && (
          <div className="space-y-1 border-b border-sand-200 px-4 py-2 text-xs">
            {badRange && (
              <p role="alert" className="text-red-700">
                The “From” date is after the “To” date, so no orders can match.
              </p>
            )}
            {list.query.sort === 'total' && <p className="text-ink-muted">{TOTAL_SORT_HINT}</p>}
          </div>
        )}
        <DataTable
          caption="Orders"
          columns={columns}
          rows={data?.items}
          getRowId={(o) => o.id}
          loading={isLoading}
          refreshing={isFetching && !isLoading}
          error={error}
          onRetry={refetch}
          sort={list.query.sort}
          dir={list.query.dir}
          onSort={list.toggleSort}
          page={data?.page}
          pageCount={data?.pageCount}
          total={data?.total}
          pageSize={data?.pageSize}
          onPage={(page) => list.update({ page }, false)}
          empty={
            <EmptyState
              icon={<SearchX className="h-6 w-6" aria-hidden />}
              title={list.activeFilters ? 'No orders match' : 'No orders yet'}
              body={list.activeFilters ? 'Try a different search or clear the filters.' : 'Orders placed on the storefront will appear here.'}
              action={
                list.activeFilters ? (
                  <Button variant="outline" size="sm" onClick={list.clear}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          }
        />
      </div>
    </>
  );
}
