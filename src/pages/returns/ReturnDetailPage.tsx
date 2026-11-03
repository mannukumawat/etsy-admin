import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ErrorState, Notice, Spinner } from '@/components/ui/Feedback';
import { Card } from '@/components/ui/Page';
import { usePageMeta } from '@/hooks/misc';
import { useQuery, invalidate } from '@/hooks/useQuery';
import { errorMessage } from '@/services/api';
import { toast } from '@/store';
import { formatDateTime } from '@/utils/dates';
import { cn } from '@/utils/misc';
import {
  fetchReturn,
  approveReturn,
  rejectReturn,
  arrangePickup,
  confirmShipping,
  receiveReturn,
  inspectReturn,
  processRefund,
  addReturnNote,
  type AdminReturn,
} from '@/api/returns';

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

const STATUS_LABELS: Record<string, string> = {
  requested: 'Requested', approved: 'Approved', rejected: 'Rejected',
  shipping_arranged: 'Pickup arranged', in_transit: 'In transit', received: 'Received',
  inspected: 'Inspected', refunded: 'Refunded', withdrawn: 'Withdrawn', closed: 'Closed',
};

const REASON_LABELS: Record<string, string> = {
  damaged: 'Damaged', wrong_item: 'Wrong item', not_as_described: 'Not as described',
  changed_mind: 'Changed mind', quality_issue: 'Quality issue', other: 'Other',
};

const STEPS = ['requested', 'approved', 'shipping_arranged', 'in_transit', 'received', 'inspected', 'refunded'];

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

function ApprovePanel({ ret, onDone }: { ret: AdminReturn; onDone: () => void }) {
  const [approvedQty, setApprovedQty] = useState(String(ret.requestedQty));
  const [shippingFee, setShippingFee] = useState('0');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setBusy(true); setErr('');
    try {
      await approveReturn(ret.id, { approvedQty: Number(approvedQty), shippingFee: Number(shippingFee) || 0, note: note || undefined });
      toast('Return approved.', 'success');
      onDone();
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-ink">Approve return</h4>
      <div>
        <label className="label">Approved quantity (of {ret.requestedQty})</label>
        <input type="number" min={1} max={ret.requestedQty} value={approvedQty} onChange={(e) => setApprovedQty(e.target.value)} className="input w-full" />
      </div>
      <div>
        <label className="label">Return shipping fee (minor units, 0 = store pays)</label>
        <input type="number" min={0} value={shippingFee} onChange={(e) => setShippingFee(e.target.value)} className="input w-full" />
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

function RejectPanel({ ret, onDone }: { ret: AdminReturn; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!reason.trim()) { setErr('Reason required.'); return; }
    setBusy(true); setErr('');
    try {
      await rejectReturn(ret.id, { reason });
      toast('Return rejected.', 'success');
      onDone();
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3 mt-4 pt-4 border-t border-sand-200">
      <h4 className="text-sm font-semibold text-red-700">Reject return</h4>
      <div>
        <label className="label">Reason (shown to customer)</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="input w-full" placeholder="Explain why the return cannot be accepted…" />
      </div>
      {err && <p className="text-xs text-red-700">{err}</p>}
      <Button size="sm" variant="outline" onClick={submit} loading={busy} className="border-red-300 text-red-700 hover:bg-red-50">Reject</Button>
    </div>
  );
}

function PickupPanel({ ret, onDone }: { ret: AdminReturn; onDone: () => void }) {
  const [pickupAddress, setPickupAddress] = useState('');
  const [carrier, setCarrier] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!pickupAddress.trim()) { setErr('Pickup address required.'); return; }
    setBusy(true); setErr('');
    try {
      await arrangePickup(ret.id, { pickupAddress, carrier: carrier || undefined, note: note || undefined });
      toast('Pickup arranged.', 'success');
      onDone();
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-ink">Arrange pickup</h4>
      <div>
        <label className="label">Pickup address</label>
        <textarea value={pickupAddress} onChange={(e) => setPickupAddress(e.target.value)} rows={3} className="input w-full" placeholder="Address where item will be collected…" />
      </div>
      <div>
        <label className="label">Carrier (optional)</label>
        <input type="text" value={carrier} onChange={(e) => setCarrier(e.target.value)} className="input w-full" placeholder="e.g. Delhivery" />
      </div>
      <div>
        <label className="label">Customer note (optional)</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="input w-full" />
      </div>
      {err && <p className="text-xs text-red-700">{err}</p>}
      <Button size="sm" onClick={submit} loading={busy}>Arrange pickup</Button>
    </div>
  );
}

function ShippingPanel({ ret, onDone }: { ret: AdminReturn; onDone: () => void }) {
  const [carrier, setCarrier] = useState('');
  const [tracking, setTracking] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!carrier.trim() || !tracking.trim()) { setErr('Carrier and tracking required.'); return; }
    setBusy(true); setErr('');
    try {
      await confirmShipping(ret.id, { carrier, tracking });
      toast('Self-ship confirmed.', 'success');
      onDone();
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3 mt-4 pt-4 border-t border-sand-200">
      <h4 className="text-sm font-semibold text-ink">Confirm self-ship tracking</h4>
      <div>
        <label className="label">Carrier</label>
        <input type="text" value={carrier} onChange={(e) => setCarrier(e.target.value)} className="input w-full" placeholder="e.g. India Post" />
      </div>
      <div>
        <label className="label">Tracking number</label>
        <input type="text" value={tracking} onChange={(e) => setTracking(e.target.value)} className="input w-full" />
      </div>
      {err && <p className="text-xs text-red-700">{err}</p>}
      <Button size="sm" onClick={submit} loading={busy}>Confirm shipping</Button>
    </div>
  );
}

