import { Suspense, useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ChevronRight, ExternalLink, FlaskConical, LogOut, Menu as MenuIcon, PanelLeftClose, PanelLeftOpen, RotateCcw, UserCircle2 } from 'lucide-react';
import logoMark from '@/assets/logo-mark.png';
import { IconButton } from '@/components/ui/Button';
import { ConfirmHost, Drawer } from '@/components/ui/Dialog';
import { Spinner } from '@/components/ui/Feedback';
import { Menu, ToastViewport } from '@/components/ui/Menu';
import { APP, NAV } from '@/config/app';
import { useSettings } from '@/hooks/misc';
import { invalidate } from '@/hooks/useQuery';
import { errorMessage } from '@/services/api';
import { authService, demoService } from '@/services/settingsService';
import { API_BASE_URL, API_MODE, setUnauthorizedHandler } from '@/api';
import { confirmAction, toast, useAuth, usePageMetaStore, usePrefs } from '@/store';
import { cn } from '@/utils/misc';

/** UI-only guard. NOT security: anything in the browser can be bypassed; the future API must enforce auth. */
export function RequireAdmin({ children }: { children: JSX.Element }) {
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const location = useLocation();
  // In API mode the session lives in an httpOnly cookie, so a refresh can restore it from the server.
  const [restoring, setRestoring] = useState(API_MODE && !user);

  useEffect(() => {
    if (!API_MODE || user) return;
    let cancelled = false;
    authService.me().then((owner) => {
      if (cancelled) return;
      if (owner) setUser(owner);
      setRestoring(false);
    });
    return () => {
      cancelled = true;
    };
  }, [user, setUser]);

  if (restoring) return <Spinner label="Checking your session…" />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return children;
}

function Brand({ collapsed }: { collapsed?: boolean }) {
  const { data: settings } = useSettings();
  const name = settings?.store.name ?? 'Your Store';
  return (
    <Link to="/dashboard" className="flex min-w-0 items-center gap-2.5 rounded-lg px-1" aria-label={`${name} admin — dashboard`}>
      <img src={logoMark} alt="" className="h-8 w-8 shrink-0 object-contain" />

      {!collapsed && (
        <span className="min-w-0">
          <span className="block truncate font-brand text-lg font-semibold leading-tight text-ink">{name}</span>
          <span className="block text-2xs font-semibold uppercase tracking-wider text-ink-muted">Admin</span>
        </span>
      )}
    </Link>
  );
}

