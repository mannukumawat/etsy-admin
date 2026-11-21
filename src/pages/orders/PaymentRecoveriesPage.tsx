import { useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { listPaymentRecoveries, resolvePaymentRecovery, type PaymentRecovery, type PaymentRecoveryStatus } from '@/api/paymentRecoveries';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Dialog';
import { Badge, EmptyState, ErrorState, Notice, Skeleton } from '@/components/ui/Feedback';
import { TextareaField } from '@/components/ui/Form';
import { PageHeader } from '@/components/ui/Page';
import { usePageMeta } from '@/hooks/misc';
import { invalidate, useQuery } from '@/hooks/useQuery';
import { errorMessage } from '@/services/api';
import { toast } from '@/store';
import { formatDateTime } from '@/utils/dates';
import { formatWithCode } from '@/utils/money';
import { cn } from '@/utils/misc';

/**
 * H5: payments the order webhook captured but could not match to an order or a wallet
 * top-up. Money was taken, but no order exists — these need a human to decide what
 * happened (refund through the payment provider, or create the order manually) and
 * record how it was resolved. The webhook itself never invents an order.
 */
export default function PaymentRecoveriesPage() {
  usePageMeta('Payment recoveries', [{ label: 'Sales' }, { label: 'Orders', to: '/orders' }]);
  const [status, setStatus] = useState<'all' | PaymentRecoveryStatus>('all');
  const [resolving, setResolving] = useState<PaymentRecovery | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const { data, isLoading, error, refetch } = useQuery(
    `payment-recoveries:${status}`,
    () => listPaymentRecoveries(status === 'all' ? undefined : status),
  );

  const submitResolve = async () => {
    if (!resolving || note.trim().length < 3) return;
    setBusy(true);
    try {
      await resolvePaymentRecovery(resolving.id, note.trim());
      invalidate('payment-recoveries');
      toast('Recovery marked as resolved.', 'success');
      setResolving(null);
      setNote('');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error) return <ErrorState error={error} onRetry={refetch} title="Couldn’t load payment recoveries" />;

  const rows = data ?? [];
  const unmatched = rows.filter((r) => r.status === 'unmatched').length;

  return (
    <div className="space-y-5">
      <PageHeader
        description="Payments captured by Razorpay that could not be matched to an order or a wallet top-up. Money was taken, but no order was created — check each one, refund or fulfil it through the payment provider, then record how it was resolved."
      />
      {unmatched > 0 && (
        <Notice tone="warning" title={`${unmatched} payment${unmatched === 1 ? '' : 's'} need${unmatched === 1 ? 's' : ''} a decision.`}>
          These shoppers paid but have no order. Refund them in the payment provider, or create their order manually — then mark the recovery resolved with a note.
        </Notice>
      )}

      <div className="flex gap-1 rounded-lg border border-sand-200 bg-sand-50 p-1 w-fit" role="tablist" aria-label="Filter by status">
        {(['all', 'unmatched', 'resolved'] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={status === s}
            onClick={() => setStatus(s)}
            className={cn(
              'rounded px-3 py-1.5 text-sm font-medium capitalize transition',
              status === s ? 'bg-white text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
            )}
          >
            {s === 'all' ? 'All' : s}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-8 w-8" />}
          title="No payment recoveries"
          body={status === 'unmatched' ? 'Every captured payment matched an order or a wallet top-up.' : 'Nothing recorded yet.'}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-sand-200 bg-white">
          <table className="min-w-full divide-y divide-sand-100 text-sm">
            <thead className="bg-sand-50">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-ink-muted">Payment</th>
                <th className="px-4 py-2.5 text-left font-medium text-ink-muted">Amount</th>
                <th className="px-4 py-2.5 text-left font-medium text-ink-muted">Customer</th>
                <th className="px-4 py-2.5 text-left font-medium text-ink-muted">Captured</th>
                <th className="px-4 py-2.5 text-left font-medium text-ink-muted">Status</th>
                <th className="px-4 py-2.5 text-right font-medium text-ink-muted">Resolution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5">
                    <p className="font-mono text-xs text-ink">{r.razorpayPaymentId}</p>
                    {r.razorpayOrderId && <p className="font-mono text-xs text-ink-muted">{r.razorpayOrderId}</p>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-medium text-ink">{formatWithCode(r.amount, r.currency)}</td>
                  <td className="px-4 py-2.5 text-ink-soft">{r.customerEmail ?? '—'}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink-muted">{formatDateTime(r.createdAt)}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={r.status === 'unmatched' ? 'warning' : 'success'}>{r.status}</Badge>
                    {r.resolutionNote && <p className="mt-1 max-w-xs text-xs text-ink-muted">{r.resolutionNote}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {r.status === 'unmatched' && (
                      <Button size="sm" variant="outline" onClick={() => { setResolving(r); setNote(''); }}>
                        Resolve…
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={!!resolving}
        onClose={() => setResolving(null)}
        title="Mark recovery as resolved"
        description="Record what you did with this payment — refunded, order created manually, or duplicate payment returned."
        footer={
          <>
            <Button variant="outline" onClick={() => setResolving(null)}>Cancel</Button>
            <Button onClick={() => void submitResolve()} loading={busy} disabled={note.trim().length < 3}>
              Mark resolved
            </Button>
          </>
        }
      >
        {resolving && (
          <div className="space-y-3">
            <p className="text-sm text-ink">
              <span className="font-mono text-xs">{resolving.razorpayPaymentId}</span> · {formatWithCode(resolving.amount, resolving.currency)}
            </p>
            <TextareaField
              label="What happened"
              required
              rows={3}
              maxLength={500}
              hint="At least 3 characters. This note is kept with the record."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        )}
      </Modal>

      <Notice tone="info" title="Why a payment lands here">
        The order webhook only records a payment when it cannot find a matching order or wallet top-up. It never creates an order on its own — the checkout details (cart, address, totals) are not in the webhook payload, so a person has to reconcile it. If recoveries keep appearing, the checkout or webhook setup needs attention.
      </Notice>
      <p className="flex items-start gap-2 text-xs text-ink-muted">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Resolving a record only closes it here — refunds themselves happen in the Razorpay dashboard (or through the order's refund flow once an order exists).
      </p>
    </div>
  );
}