function ReceivePanel({ ret, onDone }: { ret: AdminReturn; onDone: () => void }) {
  const [receivedQty, setReceivedQty] = useState(String(ret.approvedQty ?? ret.requestedQty));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setBusy(true); setErr('');
    try {
      await receiveReturn(ret.id, { receivedQty: Number(receivedQty), note: note || undefined });
      toast('Receipt recorded.', 'success');
      onDone();
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-ink">Record receipt</h4>
      <div>
        <label className="label">Received quantity</label>
        <input type="number" min={0} max={ret.approvedQty ?? ret.requestedQty} value={receivedQty} onChange={(e) => setReceivedQty(e.target.value)} className="input w-full" />
      </div>
      <div>
        <label className="label">Note (optional)</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="input w-full" />
      </div>
      {err && <p className="text-xs text-red-700">{err}</p>}
      <Button size="sm" onClick={submit} loading={busy}>Record receipt</Button>
    </div>
  );
}

function InspectPanel({ ret, onDone }: { ret: AdminReturn; onDone: () => void }) {
  const max = ret.receivedQty ?? 0;
  const [acceptedQty, setAcceptedQty] = useState(String(max));
  const [rejectedQty, setRejectedQty] = useState('0');
  const [restockAccepted, setRestockAccepted] = useState(true);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    const a = Number(acceptedQty); const r = Number(rejectedQty);
    if (a + r > max) { setErr(`Accepted + rejected cannot exceed received qty (${max}).`); return; }
    setBusy(true); setErr('');
    try {
      await inspectReturn(ret.id, { acceptedQty: a, rejectedQty: r, restockAccepted, note: note || undefined });
      toast('Inspection recorded.', 'success');
      onDone();
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-ink">Record inspection (received: {max})</h4>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Accepted qty</label>
          <input type="number" min={0} max={max} value={acceptedQty} onChange={(e) => setAcceptedQty(e.target.value)} className="input w-full" />
        </div>
        <div>
          <label className="label">Rejected qty</label>
          <input type="number" min={0} max={max} value={rejectedQty} onChange={(e) => setRejectedQty(e.target.value)} className="input w-full" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={restockAccepted} onChange={(e) => setRestockAccepted(e.target.checked)} className="h-4 w-4 accent-brand-600" />
        Restock accepted items
      </label>
      <div>
        <label className="label">Inspector notes</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="input w-full" />
      </div>
      {err && <p className="text-xs text-red-700">{err}</p>}
      <Button size="sm" onClick={submit} loading={busy}>Record inspection</Button>
    </div>
  );
}

