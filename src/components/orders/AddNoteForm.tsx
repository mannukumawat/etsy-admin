import { useId } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { TextareaField } from '@/components/ui/Form';
import { orderService } from '@/services/salesServices';
import { toast } from '@/store';
import { applyServerErrors } from '@/utils/forms';
import { cn } from '@/utils/misc';
import { refreshSales } from './orderDisplay';

const MAX = 1000;
const schema = z.object({ body: z.string().trim().min(1, 'Write a note first.').max(MAX, 'Keep notes under 1,000 characters.') });
type Values = z.infer<typeof schema>;

/** Internal note form for an order. Notes are admin-only. */
export function AddNoteForm({ orderId }: { orderId: string }) {
  const id = useId();
  const { register, handleSubmit, setError, reset, formState, control } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { body: '' } });
  const length = (useWatch({ control, name: 'body' }) ?? '').length;

  const onSubmit = async (v: Values) => {
    try {
      await orderService.addNote(orderId, v.body);
      reset({ body: '' });
      refreshSales();
      toast('Note added.', 'success');
    } catch (e) {
      applyServerErrors(e, setError, 'Could not add the note.');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-2">
      <TextareaField
        id={`${id}-body`}
        label="Add a note"
        required
        rows={3}
        maxLength={MAX}
        placeholder="e.g. Customer asked for gift wrapping."
        hint="Internal — never shown to the customer."
        error={formState.errors.body?.message}
        {...register('body')}
      />
      <div className="flex items-center justify-between gap-3">
        <span className={cn('text-xs num', length > MAX ? 'text-red-700' : 'text-ink-muted')}>
          {length} / {MAX}
          <span className="sr-only"> characters</span>
        </span>
        <Button type="submit" size="sm" loading={formState.isSubmitting}>
          Add note
        </Button>
      </div>
    </form>
  );
}
