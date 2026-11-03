import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Dialog';
import { Notice } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Form';
import { ApiError, errorMessage } from '@/services/api';
import { orderService } from '@/services/salesServices';
import { toast } from '@/store';
import type { Order } from '@/types';
import { applyServerErrors } from '@/utils/forms';
import { validateTracking, type TrackingInput } from '@/utils/orderRules';
import { refreshSales } from './orderDisplay';

// Same rules as the service (validateTracking), so client and server messages match.
const schema = z
  .object({
    carrier: z.string().max(60, 'Keep the carrier under 60 characters.'),
    trackingNumber: z.string(),
    trackingUrl: z.string().max(500, 'Keep the URL under 500 characters.'),
  })
  .superRefine((v, ctx) => {
    const errors = validateTracking(v);
    (Object.keys(errors) as Array<keyof TrackingInput>).forEach((path) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message: errors[path]! }));
  });
type Values = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  order: Order;
  /** "ship" marks the order as shipped with tracking; "edit" only updates tracking on a shipped/delivered order. */
  mode: 'ship' | 'edit';
}

/** Carrier + tracking form. Mounted only while open so every opening starts fresh. */
export function TrackingDialog(props: Props) {
  if (!props.open) return null;
  return <TrackingDialogInner {...props} />;
}

function TrackingDialogInner({ onClose, order, mode }: Props) {
  const formId = useId();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { carrier: order.fulfilment.carrier ?? '', trackingNumber: order.fulfilment.trackingNumber ?? '', trackingUrl: order.fulfilment.trackingUrl ?? '' },
  });
  const busy = formState.isSubmitting;

  const onSubmit = async (v: Values) => {
    setFormError(null);
    try {
      if (mode === 'ship') await orderService.advance(order.id, 'shipped', v);
      else await orderService.updateTracking(order.id, v);
      refreshSales();
      toast(mode === 'ship' ? `Order ${order.number} marked as shipped.` : 'Tracking updated.', 'success');
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
      title={mode === 'ship' ? `Mark ${order.number} as shipped` : `Edit tracking for ${order.number}`}
      description={mode === 'ship' ? 'Add the carrier and tracking number for this parcel.' : 'Correct the carrier or tracking details.'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={busy}>
            {mode === 'ship' ? 'Mark as shipped' : 'Save tracking'}
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
        <TextField label="Carrier" required autoComplete="off" placeholder="e.g. India Post" error={formState.errors.carrier?.message} data-autofocus {...register('carrier')} />
        <TextField
          label="Tracking number"
          required
          autoComplete="off"
          hint="4–40 letters, numbers or hyphens."
          className="font-mono"
          error={formState.errors.trackingNumber?.message}
          {...register('trackingNumber')}
        />
        <TextField
          label="Tracking URL"
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://"
          hint="Optional. Full http(s) link to the carrier’s tracking page."
          error={formState.errors.trackingUrl?.message}
          {...register('trackingUrl')}
        />
        <p className="text-xs text-ink-muted">The customer is not notified and the storefront is not updated (separate app, demo).</p>
      </form>
    </Modal>
  );
}
