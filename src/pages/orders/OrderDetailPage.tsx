import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, Banknote, ExternalLink, Mail, Package, PackageCheck, PackageOpen, PackageX, Pencil, Phone, Truck, Undo2, Wallet } from 'lucide-react';
import { AddNoteForm } from '@/components/orders/AddNoteForm';
import { CancelOrderDialog } from '@/components/orders/CancelOrderDialog';
import { CustomerKindBadge } from '@/components/orders/CustomerKindBadge';
import { ACTOR_LABEL, countryName, customerIdFor, customerPath, EVENT_LABEL, formatRate, itemCount, PAYMENT_METHOD_LABEL, refreshSales } from '@/components/orders/orderDisplay';
import { RefundDialog } from '@/components/orders/RefundDialog';
import { TrackingDialog } from '@/components/orders/TrackingDialog';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Badge, EmptyState, ErrorState, Notice, Skeleton } from '@/components/ui/Feedback';
import { Card, DefinitionList, PageHeader } from '@/components/ui/Page';
import { FulfilmentBadge, PaymentBadge } from '@/components/ui/StatusBadges';
import { usePageMeta } from '@/hooks/misc';
import { useQuery } from '@/hooks/useQuery';
import { ApiError, errorMessage } from '@/services/api';
import { orderService } from '@/services/salesServices';
import { confirmAction, toast } from '@/store';
import type { Order } from '@/types';
import { formatDateTime } from '@/utils/dates';
import { cn, isHttpUrl, pluralize } from '@/utils/misc';
import { formatUsd, formatWithCode, toUsd } from '@/utils/money';
import { canMarkPaid, canRecordCodCollection, checkCancel, netPaid, nextFulfilment, refundableAmount, wasPaid } from '@/utils/orderRules';

const NO_NOTIFY = 'The customer is not notified and the storefront is not updated (separate app, demo).';

type DialogKind = 'ship' | 'tracking' | 'cancel' | 'refund' | 'cod-collection' | null;
type BusyKind = 'processing' | 'delivered' | 'paid' | 'cod-collection' | null;

function TotalsRow({ label, sub, value, strong, className }: { label: ReactNode; sub?: ReactNode; value: ReactNode; strong?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 py-1.5', className)}>
      <dt className={cn('min-w-0', strong ? 'font-semibold text-ink' : 'text-ink-muted')}>
        {label}
        {sub && <span className="block text-xs font-normal text-ink-faint">{sub}</span>}
      </dt>
      <dd className={cn('num shrink-0 text-right', strong ? 'font-semibold text-ink' : 'font-medium text-ink')}>{value}</dd>
    </div>
  );
}

