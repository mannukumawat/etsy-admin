import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Dialog';
import { Notice } from '@/components/ui/Feedback';
import { CheckboxField, TextareaField } from '@/components/ui/Form';
import { ApiError, errorMessage } from '@/services/api';
import { orderService } from '@/services/salesServices';
import { toast } from '@/store';
import type { Order } from '@/types';
import { applyServerErrors } from '@/utils/forms';
import { formatWithCode } from '@/utils/money';
import { refundableAmount } from '@/utils/orderRules';
import { refreshSales } from './orderDisplay';

const schema = z.object({
  reason: z.string().trim().min(1, 'Give a reason for the cancellation.').max(500, 'Keep the reason under 500 characters.'),
  restock: z.boolean(),
  refund: z.boolean(),
});
type Values = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  order: Order;
}

export function CancelOrderDialog(props: Props) {
  if (!props.open) return null;
  return <CancelOrderDialogInner {...props} />;
}

function CancelOrderDialogInner({ onClose, order }: Props) {
  const formId = useId();
  const [formError, setFormError] = useState<string | null>(null);
  const refundable = refundableAmount(order);
  const canRestock = !order.fulfilment.restocked;
  const { register, handleSubmit, setError, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { reason: '', restock: canRestock, refund: refundable > 0 },
  });
  const busy = formState.isSubmitting;

  const onSubmit = async (v: Values) => {
    setFormError(null);
    try {
      await orderService.cancel(order.id, { reason: v.reason, restock: canRestock && v.restock, refund: refundable > 0 && v.refund });
      refreshSales();
      toast(`Order ${order.number} cancelled.`, 'success');
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
      title={`Cancel order ${order.number}?`}
      description="Only orders that have not shipped can be cancelled. This cannot be undone."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Keep order
          </Button>
          <Button type="submit" form={formId} variant="danger" loading={busy}>
            Cancel order
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
        <TextareaField label="Reason" required rows={3} maxLength={500} hint="Recorded on the order timeline. Not sent to the customer." error={formState.errors.reason?.message} data-autofocus {...register('reason')} />
        {canRestock ? (
          <CheckboxField label="Return items to stock" description="Adds each item’s quantity back to its variant and logs a stock adjustment." {...register('restock')} />
        ) : (
          <p className="text-[13px] text-ink-muted">Items were already returned to stock.</p>
        )}
        {refundable > 0 ? (
          <CheckboxField
            label={`Refund the remaining ${formatWithCode(refundable, order.currency)} (simulated)`}
            description="Simulated — no money moves. Payment will show as refunded."
            {...register('refund')}
          />
        ) : (
          <p className="text-[13px] text-ink-muted">No captured payment is left on this order, so there is nothing to refund.</p>
        )}
        <Notice tone="demo">The customer is not notified and the storefront is not updated (separate app, demo).</Notice>
      </form>
    </Modal>
  );
}
