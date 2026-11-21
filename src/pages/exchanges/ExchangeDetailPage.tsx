import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Card, PageHeader } from '@/components/ui/Page';
import { usePageMeta } from '@/hooks/misc';
import { useQuery, invalidate } from '@/hooks/useQuery';
import { errorMessage } from '@/services/api';
import { confirmAction, toast } from '@/store';
import {
  approveExchange, closeExchange, deliverExchange, fetchExchange, rejectExchange, shipExchange,
  type AdminExchange,
} from '@/api/exchanges';
import { formatDateTime } from '@/utils/dates';
import { formatWithCode } from '@/utils/money';
import { cn } from '@/utils/misc';

/** M-O10: exchange detail page — approve/reject, record the replacement shipment,
 *  mark delivery and close, following the Returns detail page pattern. */

const STATUS_LABELS: Record<string, string> = {
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

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">{label}</p>
      <p className="mt-0.5 text-sm text-ink">{value ?? '—'}</p>
    </div>
  );
}

function ApprovePanel({ ex, onDone }: { ex: AdminExchange; onDone: () => void }) {
  const [approvedQty, setApprovedQty] = useState(String(ex.requestedQty));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    const qty = Number(approvedQty);
    if (!Number.isInteger(qty) || qty < 1 || qty > ex.requestedQty) {
      setErr(`Approved quantity must be between 1 and ${ex.requestedQty}.`);
      return;
    }
    setBusy(true); setErr('');
    try {
      await approveExchange(ex.id, { approvedQty: qty, note: note || undefined });
      toast('Exchange approved.', 'success');
      onDone();
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-ink">Approve exchange</h4>
      <p className="text-xs text-ink-muted">
        Approving checks replacement stock and reserves it. The customer is then sent the replacement.
      </p>
      <div>
        <label className="label">Approved quantity (of {ex.requestedQty})</label>
        <input type="number" min={1} max={ex.requestedQty} value={approvedQty} onChange={(e) => setApprovedQty(e.target.value)} className="input w-full" />
      </div>
      <div>
        <label className="label">Note (visible to customer)</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="input w-full" placeholder="Optional instructions…" />
      </div>
      {err && <p className="text-xs text-red-700">{err}</p>}
      <Button size="sm" onClick={submit} loading={busy}>Approve</Button>
    </div>
  );
}

function RejectPanel({ ex, onDone }: { ex: AdminExchange; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!reason.trim()) { setErr('Reason required.'); return; }
    setBusy(true); setErr('');
    try {
      await rejectExchange(ex.id, { reason });
      toast('Exchange rejected.', 'success');
      onDone();
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3 mt-4 pt-4 border-t border-sand-200">
      <h4 className="text-sm font-semibold text-red-700">Reject exchange</h4>
      <div>
        <label className="label">Reason (shown to customer)</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="input w-full" placeholder="Explain why the exchange cannot be accepted…" />
      </div>
      {err && <p className="text-xs text-red-700">{err}</p>}
      <Button size="sm" variant="outline" onClick={submit} loading={busy} className="border-red-300 text-red-700 hover:bg-red-50">Reject</Button>
    </div>
  );
}

function ShipPanel({ ex, onDone }: { ex: AdminExchange; onDone: () => void }) {
  const [carrier, setCarrier] = useState('');
  const [tracking, setTracking] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!carrier.trim() || !tracking.trim()) { setErr('Carrier and tracking number are both required.'); return; }
    setBusy(true); setErr('');
    try {
      await shipExchange(ex.id, { carrier: carrier.trim(), tracking: tracking.trim() });
      toast('Replacement shipped.', 'success');
      onDone();
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-ink">Ship replacement</h4>
      <p className="text-xs text-ink-muted">
        Shipping deducts the replacement from stock. If stock is gone, this fails — reject or wait for a restock.
      </p>
      <div>
        <label className="label">Carrier</label>
        <input type="text" value={carrier} onChange={(e) => setCarrier(e.target.value)} className="input w-full" placeholder="e.g. Delhivery" />
      </div>
      <div>
        <label className="label">Tracking number</label>
        <input type="text" value={tracking} onChange={(e) => setTracking(e.target.value)} className="input w-full" />
      </div>
      {err && <p className="text-xs text-red-700">{err}</p>}
      <Button size="sm" onClick={submit} loading={busy}>Mark as shipped</Button>
    </div>
  );
}