function ItemsCard({ order }: { order: Order }) {
  const money = (minor: number) => formatWithCode(minor, order.currency);
  const taxPct = `${Number(order.taxRate.toFixed(2))}%`;
  const paid = wasPaid(order.payment.status);
  return (
    <Card title={`Items (${itemCount(order)})`} description="Prices and product details are a snapshot from checkout — later catalogue changes don’t affect this order.">
      <ul className="-mt-2 divide-y divide-sand-200/70">
        {order.lines.map((line) => (
          <li key={`${line.variantId}-${line.sku}`} className="flex gap-3 py-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-sand-200 bg-sand-100">
              {line.imageUrl ? <img src={line.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" /> : <Package className="h-5 w-5 text-ink-faint" aria-hidden />}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <p className="break-words font-medium text-ink">{line.name.en}</p>
                {line.variantLabel && <p className="text-xs text-ink-soft">{line.variantLabel}</p>}
                <p className="break-all font-mono text-xs text-ink-muted">SKU {line.sku}</p>
              </div>
              <div className="shrink-0 sm:text-right">
                <p className="num text-xs text-ink-muted">
                  {money(line.unitPrice)} × {line.quantity}
                </p>
                <p className="num font-medium text-ink">{money(line.lineTotal)}</p>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <dl className="mt-2 border-t border-sand-200 pt-2 text-[13px]">
        <TotalsRow label="Subtotal" value={money(order.subtotal)} />
        {order.discount > 0 && (
          <TotalsRow
            label={
              <span className="inline-flex flex-wrap items-center gap-1.5">
                Discount {order.couponCode && <Badge tone="brand" className="font-mono">{order.couponCode}</Badge>}
              </span>
            }
            value={`−${money(order.discount)}`}
          />
        )}
        <TotalsRow label="Shipping" sub={`${order.shippingMethod.label} · ${order.shippingMethod.minDays}–${order.shippingMethod.maxDays} business days`} value={money(order.shipping)} />
        <TotalsRow
          label={`Tax (${taxPct}, ${order.taxInclusive ? 'included' : 'added'})`}
          sub={order.taxInclusive ? 'Included in the prices above — not added to the total.' : 'Added on top of the prices above.'}
          value={order.taxInclusive ? <span className="text-ink-muted">incl. {money(order.tax)}</span> : money(order.tax)}
        />
        <TotalsRow label="Total" value={money(order.total)} strong className="mt-1 border-t border-sand-200 pt-2.5 text-sm" />
        {order.refundedTotal > 0 && <TotalsRow label="Refunded" value={`−${money(order.refundedTotal)}`} />}
        <TotalsRow label="Net paid" sub={paid ? 'Total minus refunds.' : 'No payment has been captured.'} value={money(netPaid(order))} strong />
      </dl>
    </Card>
  );
}

function TimelineCard({ order }: { order: Order }) {
  const events = [...order.events].sort((a, b) => a.at.localeCompare(b.at));
  return (
    <Card title="Timeline" description="Oldest first.">
      <ol className="ml-1.5 space-y-4 border-l border-sand-300 pl-5">
        {events.map((ev) => (
          <li key={ev.id} className="relative">
            <span
              className={cn(
                'absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white ring-1',
                ev.type === 'cancelled' || ev.type === 'refund' ? 'bg-red-600 ring-red-200' : ev.actor === 'admin' ? 'bg-brand-600 ring-brand-200' : 'bg-sand-400 ring-sand-300',
              )}
              aria-hidden
            />
            <p className="text-[13px] text-ink">
              <span className="font-semibold">{EVENT_LABEL[ev.type]}</span> — {ev.message}
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">
              {ACTOR_LABEL[ev.actor]} · <time dateTime={ev.at}>{formatDateTime(ev.at)}</time>
            </p>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function NotesCard({ order }: { order: Order }) {
  const notes = [...order.notes].sort((a, b) => a.at.localeCompare(b.at));
  return (
    <Card title="Internal notes" description="Internal — never shown to the customer. Oldest first.">
      {notes.length ? (
        <ul className="mb-4 space-y-2.5">
          {notes.map((n) => (
            <li key={n.id} className="rounded-lg border border-sand-200 bg-ivory-50 px-3.5 py-2.5">
              <p className="whitespace-pre-wrap break-words text-[13px] text-ink">{n.body}</p>
              <p className="mt-1 text-xs text-ink-muted">
                {n.author} · <time dateTime={n.at}>{formatDateTime(n.at)}</time>
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-[13px] text-ink-muted">No notes yet.</p>
      )}
      <AddNoteForm orderId={order.id} />
    </Card>
  );
}

function CustomerCard({ order }: { order: Order }) {
  const c = order.customer;
  return (
    <Card
      title="Customer"
      actions={
        <Link to={customerPath(customerIdFor(c))} className="link text-[13px]">
          View customer
        </Link>
      }
    >
      <div className="space-y-1.5 text-[13px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-ink">{c.name}</span>
          <CustomerKindBadge kind={c.kind} />
        </div>
        <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 break-all text-ink-soft hover:text-ink hover:underline">
          <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {c.email}
        </a>
        {c.phone && (
          <p className="flex items-center gap-1.5 text-ink-soft">
            <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {c.phone}
          </p>
        )}
        {c.kind === 'guest' && <p className="pt-1 text-xs text-ink-muted">Guest checkout — not linked to any account, even if an account uses the same email.</p>}
      </div>
    </Card>
  );
}

function AddressCard({ order }: { order: Order }) {
  const a = order.shippingAddress;
  const cityLine = [a.city, a.region, a.postalCode].filter(Boolean).join(', ');
  return (
    <Card title="Shipping address">
      <address className="text-[13px] not-italic leading-relaxed text-ink-soft">
        <span className="font-medium text-ink">{a.fullName}</span>
        <br />
        {a.line1}
        {a.line2 && (
          <>
            <br />
            {a.line2}
          </>
        )}
        {cityLine && (
          <>
            <br />
            {cityLine}
          </>
        )}
        <br />
        {countryName(a.country)} <span className="text-ink-faint">({a.country})</span>
        {a.phone && (
          <>
            <br />
            <span className="text-ink-muted">{a.phone}</span>
          </>
        )}
      </address>
      <p className="mt-3 border-t border-sand-200 pt-3 text-xs text-ink-muted">
        {order.shippingMethod.label} · {order.shippingMethod.minDays}–{order.shippingMethod.maxDays} business days
      </p>
    </Card>
  );
}

function PaymentCard({ order }: { order: Order }) {
  const isCod = order.payment.method === 'cod';
  const money = (n: number) => formatWithCode(n, order.currency);
  const collected = wasPaid(order.payment.status) ? order.total - order.refundedTotal : 0;
  const outstanding = isCod && order.payment.status === 'unpaid' ? order.total : 0;
  return (
    <Card title="Payment" description={isCod ? 'Cash on Delivery — customer pays at delivery.' : undefined}>
      <DefinitionList
        items={[
          ['Status', <PaymentBadge status={order.payment.status} />],
          ['Method', PAYMENT_METHOD_LABEL[order.payment.method]],
          ['Reference', <span className="break-all font-mono text-xs">{order.payment.reference || '—'}</span>],
          ['Order total', <span className="num">{money(order.total)}</span>],
          ...(isCod
            ? ([
                ['Collected', <span className={cn('num', collected > 0 ? 'font-semibold text-emerald-700' : 'text-ink-muted')}>{money(collected)}</span>],
                ...(outstanding > 0 ? [['Outstanding', <span className="num font-semibold text-amber-700">{money(outstanding)}</span>] as [string, ReactNode]] : []),
              ] as Array<[string, ReactNode]>)
            : []),
          ...(order.refundedTotal > 0 ? [['Refunded', <span className="num">{money(order.refundedTotal)}</span>] as [string, ReactNode]] : []),
        ]}
      />
    </Card>
  );
}

function FulfilmentCard({ order, onEditTracking }: { order: Order; onEditTracking: () => void }) {
  const f = order.fulfilment;
  const shipped = f.status === 'shipped' || f.status === 'delivered';
  const url = f.trackingUrl && isHttpUrl(f.trackingUrl) ? f.trackingUrl : null;
  return (
    <Card
      title="Fulfilment"
      actions={
        shipped ? (
          <Button size="xs" variant="outline" icon={<Pencil className="h-3.5 w-3.5" aria-hidden />} onClick={onEditTracking}>
            Edit tracking
          </Button>
        ) : undefined
      }
    >
      <DefinitionList
        items={[
          ['Status', <FulfilmentBadge status={f.status} />],
          ...(f.carrier || f.trackingNumber
            ? ([
                ['Carrier', f.carrier ?? '—'],
                ['Tracking number', <span className="break-all font-mono text-xs">{f.trackingNumber ?? '—'}</span>],
                [
                  'Tracking link',
                  url ? (
                    <a href={url} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1">
                      Track parcel <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  ) : (
                    <span className="text-ink-faint">None</span>
                  ),
                ],
              ] as Array<[string, ReactNode]>)
            : []),
          ...(f.status === 'cancelled' ? ([['Returned to stock', f.restocked ? 'Yes' : 'No']] as Array<[string, ReactNode]>) : []),
        ]}
      />
      {!shipped && f.status !== 'cancelled' && <p className="mt-2 text-xs text-ink-muted">Tracking is added when you mark the order as shipped.</p>}
    </Card>
  );
}

function CurrencyCard({ order }: { order: Order }) {
  const r = order.rateSnapshot;
  const captured = formatDateTime(r.capturedAt);
  return (
    <Card title="Currency snapshot">
      <div className="space-y-2 text-[13px] text-ink-soft">
        {order.currency === 'USD' ? (
          <p>Charged in USD, the base currency — no conversion was applied (captured {captured} at checkout).</p>
        ) : (
          <p>
            <span className="num font-medium text-ink">
              1 USD = {formatRate(r.rate)} {r.currency}
            </span>
            , captured {captured} at checkout.
          </p>
        )}
        <p>Changing current currency settings does not affect this order.</p>
        {order.currency !== 'USD' && (
          <p className="text-xs text-ink-muted">
            Total ≈ <span className="num">USD {formatUsd(toUsd(order.total, r.rate))}</span> at the checkout rate (used for reports and sorting).
          </p>
        )}
      </div>
    </Card>
  );
}

function CodCollectionDialog({ open, order, onClose }: { open: boolean; order: Order; onClose: () => void }) {
  const money = (n: number) => formatWithCode(n, order.currency);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const now = new Date();
  const localNow = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [collector, setCollector] = useState('');
  const [collectedAt, setCollectedAt] = useState(localNow);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!collector.trim()) { setErr('Collector name is required.'); return; }
    setBusy(true); setErr(null);
    try {
      await orderService.recordCodCollection(order.id, {
        amount: order.total,
        collectedAt: new Date(collectedAt).toISOString(),
        collector: collector.trim(),
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
      });
      refreshSales();
      toast(`COD collection recorded for ${order.number}.`, 'success');
      onClose();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-1 text-lg font-semibold text-ink">Record COD Collection</h2>
        <p className="mb-4 text-sm text-ink-muted">Record payment collected from the customer at delivery.</p>
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <div>
            <p className="mb-1 block text-sm font-medium text-ink">Amount collected</p>
            <p className="num rounded-lg border border-sand-200 bg-sand-50 px-3 py-2 text-sm font-semibold text-ink">{money(order.total)}</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">
              Collection date &amp; time <span className="text-red-500" aria-hidden>*</span>
            </label>
            <input
              type="datetime-local"
              value={collectedAt}
              onChange={(e) => setCollectedAt(e.target.value)}
              className="w-full rounded-lg border border-sand-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">
              Collected by <span className="text-red-500" aria-hidden>*</span>
            </label>
            <input
              type="text"
              value={collector}
              onChange={(e) => setCollector(e.target.value)}
              placeholder="Delivery agent name or ID"
              className="w-full rounded-lg border border-sand-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">
              Reference <span className="text-xs text-ink-faint">(optional)</span>
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Receipt or transaction ID"
              className="w-full rounded-lg border border-sand-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">
              Note <span className="text-xs text-ink-faint">(optional)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Any additional notes"
              className="w-full resize-none rounded-lg border border-sand-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
            />
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-sand-300 px-4 py-2 text-sm font-medium hover:bg-sand-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? 'Recording…' : 'Record collection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      <Skeleton className="h-12 w-80 max-w-full" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Skeleton className="h-96" />
        <div className="space-y-5">
          <Skeleton className="h-32" />
          <Skeleton className="h-40" />
          <Skeleton className="h-32" />
        </div>
      </div>
    </div>
  );
}

export default function OrderDetailPage() {
  const { id = '' } = useParams();
  const { data: order, isLoading, error, refetch } = useQuery(id ? `order:${id}` : null, () => orderService.get(id));
  const notFound = error instanceof ApiError && error.code === 'not_found';
  usePageMeta(order ? `Order ${order.number}` : notFound ? 'Order not found' : 'Order', [{ label: 'Sales' }, { label: 'Orders', to: '/orders' }]);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [busy, setBusy] = useState<BusyKind>(null);

  if (notFound || !id) {
    return (
      <div className="card">
        <EmptyState
          icon={<PackageX className="h-6 w-6" aria-hidden />}
          title="Order not found"
          body="This order doesn’t exist, or the demo data was reset."
          action={
            <ButtonLink to="/orders" size="sm" icon={<ArrowLeft className="h-4 w-4" aria-hidden />}>
              Back to orders
            </ButtonLink>
          }
        />
      </div>
    );
  }
  if (error && !order) {
    return (
      <div className="card">
        <ErrorState error={error} onRetry={refetch} title="Couldn’t load this order" />
      </div>
    );
  }
  if (isLoading || !order) return <LoadingSkeleton />;

  const next = nextFulfilment(order)[0];
  const refundable = refundableAmount(order);
  const cancelBlock = checkCancel(order);
  const pay = order.payment.status;
  const ful = order.fulfilment.status;
  const open = ful === 'unfulfilled' || ful === 'processing';

  const advance = async (to: 'processing' | 'delivered') => {
    const ok = await confirmAction({
      title: to === 'processing' ? `Mark ${order.number} as processing?` : `Mark ${order.number} as delivered?`,
      body: (
        <>
          <p>{to === 'processing' ? 'Use this when you start preparing the items.' : 'Use this once the carrier confirms delivery.'}</p>
          <p className="mt-2">{NO_NOTIFY}</p>
        </>
      ),
      confirmLabel: to === 'processing' ? 'Mark as processing' : 'Mark as delivered',
    });
    if (!ok) return;
    setBusy(to);
    try {
      await orderService.advance(order.id, to);
      refreshSales();
      toast(`Order ${order.number} marked as ${to}.`, 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const markPaid = async () => {
    const ok = await confirmAction({
      title: `Mark ${order.number} as paid?`,
      body: (
        <>
          <p>Records the payment as received so the order can be fulfilled.</p>
          <p className="mt-2">{NO_NOTIFY}</p>
        </>
      ),
      confirmLabel: 'Mark as paid',
    });
    if (!ok) return;
    setBusy('paid');
    try {
      await orderService.markPaid(order.id);
      refreshSales();
      toast(`Order ${order.number} marked as paid.`, 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const actions: ReactNode[] = [];
  if (next === 'processing')
    actions.push(
      <Button key="next" icon={<PackageOpen className="h-4 w-4" aria-hidden />} loading={busy === 'processing'} disabled={!!busy} onClick={() => void advance('processing')}>
        Mark as processing
      </Button>,
    );
  if (next === 'shipped')
    actions.push(
      <Button key="next" icon={<Truck className="h-4 w-4" aria-hidden />} disabled={!!busy} onClick={() => setDialog('ship')}>
        Mark as shipped…
      </Button>,
    );
  if (next === 'delivered')
    actions.push(
      <Button key="next" icon={<PackageCheck className="h-4 w-4" aria-hidden />} loading={busy === 'delivered'} disabled={!!busy} onClick={() => void advance('delivered')}>
        Mark as delivered
      </Button>,
    );
  if (canRecordCodCollection(order))
    actions.push(
      <Button key="cod" variant="outline" icon={<Wallet className="h-4 w-4" aria-hidden />} disabled={!!busy} onClick={() => setDialog('cod-collection')}>
        Record COD collection…
      </Button>,
    );
  if (canMarkPaid(order))
    actions.push(
      <Button key="paid" variant="outline" icon={<Banknote className="h-4 w-4" aria-hidden />} loading={busy === 'paid'} disabled={!!busy} onClick={() => void markPaid()}>
        Mark as paid
      </Button>,
    );
  if (refundable > 0)
    actions.push(
      <Button key="refund" variant="outline" icon={<Undo2 className="h-4 w-4" aria-hidden />} disabled={!!busy} onClick={() => setDialog('refund')}>
        Refund (simulated)…
      </Button>,
    );
  if (cancelBlock === null)
    actions.push(
      <Button key="cancel" variant="dangerOutline" icon={<Ban className="h-4 w-4" aria-hidden />} disabled={!!busy} onClick={() => setDialog('cancel')}>
        Cancel order…
      </Button>,
    );

  return (
    <>
      <PageHeader
        description={
          <div className="space-y-2">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-[15px] font-semibold text-ink">{order.number}</span>
              <span>
                Placed <time dateTime={order.createdAt}>{formatDateTime(order.createdAt)}</time> · {pluralize(itemCount(order), 'item')} ·{' '}
                <span className="num font-medium text-ink">{formatWithCode(order.total, order.currency)}</span>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="sr-only">Payment status:</span>
              <PaymentBadge status={pay} />
              <span className="sr-only">Fulfilment status:</span>
              <FulfilmentBadge status={ful} />
            </div>
          </div>
        }
        actions={actions.length ? actions : undefined}
      />

      <div className="mb-5 space-y-2">
        {open && pay === 'unpaid' && order.payment.method !== 'cod' && (
          <Notice tone="warning" title="Fulfilment is available once payment is received.">
            This order is awaiting payment. If payment was confirmed outside the system, use "Mark as paid".
          </Notice>
        )}
        {open && pay === 'unpaid' && order.payment.method === 'cod' && (
          <Notice tone="info" title="Cash on Delivery — payment collected at delivery.">
            Fulfilment can proceed normally. Use "Record COD collection" once the customer pays on delivery.
          </Notice>
        )}
        {open && pay === 'failed' && (
          <Notice tone="warning" title="Payment failed — fulfilment is blocked.">
            Fulfilment is available once payment is received. The customer needs to place a new order; you can cancel this one to close it.
          </Notice>
        )}
        {open && pay === 'refunded' && (
          <Notice tone="warning" title="Fully refunded — fulfilment is blocked.">
            Nothing is left to ship against. Cancel the order to close it out.
          </Notice>
        )}
        {ful === 'cancelled' && (
          <Notice tone="info" title="This order is cancelled.">
            {order.fulfilment.restocked ? 'Items were returned to stock.' : 'Items were not returned to stock.'}
            {refundable > 0 && ' Part of the payment has not been refunded yet.'}
          </Notice>
        )}
        {(ful === 'shipped' || ful === 'delivered') && cancelBlock && <p className="text-xs text-ink-muted">{cancelBlock}</p>}
        <Notice tone="demo">Status changes here don’t notify the customer (email/SMS not configured). The storefront is a separate app and requires a page refresh to reflect changes.</Notice>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_1fr]">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <ItemsCard order={order} />
        </div>
        <div className="min-w-0 space-y-5 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <CustomerCard order={order} />
          <AddressCard order={order} />
          <PaymentCard order={order} />
          <FulfilmentCard order={order} onEditTracking={() => setDialog('tracking')} />
          <CurrencyCard order={order} />
        </div>
        <div className="min-w-0 space-y-5 lg:col-start-1 lg:row-start-2 lg:self-start">
          <TimelineCard order={order} />
          <NotesCard order={order} />
        </div>
      </div>

      <TrackingDialog open={dialog === 'ship' || dialog === 'tracking'} mode={dialog === 'ship' ? 'ship' : 'edit'} order={order} onClose={() => setDialog(null)} />
      <CancelOrderDialog open={dialog === 'cancel'} order={order} onClose={() => setDialog(null)} />
      <RefundDialog open={dialog === 'refund'} order={order} onClose={() => setDialog(null)} />
      <CodCollectionDialog open={dialog === 'cod-collection'} order={order} onClose={() => setDialog(null)} />
    </>
  );
}
