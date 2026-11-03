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
import type { Order } from '@/types';
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

export function RefundDialog(props: Props) {
  if (!props.open) return null;
  return <RefundDialogInner {...props} />;
}

function RefundDialogInner({ onClose, order }: Props) {
  const formId = useId();
  const [formError, setFormError] = useState<string | null>(null);
  const max = refundableAmount(order);
  const digits = fractionDigitsFor(order.currency);

  const schema = useMemo(
    () =>
      z
        .object({
          amount: z.string(),
          reason: z.string().trim().min(1, 'Give a reason for the refund.').max(500, 'Keep the reason under 500 characters.'),
        })
        .superRefine((v, ctx) => {
          const parsed = parseAmount(v.amount, digits, max, order.currency);
          if ('error' in parsed) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['amount'], message: parsed.error });
        }),
    [digits, max, order.currency],
  );
  type Values = z.infer<typeof schema>;

  const { register, handleSubmit, setError, formState, control } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { amount: (max / 100).toFixed(digits), reason: '' },
  });
  const busy = formState.isSubmitting;
  const amountText = useWatch({ control, name: 'amount' }) ?? '';
  const preview = parseAmount(amountText, digits, max, order.currency);

  const onSubmit = async (v: Values) => {
    setFormError(null);
    const parsed = parseAmount(v.amount, digits, max, order.currency);
    if ('error' in parsed) return;
    try {
      await orderService.refund(order.id, { amount: parsed.minor, reason: v.reason });
      refreshSales();
      toast(`Refund of ${formatWithCode(parsed.minor, order.currency)} recorded (simulated — no money moved).`, 'success');
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
      title={`Refund ${order.number} (simulated)`}
      description="Simulated — no money moves and no payment provider is contacted."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={busy}>
            Record refund (simulated)
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
        <TextareaField label="Reason" required rows={3} maxLength={500} hint="Recorded on the order timeline. Not sent to the customer." error={formState.errors.reason?.message} {...register('reason')} />
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