function RefundPanel({ ret, onDone }: { ret: AdminReturn; onDone: () => void }) {
  const [amount, setAmount] = useState(String(ret.refundableAmount));
  const [method, setMethod] = useState('original');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setBusy(true); setErr('');
    try {
      await processRefund(ret.id, { amount: Number(amount), method, reference: reference || undefined, note: note || undefined });
      toast('Refund recorded.', 'success');
      onDone();
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-ink">Process refund</h4>
      <div>
        <label className="label">Amount (minor units, max {ret.refundableAmount})</label>
        <input type="number" min={1} max={ret.refundableAmount} value={amount} onChange={(e) => setAmount(e.target.value)} className="input w-full" />
      </div>
      <div>
        <label className="label">Method</label>
        <select value={method} onChange={(e) => setMethod(e.target.value)} className="input w-full">
          <option value="original">Original payment method</option>
          <option value="manual_bank">Manual bank transfer</option>
          <option value="manual_upi">Manual UPI</option>
          <option value="store_credit">Store credit</option>
        </select>
      </div>
      {(method === 'manual_bank' || method === 'manual_upi') && (
        <div>
          <label className="label">Reference / UTR number</label>
          <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} className="input w-full" />
        </div>
      )}
      <div>
        <label className="label">Internal note</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="input w-full" />
      </div>
      {err && <p className="text-xs text-red-700">{err}</p>}
      <Button size="sm" onClick={submit} loading={busy}>Record refund</Button>
    </div>
  );
}

function ActionPanel({ ret, onDone }: { ret: AdminReturn; onDone: () => void }) {
  const s = ret.status;

  if (s === 'requested') {
    return (
      <Card title="Actions">
        <ApprovePanel ret={ret} onDone={onDone} />
        <RejectPanel ret={ret} onDone={onDone} />
      </Card>
    );
  }
  if (s === 'approved') {
    return (
      <Card title="Actions">
        <PickupPanel ret={ret} onDone={onDone} />
        <ShippingPanel ret={ret} onDone={onDone} />
      </Card>
    );
  }
  if (s === 'shipping_arranged' || s === 'in_transit') {
    return <Card title="Actions"><ReceivePanel ret={ret} onDone={onDone} /></Card>;
  }
  if (s === 'received') {
    return <Card title="Actions"><InspectPanel ret={ret} onDone={onDone} /></Card>;
  }
  if (s === 'inspected') {
    return <Card title="Actions"><RefundPanel ret={ret} onDone={onDone} /></Card>;
  }
  return null;
}

