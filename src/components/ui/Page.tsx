import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/utils/misc';

/** Intro line + primary actions at the top of a page (the title itself lives in the top bar). */
export function PageHeader({ description, actions, children }: { description?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 text-[13px] text-ink-muted">
        {description}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
    </div>
  );
}

/** Sticky save bar at the bottom of long forms. */
export function ActionBar({ children, status, className }: { children: ReactNode; status?: ReactNode; className?: string }) {
  return (
    <div className={cn('sticky bottom-0 z-20 -mx-4 mt-6 border-t border-sand-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8', className)}>
      <div className="mx-auto flex max-w-content flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-[13px] text-ink-muted">{status}</div>
        <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>
      </div>
    </div>
  );
}

export function Card({ title, description, actions, children, className, bodyClassName, id }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; id?: string }) {
  const titleId = useId();
  return (
    <section className={cn('card', className)} aria-labelledby={title ? titleId : undefined} id={id}>
      {(title || actions) && (
        <div className="card-header">
          <div className="min-w-0">
            {title && (
              <h2 id={titleId} className="card-title">
                {title}
              </h2>
            )}
            {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn('card-body', bodyClassName)}>{children}</div>
    </section>
  );
}

export function StatCard({ label, value, sub, to, icon, tone = 'neutral' }: { label: string; value: ReactNode; sub?: ReactNode; to?: string; icon?: ReactNode; tone?: 'neutral' | 'warning' | 'danger' }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-ink-muted">{label}</p>
        {icon && <span className={cn('rounded-md p-1.5', tone === 'warning' ? 'bg-amber-50 text-amber-800' : tone === 'danger' ? 'bg-red-50 text-red-800' : 'bg-sand-100 text-ink-soft')}>{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-ink">{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-muted">{sub}</p>}
    </>
  );
  return to ? (
    <Link to={to} className="card block p-4 transition-shadow hover:shadow-lift">
      {body}
    </Link>
  ) : (
    <div className="card p-4">{body}</div>
  );
}

export interface TabDef {
  id: string;
  label: ReactNode;
}

/** WAI-ARIA tabs (arrow keys). Content is rendered by the caller based on `value`. */
export function Tabs({ tabs, value, onChange, label, className }: { tabs: TabDef[]; value: string; onChange: (id: string) => void; label: string; className?: string }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const idx = Math.max(0, tabs.findIndex((t) => t.id === value));
  const onKey = (e: KeyboardEvent) => {
    let next = idx;
    if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length;
    else return;
    e.preventDefault();
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKey} className={cn('flex gap-1 overflow-x-auto border-b border-sand-200 scrollbar-thin', className)}>
      {tabs.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => (refs.current[i] = el)}
          role="tab"
          type="button"
          aria-selected={i === idx}
          tabIndex={i === idx ? 0 : -1}
          onClick={() => onChange(t.id)}
          className={cn('-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium', i === idx ? 'border-brand-600 text-ink' : 'border-transparent text-ink-muted hover:text-ink')}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function DefinitionList({ items, className }: { items: Array<[ReactNode, ReactNode]>; className?: string }) {
  return (
    <dl className={cn('divide-y divide-sand-200/70 text-[13px]', className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="flex justify-between gap-4 py-2">
          <dt className="text-ink-muted">{k}</dt>
          <dd className="text-right font-medium text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
