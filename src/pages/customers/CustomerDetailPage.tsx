import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, ShoppingBag, UserX } from 'lucide-react';
import { CustomerKindBadge } from '@/components/orders/CustomerKindBadge';
import { countryName, safeDecode } from '@/components/orders/orderDisplay';
import { ButtonLink } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Badge, EmptyState, ErrorState, Notice, Skeleton } from '@/components/ui/Feedback';
import { Card, DefinitionList, PageHeader, StatCard } from '@/components/ui/Page';
import { FulfilmentBadge, PaymentBadge } from '@/components/ui/StatusBadges';
import { usePageMeta } from '@/hooks/misc';
import { useQuery } from '@/hooks/useQuery';
import { ApiError } from '@/services/api';
import { customerService } from '@/services/salesServices';
import type { Order, SavedAddress } from '@/types';
import { formatDate } from '@/utils/dates';
import { formatUsd, formatWithCode } from '@/utils/money';

const USD_NOTE = '(USD, converted at each order’s checkout rate)';

function AddressBlock({ address }: { address: SavedAddress }) {
  const cityLine = [address.city, address.region, address.postalCode].filter(Boolean).join(', ');
  return (
    <li className="rounded-lg border border-sand-200 px-3.5 py-3 text-[13px]">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink">{address.label}</span>
        {address.isDefault && <Badge tone="brand">Default</Badge>}
      </div>
      <address className="not-italic leading-relaxed text-ink-soft">
        {address.fullName}
        <br />
        {address.line1}
        {address.line2 && (
          <>
            <br />
            {address.line2}
          </>
        )}
        {cityLine && (
          <>
            <br />
            {cityLine}
          </>
        )}
        <br />
        {countryName(address.country)}
        {address.phone && (
          <>
            <br />
            <span className="text-ink-muted">{address.phone}</span>
          </>
        )}
      </address>
    </li>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      <Skeleton className="h-5 w-72 max-w-full" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

export default function CustomerDetailPage() {
  const params = useParams();
  const id = safeDecode(params.id);
  const { data, isLoading, error, refetch } = useQuery(id ? `customer:${id}` : null, () => customerService.get(id));
  const notFound = error instanceof ApiError && error.code === 'not_found';
  usePageMeta(data?.summary.name ?? (notFound ? 'Customer not found' : 'Customer'), [{ label: 'Sales' }, { label: 'Customers', to: '/customers' }]);

  if (notFound || !id) {
    return (
      <div className="card">
        <EmptyState
          icon={<UserX className="h-6 w-6" aria-hidden />}
          title="Customer not found"
          body="This customer doesn’t exist, or the demo data was reset."
          action={
            <ButtonLink to="/customers" size="sm" icon={<ArrowLeft className="h-4 w-4" aria-hidden />}>
              Back to customers
            </ButtonLink>
          }
        />
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="card">
        <ErrorState error={error} onRetry={refetch} title="Couldn’t load this customer" />
      </div>
    );
  }
  if (isLoading || !data) return <LoadingSkeleton />;

  const { summary, account, orders } = data;
  const isGuest = summary.kind === 'guest';
  const firstOrderAt = orders.reduce<string | null>((min, o) => (!min || o.createdAt < min ? o.createdAt : min), null);
  const average = summary.paidOrderCount > 0 ? Math.round(summary.spentUsd / summary.paidOrderCount) : null;

  const columns: Column<Order>[] = [
    {
      key: 'number',
      header: 'Order',
      cell: (o) => (
        <Link to={`/orders/${o.id}`} className="whitespace-nowrap font-medium text-ink hover:underline">
          {o.number}
        </Link>
      ),
    },
    { key: 'date', header: 'Date', cell: (o) => <span className="whitespace-nowrap text-ink-soft">{formatDate(o.createdAt)}</span> },
    { key: 'total', header: 'Total', align: 'right', cell: (o) => <span className="num whitespace-nowrap font-medium">{formatWithCode(o.total, o.currency)}</span> },
    { key: 'payment', header: 'Payment', cell: (o) => <PaymentBadge status={o.payment.status} /> },
    { key: 'fulfilment', header: 'Fulfilment', hideBelow: 'sm', cell: (o) => <FulfilmentBadge status={o.fulfilment.status} /> },
  ];

  return (
    <>
      <PageHeader
        description={
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-semibold text-ink">{summary.name}</span>
              <CustomerKindBadge kind={summary.kind} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <a href={`mailto:${summary.email}`} className="inline-flex min-w-0 items-center gap-1.5 break-all hover:text-ink hover:underline">
                <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {summary.email}
              </a>
              {summary.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {summary.phone}
                </span>
              )}
            </div>
          </div>
        }
        actions={
          <ButtonLink to="/customers" size="sm" variant="ghost" icon={<ArrowLeft className="h-4 w-4" aria-hidden />}>
            All customers
          </ButtonLink>
        }
      />

      {isGuest && (
        <Notice tone="warning" className="mb-5" title="Guest checkout — not linked to any account, even if an account uses the same email.">
          These orders are grouped by email among guest orders only. They are never merged into an account automatically.
        </Notice>
      )}

      <section aria-label="Summary" className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Orders" value={<span className="num">{summary.orderCount}</span>} sub="All orders, including unpaid and cancelled" />
        <StatCard label="Paid orders" value={<span className="num">{summary.paidOrderCount}</span>} sub="Payment succeeded at some point" />
        <StatCard label="Spent" value={<span className="num">{formatUsd(summary.spentUsd)}</span>} sub={`Net paid after refunds ${USD_NOTE}`} />
        <StatCard label="Average paid order" value={<span className="num">{average === null ? '—' : formatUsd(average)}</span>} sub={`Spent ÷ paid orders ${USD_NOTE}`} />
        <StatCard label="First order" value={<span className="text-xl">{formatDate(firstOrderAt)}</span>} />
        <StatCard label="Last order" value={<span className="text-xl">{formatDate(summary.lastOrderAt)}</span>} />
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card title="Order history" description="Newest first. Totals are in each order’s own currency." className="min-w-0" bodyClassName="p-0 sm:p-0">
          <DataTable
            caption={`Orders by ${summary.name}`}
            columns={columns}
            rows={orders}
            getRowId={(o) => o.id}
            empty={<EmptyState icon={<ShoppingBag className="h-6 w-6" aria-hidden />} title="No orders yet" body="This account hasn’t placed an order." />}
          />
        </Card>

        <div className="space-y-5">
          <Card title="Contact">
            <DefinitionList
              items={[
                ['Type', <CustomerKindBadge kind={summary.kind} />],
                ['Email', <span className="break-all">{summary.email}</span>],
                ['Phone', summary.phone || <span className="text-ink-faint">—</span>],
                ['Joined', isGuest ? <span className="text-ink-faint">— (guest)</span> : formatDate(account?.createdAt ?? summary.createdAt)],
                ...(account ? ([['Marketing emails', account.marketingOptIn ? <Badge tone="success">Opted in</Badge> : <Badge tone="neutral">Not opted in</Badge>]] as Array<[string, JSX.Element]>) : []),
              ]}
            />
          </Card>

          {account && (
            <Card title="Saved addresses" description="From the customer’s storefront account.">
              {account.addresses.length ? (
                <ul className="space-y-3">
                  {account.addresses.map((a) => (
                    <AddressBlock key={a.id} address={a} />
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-ink-muted">No saved addresses.</p>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
