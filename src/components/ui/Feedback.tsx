import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, RefreshCw, XCircle, FlaskConical } from 'lucide-react';
import { errorMessage } from '@/services/api';
import { cn } from '@/utils/misc';
import { Button } from './Button';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-sand-200/70', className)} aria-hidden />;
}

export function Spinner({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cn('flex items-center justify-center gap-3 py-12 text-ink-muted', className)}>
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-sand-300 border-t-brand-600" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}

type Tone = 'info' | 'success' | 'warning' | 'error' | 'demo';

const tones: Record<Tone, { box: string; icon: ReactNode }> = {
  info: { box: 'border-sky-200 bg-sky-50 text-sky-950', icon: <Info className="h-4 w-4 shrink-0" aria-hidden /> },
  success: { box: 'border-emerald-200 bg-emerald-50 text-emerald-950', icon: <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden /> },
  warning: { box: 'border-amber-200 bg-amber-50 text-amber-950', icon: <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> },
  error: { box: 'border-red-200 bg-red-50 text-red-950', icon: <XCircle className="h-4 w-4 shrink-0" aria-hidden /> },
  demo: { box: 'border-brand-200 bg-brand-50 text-brand-900', icon: <FlaskConical className="h-4 w-4 shrink-0" aria-hidden /> },
};

/** `role`: 'alert' for urgent errors, 'status' for results of an action, 'note' for persistent standing notices. */
export function Notice({ tone = 'info', title, children, className, role, action }: { tone?: Tone; title?: ReactNode; children?: ReactNode; className?: string; role?: 'status' | 'alert' | 'note'; action?: ReactNode }) {
  return (
    <div role={role} className={cn('flex gap-2.5 rounded-lg border px-3.5 py-2.5 text-[13px]', tones[tone].box, className)}>
      <span className="mt-px">{tones[tone].icon}</span>
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5')}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, body, action, className }: { icon?: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center px-4 py-12 text-center', className)}>
      {icon && <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sand-100 text-ink-muted">{icon}</div>}
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {body && <div className="mt-1 max-w-sm text-[13px] text-ink-muted">{body}</div>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Couldn’t load this', className }: { error?: unknown; onRetry?: () => void; title?: string; className?: string }) {
  return (
    <EmptyState
      className={className}
      icon={<AlertTriangle className="h-6 w-6 text-red-700" aria-hidden />}
      title={title}
      body={error ? errorMessage(error) : 'Please try again.'}
      action={
        onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} icon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}>
            Retry
          </Button>
        )
      }
    />
  );
}

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'muted';

const badgeTones: Record<BadgeTone, string> = {
  neutral: 'bg-sand-100 text-ink-soft ring-sand-300',
  success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-900 ring-amber-200',
  danger: 'bg-red-50 text-red-800 ring-red-200',
  info: 'bg-sky-50 text-sky-900 ring-sky-200',
  brand: 'bg-brand-50 text-brand-800 ring-brand-200',
  muted: 'bg-white text-ink-muted ring-sand-300',
};

export function Badge({ tone = 'neutral', children, className, dot }: { tone?: BadgeTone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', badgeTones[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
