import { useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useDialog } from '@/hooks/misc';
import { useUi } from '@/store';
import { cn } from '@/utils/misc';
import { Button, IconButton } from './Button';

interface BaseProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/** Side panel for create/edit forms and filters. */
export function Drawer({ open, onClose, title, description, children, footer, className, side = 'right' }: BaseProps & { side?: 'left' | 'right' }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialog(ref, open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 animate-fade-in bg-ink/40" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'absolute inset-y-0 flex w-full flex-col bg-ivory-50 shadow-drawer outline-none',
          side === 'right' ? 'right-0 max-w-xl animate-slide-in-right' : 'left-0 max-w-xs animate-slide-in-left',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-sand-200 bg-white px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-[13px] text-ink-muted">{description}</p>}
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X className="h-5 w-5" aria-hidden />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="border-t border-sand-200 bg-white px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Modal({ open, onClose, title, description, children, footer, className, size = 'md' }: BaseProps & { size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialog(ref, open, onClose);
  if (!open) return null;
  const width = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-fade-in bg-ink/40" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn('relative flex max-h-[92vh] w-full animate-pop-in flex-col rounded-t-2xl bg-ivory-50 shadow-drawer outline-none sm:rounded-2xl', width, className)}
      >
        <div className="flex items-start justify-between gap-3 border-b border-sand-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base">
              {title}
            </h2>
            {description && <div className="mt-0.5 text-[13px] text-ink-muted">{description}</div>}
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X className="h-5 w-5" aria-hidden />
          </IconButton>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-sand-200 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Renders the dialog requested through `confirmAction()` (see store). Mounted once in the layout. */
export function ConfirmHost() {
  const confirm = useUi((s) => s.confirm);
  const close = useUi((s) => s.closeConfirm);
  if (!confirm) return null;
  return (
    <Modal
      open
      onClose={() => close(false)}
      title={confirm.title}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => close(false)} data-autofocus>
            Cancel
          </Button>
          <Button variant={confirm.tone === 'danger' ? 'danger' : 'primary'} onClick={() => close(true)}>
            {confirm.confirmLabel ?? 'Confirm'}
          </Button>
        </>
      }
    >
      <div className="text-sm text-ink-soft">{confirm.body}</div>
    </Modal>
  );
}

/** Confirmation dialog with its own async action + error state (used where a form/options are needed). */
export function ConfirmDialog({
  open,
  onClose,
  title,
  children,
  confirmLabel,
  tone = 'primary',
  onConfirm,
  disabled,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  onConfirm: () => Promise<void> | void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={title}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={run} loading={busy} disabled={disabled}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
