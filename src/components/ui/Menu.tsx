import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Info, MoreHorizontal, X, XCircle } from 'lucide-react';
import { useUi } from '@/store';
import { cn } from '@/utils/misc';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect?: () => void;
  to?: string;
  href?: string;
  danger?: boolean;
  disabled?: boolean;
}

/** Accessible dropdown menu (button + role="menu", arrow keys, Escape, outside click). */
export function Menu({ items, label = 'More actions', trigger, align = 'right' }: { items: MenuItem[]; label?: string; trigger?: ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    requestAnimationFrame(() => itemRefs.current.find((el) => el && !el.hasAttribute('aria-disabled'))?.focus());
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    const list = itemRefs.current.filter(Boolean) as HTMLElement[];
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      list[(i + 1) % list.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      list[(i - 1 + list.length) % list.length]?.focus();
    } else if (e.key === 'Tab') setOpen(false);
  };

  const itemClass = (it: MenuItem) =>
    cn('flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] outline-none focus:bg-sand-100 hover:bg-sand-100', it.danger ? 'text-red-700' : 'text-ink', it.disabled && 'pointer-events-none opacity-40');

  return (
    <div ref={wrap} className="relative inline-block">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={trigger ? undefined : label}
        title={trigger ? undefined : label}
        onClick={() => setOpen((v) => !v)}
        className={cn('inline-flex items-center justify-center rounded-lg text-ink-soft hover:bg-sand-100 hover:text-ink', trigger ? 'gap-2 px-1.5 py-1' : 'h-8 w-8')}
      >
        {trigger ?? <MoreHorizontal className="h-4 w-4" aria-hidden />}
      </button>
      {open && (
        <div
          id={id}
          role="menu"
          aria-label={label}
          onKeyDown={onKey}
          className={cn('absolute z-40 mt-1 min-w-[12rem] animate-pop-in rounded-lg border border-sand-200 bg-white p-1 shadow-lift', align === 'right' ? 'right-0' : 'left-0')}
        >
          {items.map((it, i) => {
            const ref = (el: HTMLElement | null) => (itemRefs.current[i] = el);
            const content = (
              <>
                {it.icon}
                {it.label}
              </>
            );
            if (it.to)
              return (
                <Link key={i} ref={ref} to={it.to} role="menuitem" className={itemClass(it)} onClick={() => setOpen(false)}>
                  {content}
                </Link>
              );
            if (it.href)
              return (
                <a key={i} ref={ref} href={it.href} target="_blank" rel="noreferrer" role="menuitem" className={itemClass(it)} onClick={() => setOpen(false)}>
                  {content}
                </a>
              );
            return (
              <button
                key={i}
                ref={ref}
                type="button"
                role="menuitem"
                aria-disabled={it.disabled || undefined}
                className={itemClass(it)}
                onClick={() => {
                  setOpen(false);
                  it.onSelect?.();
                }}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ToastViewport() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismissToast);
  return (
    <section aria-label="Notifications" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
      <div aria-live="polite" className="flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'} className="pointer-events-auto flex animate-pop-in items-start gap-2.5 rounded-lg border border-sand-200 bg-white px-3.5 py-3 text-[13px] shadow-lift">
            {t.tone === 'success' && <CheckCircle2 className="mt-px h-4 w-4 shrink-0 text-emerald-700" aria-hidden />}
            {t.tone === 'error' && <XCircle className="mt-px h-4 w-4 shrink-0 text-red-700" aria-hidden />}
            {t.tone === 'info' && <Info className="mt-px h-4 w-4 shrink-0 text-sky-700" aria-hidden />}
            <p className="flex-1 text-ink">{t.message}</p>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss notification" className="rounded p-0.5 text-ink-muted hover:text-ink">
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