function NotePanel({ ret, onDone }: { ret: AdminReturn; onDone: () => void }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!body.trim()) return;
    setBusy(true); setErr('');
    try {
      await addReturnNote(ret.id, { body });
      setBody('');
      onDone();
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  };

  const notes = ret.events.filter((e) => e.type === 'note' && e.actor === 'admin');

  return (
    <Card title="Internal notes">
      {notes.length > 0 && (
        <ul className="mb-3 space-y-2 text-sm">
          {notes.map((n) => (
            <li key={n.id} className="rounded-lg bg-sand-50 border border-sand-200 px-3 py-2">
              <p className="text-ink">{n.message}</p>
              <p className="mt-1 text-xs text-ink-muted">{formatDateTime(n.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-2">
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} className="input w-full text-sm" placeholder="Add internal note…" />
        {err && <p className="text-xs text-red-700">{err}</p>}
        <Button size="sm" variant="outline" onClick={submit} loading={busy} disabled={!body.trim()}>Add note</Button>
      </div>
    </Card>
  );
}

export default function ReturnDetailPage() {
  const { id = '' } = useParams();
  usePageMeta('Return', [{ label: 'Sales' }, { label: 'Returns', to: '/returns' }]);

  const { data: ret, isLoading, error, refetch } = useQuery(`return:${id}`, () => fetchReturn(id));

  const reload = () => {
    invalidate(`return:${id}`, 'returns:list:');
    refetch();
  };

  if (isLoading) return <Spinner />;
  if (error || !ret) return <ErrorState onRetry={refetch} />;

  const reachedStep = STEPS.indexOf(ret.status);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Link to="/returns" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Returns
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-3xl font-mono">{ret.reference}</h2>
        <StatusBadge status={ret.status} />
        {ret.status === 'rejected' && <span className="text-sm text-red-700">{ret.rejectionReason}</span>}
      </div>

      {/* Status stepper */}
      {ret.status !== 'rejected' && ret.status !== 'withdrawn' && (
        <div className="flex flex-wrap items-center gap-1 text-xs">
          {STEPS.map((step, i) => (
            <span key={step} className="flex items-center gap-1">
              <span className={cn('rounded-full px-2.5 py-0.5 font-medium border', i <= reachedStep ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-sand-100 border-sand-200 text-ink-muted')}>
                {STATUS_LABELS[step] ?? step}
              </span>
              {i < STEPS.length - 1 && <span className="text-ink-faint">→</span>}
            </span>
          ))}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        {/* Left: evidence + info */}
        <div className="space-y-5">
          <Card title="Return details">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Reason" value={REASON_LABELS[ret.reason] ?? ret.reason} />
              <Field label="Requested qty" value={ret.requestedQty} />
              {ret.approvedQty != null && <Field label="Approved qty" value={ret.approvedQty} />}
              {ret.receivedQty != null && <Field label="Received qty" value={ret.receivedQty} />}
              {ret.acceptedQty != null && <Field label="Accepted qty" value={ret.acceptedQty} />}
              {ret.restockQty != null && <Field label="Restocked qty" value={ret.restockQty} />}
              <Field label="Return window" value={`${ret.returnWindowDays} days`} />
              <Field label="Refundable amount" value={`${ret.refundableAmount} (minor units)`} />
              {ret.shippingFee > 0 && <Field label="Return shipping fee" value={`${ret.shippingFee} (minor units)`} />}
            </div>
            {ret.customerNote && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1">Customer note</p>
                <p className="text-sm text-ink rounded-lg bg-sand-50 border border-sand-200 px-3 py-2">{ret.customerNote}</p>
              </div>
            )}
            {ret.adminNote && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1">Admin note (visible to customer)</p>
                <p className="text-sm text-ink rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">{ret.adminNote}</p>
              </div>
            )}
            {ret.photos.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">Customer photos</p>
                <div className="flex flex-wrap gap-2">
                  {ret.photos.map((photoId) => (
                    <a key={photoId} href={`/media/${photoId}`} target="_blank" rel="noopener noreferrer" className="h-16 w-16 rounded-lg border border-sand-200 overflow-hidden block hover:border-brand-400">
                      <img src={`/media/${photoId}`} alt="Return photo" className="h-full w-full object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Shipping info */}
          {(ret.shippingMethod || ret.customerCarrier || ret.returnCarrier) && (
            <Card title="Shipping">
              <div className="grid gap-4 sm:grid-cols-2">
                {ret.shippingMethod && <Field label="Method" value={ret.shippingMethod === 'self_ship' ? 'Customer self-ships' : 'Store pickup'} />}
                {ret.customerCarrier && <Field label="Customer carrier" value={ret.customerCarrier} />}
                {ret.customerTracking && <Field label="Customer tracking" value={<span className="font-mono">{ret.customerTracking}</span>} />}
                {ret.returnCarrier && <Field label="Return carrier" value={ret.returnCarrier} />}
                {ret.returnTracking && <Field label="Return tracking" value={<span className="font-mono">{ret.returnTracking}</span>} />}
                {ret.pickupAddress && <Field label="Pickup address" value={ret.pickupAddress} />}
              </div>
            </Card>
          )}

          {/* Refund info */}
          {ret.refund && (
            <Card title="Refund">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Amount" value={`${ret.refund.amount} (minor units)`} />
                <Field label="Method" value={ret.refund.method} />
                <Field label="Status" value={ret.refund.status} />
                {ret.refund.reference && <Field label="Reference / UTR" value={<span className="font-mono">{ret.refund.reference}</span>} />}
                {ret.refund.recordedBy && <Field label="Recorded by" value={ret.refund.recordedBy} />}
                {ret.refund.completedAt && <Field label="Completed" value={formatDateTime(ret.refund.completedAt)} />}
                {ret.refund.failedAt && <Field label="Failed" value={formatDateTime(ret.refund.failedAt)} />}
                {ret.refund.note && <Field label="Notes" value={ret.refund.note} />}
              </div>
              {ret.refund.method.startsWith('manual_') && ret.refund.status === 'completed' && (
                <Notice tone="info" className="mt-3">
                  Manually recorded — not verified by a payment provider.
                </Notice>
              )}
            </Card>
          )}

          {/* Audit timeline */}
          <Card title="Timeline">
            {ret.events.length === 0 ? (
              <p className="text-sm text-ink-muted">No events.</p>
            ) : (
              <ol className="space-y-3">
                {ret.events.map((ev) => (
                  <li key={ev.id} className="flex gap-3 text-sm">
                    <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-sand-300" aria-hidden />
                    <div>
                      <p className="font-medium text-ink">{ev.type}</p>
                      {ev.message && <p className="text-ink-soft">{ev.message}</p>}
                      <p className="text-xs text-ink-muted">{ev.actor} · {formatDateTime(ev.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        {/* Right: action panel + notes */}
        <div className="space-y-5">
          <ActionPanel ret={ret} onDone={reload} />
          <NotePanel ret={ret} onDone={reload} />
        </div>
      </div>
    </div>
  );
}