function NavList({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <nav aria-label="Admin" className="space-y-5">
      {NAV.map((group) => (
        <div key={group.label}>
          {!collapsed && <p className="mb-1 px-3 text-2xs font-semibold uppercase tracking-wider text-ink-faint">{group.label}</p>}
          <ul className="space-y-0.5">
            {group.items.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  onClick={onNavigate}
                  title={collapsed ? label : undefined}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
                      collapsed && 'justify-center px-0',
                      isActive ? 'bg-brand-50 text-brand-800' : 'text-ink-soft hover:bg-sand-100 hover:text-ink',
                    )
                  }
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                  <span className={collapsed ? 'sr-only' : ''}>{label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Topbar({ onOpenNav }: { onOpenNav: () => void }) {
  const { title, crumbs } = usePageMetaStore();
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);

  const reset = async () => {
    const ok = await confirmAction({
      title: 'Reset demo data?',
      body: 'All products, orders, content and settings in this admin preview go back to the original sample data. Uploaded local images are removed. The storefront is not affected.',
      confirmLabel: 'Reset demo data',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await demoService.reset();
      invalidate();
      toast('Demo data reset to the original sample data.', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-sand-200 bg-white/95 backdrop-blur">
      <div className="flex min-h-[60px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <IconButton label="Open navigation" className="-ml-2 lg:hidden" onClick={onOpenNav}>
          <MenuIcon className="h-5 w-5" aria-hidden />
        </IconButton>
        <div className="min-w-0 flex-1 py-2">
          {crumbs.length > 0 && (
            <nav aria-label="Breadcrumb">
              <ol className="flex flex-wrap items-center gap-1 text-xs text-ink-muted">
                {crumbs.map((c, i) => (
                  <li key={i} className="flex items-center gap-1">
                    {c.to ? (
                      <Link to={c.to} className="hover:text-ink hover:underline">
                        {c.label}
                      </Link>
                    ) : (
                      <span>{c.label}</span>
                    )}
                    <ChevronRight className="h-3 w-3" aria-hidden />
                  </li>
                ))}
              </ol>
            </nav>
          )}
          <h1 className="truncate text-lg leading-tight">{title}</h1>
        </div>
        <a
          href={APP.storefrontUrl}
          target="_blank"
          rel="noreferrer"
          className="hidden items-center gap-1.5 rounded-lg border border-sand-300 px-3 py-1.5 text-[13px] font-medium text-ink-soft hover:bg-ivory-50 sm:inline-flex"
          title="Opens the storefront in a new tab. It does not show admin changes in this phase."
        >
          View store <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">(opens in a new tab; admin changes are not shown there yet)</span>
        </a>
        <Menu
          label="Admin account"
          trigger={
            <span className="flex items-center gap-2">
              <UserCircle2 className="h-7 w-7 text-ink-muted" aria-hidden />
              {/* The name below is hidden under md, which would leave this button with no accessible name. */}
              <span className="sr-only md:hidden">Admin account</span>
              <span className="hidden text-left md:block">
                <span className="block text-[13px] font-medium leading-tight text-ink">{user?.name}</span>
                <span className="block text-2xs text-ink-muted">Demo owner</span>
              </span>
            </span>
          }
          items={[
            { label: 'View store (separate app)', icon: <ExternalLink className="h-4 w-4" aria-hidden />, href: APP.storefrontUrl },
            { label: 'Reset demo data…', icon: <RotateCcw className="h-4 w-4" aria-hidden />, onSelect: () => void reset() },
            {
              label: 'Sign out',
              icon: <LogOut className="h-4 w-4" aria-hidden />,
              danger: true,
              onSelect: () => {
                void authService.logout();
                setUser(null);
              },
            },
          ]}
        />
      </div>
      <div className="flex items-center gap-2 border-t border-brand-100 bg-brand-50 px-4 py-1.5 text-xs text-brand-900 sm:px-6 lg:px-8" role="note">
        <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          {API_MODE ? (
            <>
              <strong>Live API</strong> — every change is saved to the store database via {API_BASE_URL} and appears on the storefront.
            </>
          ) : (
            <>
              <strong>Demo mode</strong> — changes stay in this admin preview and reset on refresh. The storefront is not updated.
            </>
          )}
        </span>
      </div>
    </header>
  );
}

export function AdminLayout() {
  const setUser = useAuth((s) => s.setUser);
  const collapsed = usePrefs((s) => s.sidebarCollapsed);
  const toggle = usePrefs((s) => s.toggleSidebar);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  // One place decides what an expired session means: drop the user, so RequireAdmin sends them to
  // /login. The client guards re-entrancy, so a burst of parallel 401s signs out once, with no loop.
  useEffect(() => {
    if (!API_MODE) return;
    setUnauthorizedHandler(() => {
      setUser(null);
      toast('Your session expired. Please sign in again.', 'error');
    });
    return () => setUnauthorizedHandler(null);
  }, [setUser]);

  // Braces matter: an expression-bodied effect returns its value, and React calls that as the cleanup.
  // `window.scrollTo()` returns an object in some browsers, which crashed the layout on every navigation.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="min-h-screen lg:flex">
      <a href="#main" className="sr-only z-[70] rounded bg-ink px-3 py-2 text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>
      <aside className={cn('sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sand-200 bg-white lg:flex', collapsed ? 'w-[68px]' : 'w-60')}>
        <div className={cn('flex h-[60px] items-center border-b border-sand-200', collapsed ? 'justify-center px-2' : 'justify-between px-4')}>
          <Brand collapsed={collapsed} />
        </div>
        <div className={cn('flex-1 overflow-y-auto py-4 scrollbar-thin', collapsed ? 'px-2' : 'px-3')}>
          <NavList collapsed={collapsed} />
        </div>
        <div className={cn('border-t border-sand-200 p-2', collapsed && 'flex justify-center')}>
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-ink-muted hover:bg-sand-100 hover:text-ink"
          >
            {collapsed ? <PanelLeftOpen className="mx-auto h-[18px] w-[18px]" aria-hidden /> : <PanelLeftClose className="h-[18px] w-[18px]" aria-hidden />}
            {!collapsed && 'Collapse'}
          </button>
        </div>
      </aside>

      <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)} title={<Brand />} side="left">
        <NavList onNavigate={() => setMobileOpen(false)} />
        <a href={APP.storefrontUrl} target="_blank" rel="noreferrer" className="mt-6 flex items-center gap-2 rounded-lg border border-sand-300 px-3 py-2 text-[13px] font-medium text-ink-soft">
          View store (separate app) <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      </Drawer>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenNav={() => setMobileOpen(true)} />
        {/* min-w-0 stops wide content (tables, filter rows) stretching the flex item and scrolling the whole page. */}
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 focus:outline-none sm:px-6 lg:px-8">
          <div className="mx-auto min-w-0 max-w-content">
            <Suspense fallback={<Spinner />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
      <ToastViewport />
      <ConfirmHost />
    </div>
  );
}

export function AuthLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-ivory">
      <main id="main" className="flex flex-1 items-center justify-center px-4 py-10">
        <Suspense fallback={<Spinner />}>
          <Outlet />
        </Suspense>
      </main>
      <ToastViewport />
    </div>
  );
}

