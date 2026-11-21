import { useId, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Dialog';
import { Notice } from '@/components/ui/Feedback';
import { TextareaField, TextField } from '@/components/ui/Form';
import { DefinitionList } from '@/components/ui/Page';
import { PaymentBadge } from '@/components/ui/StatusBadges';
import { ApiError, errorMessage } from '@/services/api';
import { orderService } from '@/services/salesServices';
import { toast } from '@/store';
import type { Order, RefundMethod } from '@/types';
import { applyServerErrors } from '@/utils/forms';
import { formatWithCode, toMinor } from '@/utils/money';
import { paymentAfterRefund, refundableAmount } from '@/utils/orderRules';
import { fractionDigitsFor, refreshSales } from './orderDisplay';

interface Props {
  open: boolean;
  onClose: () => void;
  order: Order;
}

/** Parses the typed amount (major units of the order currency) into minor units, or returns an error message. */
function parseAmount(raw: string, digits: number, max: number, currency: string): { minor: number } | { error: string } {
  const value = raw.trim();
  if (!value) return { error: 'Enter an amount.' };
  const pattern = digits === 0 ? /^\d+$/ : /^\d+(\.\d{1,2})?$/;
  if (!pattern.test(value)) return { error: digits === 0 ? `Use a whole number of ${currency}.` : 'Use a number with up to 2 decimals, e.g. 12.50.' };
  const minor = toMinor(Number(value));
  if (minor <= 0) return { error: 'Refund amount must be above zero.' };
  if (minor > max) return { error: `Refund cannot exceed the remaining ${formatWithCode(max, currency)}.` };
  return { minor };
}

const METHOD_LABELS: Array<{ value: RefundMethod; label: string; hint: string }> = [
  { value: 'original', label: 'Original payment', hint: 'Refunded through the payment provider, in the order’s currency.' },
  { value: 'manual_bank', label: 'Manual bank transfer', hint: 'Recorded as pending until you verify it with the bank reference.' },
  { value: 'manual_upi', label: 'Manual UPI', hint: 'Recorded as pending until you verify it with the UPI reference.' },
  { value: 'store_credit', label: 'Store credit (wallet)', hint: 'Credited to the customer’s wallet straight away.' },
];

export function RefundDialog(props: Props) {
  if (!props.open) return null;
  return <RefundDialogInner {...props} />;
}

function RefundDialogInner({ onClose, order }: Props) {
  const formId = useId();
  const [formError, setFormError] = useState<string | null>(null);
  const max = refundableAmount(order);
  const digits = fractionDigitsFor(order.currency);
  // A refund can only go back through the provider when the original payment id was stored.
  const canOriginal = order.payment.method !== 'wallet' && order.payment.reference !== '';
  const canStoreCredit = order.customer.customerId !== null;
  const defaultMethod: RefundMethod = canOriginal ? 'original' : canStoreCredit ? 'store_credit' : 'manual_bank';

  const schema = useMemo(
    () =>
      z
        .object({
          amount: z.string(),
          reason: z.string().trim().min(1, 'Give a reason for the refund.').max(500, 'Keep the reason under 500 characters.'),
          method: z.enum(['original', 'manual_bank', 'manual_upi', 'store_credit']),
          reference: z.string().trim().max(200),
          note: z.string().trim().max(500),
        })
        .superRefine((v, ctx) => {
          const parsed = parseAmount(v.amount, digits, max, order.currency);
          if ('error' in parsed) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['amount'], message: parsed.error });
          if ((v.method === 'manual_bank' || v.method === 'manual_upi') && !v.reference) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reference'], message: 'A bank/UPI reference is required for a manual refund.' });
          }
          if (v.method === 'original' && !canOriginal) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['method'], message: 'This order has no stored payment reference, so it cannot be refunded through the provider.' });
          }
          if (v.method === 'store_credit' && !canStoreCredit) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['method'], message: 'Store credit is only available for account orders.' });
          }
        }),
    [digits, max, order.currency, canOriginal, canStoreCredit],
  );
  type Values = z.infer<typeof schema>;

  const { register, handleSubmit, setError, formState, control } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { amount: (max / 100).toFixed(digits), reason: '', method: defaultMethod, reference: '', note: '' },
  });
  const busy = formState.isSubmitting;
  const amountText = useWatch({ control, name: 'amount' }) ?? '';
  const method = useWatch({ control, name: 'method' }) ?? defaultMethod;
  const preview = parseAmount(amountText, digits, max, order.currency);

  const onSubmit = async (v: Values) => {
    setFormError(null);
    const parsed = parseAmount(v.amount, digits, max, order.currency);
    if ('error' in parsed) return;
    try {
      const updated = await orderService.refund(order.id, {
        amount: parsed.minor,
        reason: v.reason,
        method: v.method,
        reference: v.reference || undefined,
        note: v.note || undefined,
      });
      refreshSales();
      const latest = updated.refunds[updated.refunds.length - 1];
      if (v.method === 'original') {
        toast(`Refund of ${formatWithCode(parsed.minor, order.currency)} issued via the payment provider${latest?.reference ? ` (refund ${latest.reference}).` : '.'}`, 'success');
      } else if (v.method === 'store_credit') {
        toast(`Refund of ${formatWithCode(parsed.minor, order.currency)} credited to the customer wallet.`, 'success');
      } else {
        toast(`Manual refund of ${formatWithCode(parsed.minor, order.currency)} recorded as pending — verify it on the order page once the money has been sent.`, 'success');
      }
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'validation' && e.issues.length) applyServerErrors(e, setError);
      else setFormError(errorMessage(e));
    }
  };

  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      title={`Refund ${order.number}`}
      description="The refund goes back in the order’s currency, to the original payment method unless you choose otherwise."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={busy}>
            Issue refund
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {formError && (
          <Notice tone="error" role="alert">
            {formError}
          </Notice>
        )}
        <TextField
          label={`Amount (${order.currency})`}
          required
          prefix={order.currency}
          inputMode="decimal"
          autoComplete="off"
          className="num"
          hint={`Up to ${formatWithCode(max, order.currency)} — the remaining paid amount, in the order’s currency.`}
          error={formState.errors.amount?.message}
          data-autofocus
          {...register('amount')}
        />
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium">Refund method</legend>
          <div className="space-y-2">
            {METHOD_LABELS.map((m) => {
              const disabled = (m.value === 'original' && !canOriginal) || (m.value === 'store_credit' && !canStoreCredit);
              return (
                <label key={m.value} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[13px] ${disabled ? 'border-sand-200 bg-sand-50 text-ink-faint' : 'border-sand-200 bg-white'}`}>
                  <input type="radio" value={m.value} disabled={disabled} {...register('method')} className="mt-0.5 accent-brand-600" />
                  <span>
                    <span className="block font-medium text-ink">{m.label}</span>
                    <span className="block text-xs text-ink-muted">
                      {m.hint}
                      {m.value === 'original' && !canOriginal && ' Not available — no payment reference was stored for this order.'}
                      {m.value === 'store_credit' && !canStoreCredit && ' Not available — this is a guest order.'}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          {formState.errors.method?.message && <p className="mt-1 text-xs text-red-700">{formState.errors.method.message}</p>}
        </fieldset>
        {(method === 'manual_bank' || method === 'manual_upi') && (
          <TextField
            label={method === 'manual_bank' ? 'Bank reference' : 'UPI reference'}
            required
            hint="The transfer reference (UTR / transaction id). The refund stays pending until you verify it."
            error={formState.errors.reference?.message}
            {...register('reference')}
          />
        )}
        <TextareaField label="Reason" required rows={3} maxLength={500} hint="Recorded on the order timeline. Not sent to the customer." error={formState.errors.reason?.message} {...register('reason')} />
        <TextareaField label="Note (optional)" rows={2} maxLength={500} hint="Internal note for the refund record." error={formState.errors.note?.message} {...register('note')} />
        <div className="rounded-lg border border-sand-200 bg-white px-3.5 py-1" aria-live="polite">
          <DefinitionList
            items={[
              ['Order total', <span className="num">{formatWithCode(order.total, order.currency)}</span>],
              ['Already refunded', <span className="num">{formatWithCode(order.refundedTotal, order.currency)}</span>],
              [
                'Payment after this refund',
                'minor' in preview ? <PaymentBadge status={paymentAfterRefund(order, preview.minor)} /> : <span className="text-ink-faint">—</span>,
              ],
              [
                'Still refundable after',
                'minor' in preview ? <span className="num">{formatWithCode(max - preview.minor, order.currency)}</span> : <span className="text-ink-faint">—</span>,
              ],
            ]}
          />
        </div>
        <p className="text-xs text-ink-muted">The customer is not notified and the storefront is not updated (separate app, demo).</p>
      </form>
    </Modal>
  );
}
