import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { AlertCircle, ChevronDown } from 'lucide-react';
import { cn } from '@/utils/misc';

export function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 flex items-start gap-1.5 text-[13px] text-red-700">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{message}</span>
    </p>
  );
}

interface ShellProps {
  id: string;
  label: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
  className?: string;
  hideLabel?: boolean;
  children: ReactNode;
}

export function FieldShell({ id, label, required, hint, error, className, hideLabel, children }: ShellProps) {
  return (
    <div className={className}>
      <label htmlFor={id} className={cn('label', hideLabel && 'sr-only')}>
        {label}
        {required && (
          <span className="text-brand-700" aria-hidden>
            {' '}
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-muted">
          {hint}
        </p>
      )}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

export const describedBy = (id: string, hint?: ReactNode, error?: string) =>
  [error ? `${id}-error` : null, hint && !error ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined;

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  containerClassName?: string;
  hideLabel?: boolean;
  /** Text shown inside the input on the left, e.g. a currency code. */
  prefix?: string;
  suffix?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, required, containerClassName, className, id: idProp, hideLabel, prefix, suffix, ...rest },
  ref,
) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <FieldShell id={id} label={label} required={required} hint={hint} error={error} className={containerClassName} hideLabel={hideLabel}>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs font-medium text-ink-muted">{prefix}</span>}
        <input
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-required={required || undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={cn('input', prefix && 'pl-12', suffix && 'pr-12', className)}
          {...rest}
        />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-ink-muted">{suffix}</span>}
      </div>
    </FieldShell>
  );
});

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  containerClassName?: string;
  hideLabel?: boolean;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { label, hint, error, required, containerClassName, className, id: idProp, hideLabel, children, ...rest },
  ref,
) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <FieldShell id={id} label={label} required={required} hint={hint} error={error} className={containerClassName} hideLabel={hideLabel}>
      <div className="relative">
        <select
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-required={required || undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={cn('input appearance-none pr-9', className)}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden />
      </div>
    </FieldShell>
  );
});

interface TextareaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  containerClassName?: string;
}

export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaFieldProps>(function TextareaField(
  { label, hint, error, required, containerClassName, className, id: idProp, ...rest },
  ref,
) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <FieldShell id={id} label={label} required={required} hint={hint} error={error} className={containerClassName}>
      <textarea
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-required={required || undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn('input min-h-[5rem] resize-y', className)}
        {...rest}
      />
    </FieldShell>
  );
});

interface CheckboxFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  description?: ReactNode;
  error?: string;
  containerClassName?: string;
}

export const CheckboxField = forwardRef<HTMLInputElement, CheckboxFieldProps>(function CheckboxField(
  { label, description, error, containerClassName, id: idProp, ...rest },
  ref,
) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <div className={containerClassName}>
      <div className="flex items-start gap-2.5">
        <input
          ref={ref}
          id={id}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={[description ? `${id}-desc` : '', error ? `${id}-error` : ''].join(' ').trim() || undefined}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded accent-brand-600"
          {...rest}
        />
        <div className="min-w-0">
          <label htmlFor={id} className="cursor-pointer text-sm font-medium text-ink">
            {label}
          </label>
          {description && (
            <p id={`${id}-desc`} className="text-xs text-ink-muted">
              {description}
            </p>
          )}
        </div>
      </div>
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
});

/** Accessible on/off switch (button with role="switch"). For use outside react-hook-form or with Controller. */
export function Switch({ checked, onChange, label, description, disabled, id: idProp }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean; id?: string }) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        {description && (
          <p id={`${id}-desc`} className="text-xs text-ink-muted">
            {description}
          </p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-desc` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50', checked ? 'bg-brand-600' : 'bg-sand-300')}
      >
        <span className={cn('inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} aria-hidden />
      </button>
    </div>
  );
}

/** react-hook-form `setValueAs` helpers for numeric inputs. */
export const asNumberOrNull = (v: unknown) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
export const asInt = (v: unknown) => (v === '' || v === null || v === undefined ? NaN : Number(v));
