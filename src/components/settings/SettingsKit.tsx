import { useEffect, type ReactNode } from 'react';
import { useBlocker } from 'react-router-dom';
import { RotateCcw, Save } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ErrorState, Notice, Skeleton } from '@/components/ui/Feedback';
import { ActionBar } from '@/components/ui/Page';
import { useSettings } from '@/hooks/misc';
import { confirmAction, toast } from '@/store';
import type { CurrencyConfig, Minor, Settings } from '@/types';
import { formatDateTime } from '@/utils/dates';
import { cn } from '@/utils/misc';
import { convertFromUsd, formatWithCode } from '@/utils/money';

// Shared building blocks for the settings pages (and the coupon calculator).

/** Every settings page states what saving actually changes in this phase. */
export function SettingsScopeNotice({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <Notice tone="demo" title="Admin preview only" className={className}>
      Saved settings affect this admin preview and its calculations only. The storefront is a separate app and keeps its own configuration until the backend
      integration. Everything here resets when the page is refreshed.
      {children && <span className="mt-1 block">{children}</span>}
    </Notice>
  );
}

export function SettingsSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading settings">
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="card space-y-3 p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-2/3" />
        </div>
      ))}
    </div>
  );
}

/** Loads settings once and renders the form only when they are available (skeleton / error + retry otherwise). */
export function SettingsGate({ children, cards }: { children: (settings: Settings) => ReactNode; cards?: number }) {
  const { data, isLoading, error, refetch } = useSettings();
  if (error && !data)
    return (
      <div className="card">
        <ErrorState error={error} onRetry={refetch} title="Couldn’t load settings" />
      </div>
    );
  if (isLoading || !data) return <SettingsSkeleton cards={cards} />;
  return <>{children(data)}</>;
}

/** Sticky Save / Reset bar with an "Unsaved changes" status. Place it as the last child of the <form>. */
export function SettingsActionBar({ dirty, saving, onReset, updatedAt, saveLabel = 'Save changes' }: { dirty: boolean; saving: boolean; onReset: () => void; updatedAt?: string; saveLabel?: string }) {
  return (
    <ActionBar
      status={
        <span role="status" className={cn(dirty && 'font-medium text-amber-800')}>
          {saving ? 'Saving…' : dirty ? 'Unsaved changes' : `No unsaved changes${updatedAt ? ` · last saved ${formatDateTime(updatedAt)}` : ''}`}
        </span>
      }
    >
      <Button variant="outline" onClick={onReset} disabled={!dirty || saving} icon={<RotateCcw className="h-4 w-4" aria-hidden />}>
        Reset form
      </Button>
      <Button type="submit" loading={saving} disabled={!dirty} icon={<Save className="h-4 w-4" aria-hidden />}>
        {saveLabel}
      </Button>
    </ActionBar>
  );
}

/** Use as the `onInvalid` handler of handleSubmit so client-side validation failures are announced. */
export const onInvalidForm = () => toast('Please fix the highlighted fields.', 'error');

/** Asks before leaving the route (or closing the tab) while a form has unsaved changes. */
export function useUnsavedChangesGuard(dirty: boolean) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    let cancelled = false;
    void confirmAction({
      title: 'Leave without saving?',
      body: 'This page has unsaved changes. They will be lost if you leave.',
      confirmLabel: 'Leave page',
      tone: 'danger',
    }).then((ok) => {
      if (cancelled) return;
      if (ok) blocker.proceed();
      else blocker.reset();
    });
    return () => {
      cancelled = true;
    };
  }, [blocker]);
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);
}

/** Enabled non-USD currencies, for "≈ INR ₹2,352 · EUR €25.76" style examples. */
export function convertedExamples(usd: Minor, currencies: CurrencyConfig[]): Array<{ code: string; text: string }> {
  return currencies
    .filter((c) => c.enabled && c.code !== 'USD' && Number.isFinite(c.rate) && c.rate > 0)
    .map((c) => ({ code: c.code, text: formatWithCode(convertFromUsd(usd, c), c.code, c.fractionDigits) }));
}

/** One line of converted amounts using the given (saved or draft) currency settings. Renders nothing if none are enabled. */
export function CurrencyExamples({ usd, currencies, label = '≈', className }: { usd: Minor; currencies: CurrencyConfig[]; label?: ReactNode; className?: string }) {
  const items = convertedExamples(usd, currencies);
  if (!items.length || !Number.isFinite(usd)) return null;
  return (
    <p className={cn('text-xs text-ink-muted num', className)}>
      {label}{' '}
      {items.map((i, idx) => (
        <span key={i.code} className="whitespace-nowrap">
          {idx > 0 && <span aria-hidden> · </span>}
          {i.text}
        </span>
      ))}
    </p>
  );
}
