import { Link, useRouteError } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { ButtonLink, buttonClasses } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { usePageMeta } from '@/hooks/misc';

export default function NotFoundPage() {
  usePageMeta('Page not found');
  return (
    <div className="card">
      <EmptyState
        icon={<Compass className="h-6 w-6" aria-hidden />}
        title="This admin page doesn’t exist"
        body="Check the address, or go back to the dashboard."
        action={<ButtonLink to="/dashboard" variant="primary">Go to dashboard</ButtonLink>}
      />
    </div>
  );
}

/** Router-level error boundary (render errors, failed chunk loads). */
export function RouteError() {
  const error = useRouteError();
  if (import.meta.env.DEV) console.error(error);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-ivory px-6 text-center">
      <p className="font-brand text-2xl font-semibold">Your Store Admin</p>
      <h1 className="text-xl">Something went wrong</h1>
      <p className="max-w-md text-[13px] text-ink-muted">An unexpected error occurred while showing this page. Demo data is kept in memory, so reloading resets it.</p>
      <div className="flex gap-2">
        <button type="button" className={buttonClasses('outline')} onClick={() => window.location.reload()}>
          Reload
        </button>
        <Link to="/dashboard" className={buttonClasses('primary')}>
          Dashboard
        </Link>
      </div>
    </main>
  );
}