export default function ExchangeDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  usePageMeta('Exchange Detail', [{ label: 'Sales' }, { label: 'Exchanges', to: '/exchanges' }]);
  const { data: ex, isLoading, error, refetch } = useQuery<AdminExchange>(`exchange:${id}`, () => fetchExchange(id));
  const [busy, setBusy] = useState(false);

  const done = () => {
    invalidate(`exchange:${id}`, 'exchanges:list:');
    refetch();
  };

  const runAction = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      toast(label, 'success');
      done();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (error || !ex) {
    return <ErrorState error={error ?? new Error('Exchange not found.')} onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-6">
      <Link to="/exchanges" className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Back to Exchanges
      </Link>

      <PageHeader
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{ex.reference}</span>
            <StatusBadge status={ex.status} />
          </span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Order" value={<Link to={`/orders/${ex.orderId}`} className="font-mono text-brand-700 hover:underline">{ex.orderId}</Link>} />
              <Field label="Reason" value={REASON_LABELS[ex.reason] ?? ex.reason} />
              <Field label="Requested quantity" value={ex.requestedQty} />
              <Field label="Approved quantity" value={ex.approvedQty ?? 'Not decided yet'} />
              <Field label="Price difference" value={`${formatWithCode(ex.priceDifference, 'USD')} (positive = customer owes more)`} />
              <Field label="Exchange window" value={`${ex.exchangeWindowDays} days`} />
              <Field label="Original variant" value={<span className="font-mono text-xs">{ex.originalVariantId}</span>} />
              <Field label="Replacement variant" value={<span className="font-mono text-xs">{ex.replacementVariantId}</span>} />
              <Field label="Requested" value={formatDateTime(ex.requestedAt)} />
              <Field label="Decided" value={ex.decidedAt ? formatDateTime(ex.decidedAt) : '—'} />
              <Field label="Shipped" value={ex.shippedAt ? formatDateTime(ex.shippedAt) : '—'} />
              <Field label="Delivered" value={ex.deliveredAt ? formatDateTime(ex.deliveredAt) : '—'} />
            </div>
            {ex.customerNote && (
              <div>
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Customer note</p>
                <p className="mt-0.5 text-sm text-ink">{ex.customerNote}</p>
              </div>
            )}
            {ex.replacementCarrier && (
              <div>
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Replacement shipment</p>
                <p className="mt-0.5 text-sm text-ink">{ex.replacementCarrier} · <span className="font-mono">{ex.replacementTracking}</span></p>
              </div>
            )}
            {ex.rejectionReason && (
              <div>
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Rejection reason</p>
                <p className="mt-0.5 text-sm text-ink">{ex.rejectionReason}</p>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="space-y-4 p-5">
            {ex.status === 'requested' && (
              <>
                <ApprovePanel ex={ex} onDone={done} />
                <RejectPanel ex={ex} onDone={done} />
              </>
            )}
            {ex.status === 'approved' && (
              <>
                <ShipPanel ex={ex} onDone={done} />
                <div className="pt-4 border-t border-sand-200">
                  <Button
                    size="sm" variant="outline"
                    disabled={busy}
                    onClick={async () => {
                      const ok = await confirmAction({
                        title: 'Close exchange?',
                        body: 'This closes the exchange without shipping a replacement.',
                        confirmLabel: 'Close exchange',
                        tone: 'danger',
                      });
                      if (ok) void runAction('Exchange closed.', () => closeExchange(ex.id));
                    }}
                  >
                    Close without shipping
                  </Button>
                </div>
              </>
            )}
            {ex.status === 'shipped' && (
              <Button
                size="sm"
                disabled={busy}
                onClick={async () => {
                  const ok = await confirmAction({
                    title: 'Mark replacement delivered?',
                    body: 'This marks the replacement as delivered to the customer.',
                    confirmLabel: 'Mark delivered',
                  });
                  if (ok) void runAction('Replacement marked delivered.', () => deliverExchange(ex.id));
                }}
              >
                Mark delivered
              </Button>
            )}
            {ex.status === 'delivered' && (
              <Button
                size="sm" variant="outline"
                disabled={busy}
                onClick={async () => {
                  const ok = await confirmAction({
                    title: 'Close exchange?',
                    body: 'This closes the exchange as complete.',
                    confirmLabel: 'Close exchange',
                  });
                  if (ok) void runAction('Exchange closed.', () => closeExchange(ex.id));
                }}
              >
                Close exchange
              </Button>
            )}
            {(ex.status === 'closed' || ex.status === 'rejected') && (
              <p className="text-sm text-ink-muted">This exchange is {STATUS_LABELS[ex.status]?.toLowerCase() ?? ex.status}. No further actions are available.</p>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <div className="p-5">
          <h3 className="text-sm font-semibold text-ink mb-3">Timeline</h3>
          {ex.events.length === 0 ? (
            <EmptyState icon={<RefreshCw className="h-6 w-6" aria-hidden />} title="No events yet" />
          ) : (
            <ul className="space-y-3">
              {ex.events.map((e) => (
                <li key={e.id} className="flex gap-3 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-400" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-ink">{e.message}</p>
                    <p className="text-xs text-ink-muted">
                      {e.actor} · {formatDateTime(e.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
