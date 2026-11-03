import { useId, useMemo, useState, type ReactNode, type Ref } from 'react';
import { Search } from 'lucide-react';
import { FieldError } from '@/components/ui/Form';
import { cn } from '@/utils/misc';

// Radio card group and a searchable checkbox list, used by the coupon and shipping forms.

export interface Choice<T extends string> {
  value: T;
  label: string;
  description?: ReactNode;
}

/** Native radio inputs (arrow keys move between options) styled as cards. Use with a react-hook-form Controller. */
export function ChoiceGroup<T extends string>({
  legend,
  value,
  onChange,
  choices,
  columns = 2,
  error,
  className,
}: {
  legend: string;
  value: T;
  onChange: (v: T) => void;
  choices: Choice<T>[];
  columns?: 2 | 3;
  error?: string;
  className?: string;
}) {
  const name = useId();
  return (
    <fieldset className={className} aria-describedby={error ? `${name}-error` : undefined}>
      <legend className="label">{legend}</legend>
      <div className={cn('grid gap-2', columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
        {choices.map((c) => {
          const id = `${name}-${c.value}`;
          const on = value === c.value;
          return (
            <label
              key={c.value}
              htmlFor={id}
              className={cn(
                'flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors focus-within:ring-2 focus-within:ring-brand-600/25',
                on ? 'border-brand-600 bg-brand-50/50' : 'border-sand-300 bg-white hover:border-ink-faint',
              )}
            >
              <input id={id} type="radio" name={name} value={c.value} checked={on} onChange={() => onChange(c.value)} className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600" />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-ink">{c.label}</span>
                {c.description && <span className="block text-xs text-ink-muted">{c.description}</span>}
              </span>
            </label>
          );
        })}
      </div>
      <FieldError id={`${name}-error`} message={error} />
    </fieldset>
  );
}

export interface ChecklistItem {
  id: string;
  label: string;
  /** Extra text matched by the search box (codes, SKUs...). */
  keywords?: string;
  meta?: ReactNode;
  disabled?: boolean;
  /** Rendered after the label, outside of it (e.g. a "Move here" button). */
  trailing?: ReactNode;
  lang?: string;
}

/** Search box + scrollable checkbox list with select/clear for the visible items. */
export function SearchableChecklist({
  legend,
  items,
  value,
  onChange,
  searchPlaceholder = 'Search',
  error,
  hint,
  emptyText = 'Nothing matches your search.',
  loading,
  inputRef,
  className,
}: {
  legend: string;
  items: ChecklistItem[];
  value: string[];
  onChange: (next: string[]) => void;
  searchPlaceholder?: string;
  error?: string;
  hint?: ReactNode;
  emptyText?: string;
  loading?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  className?: string;
}) {
  const id = useId();
  const [q, setQ] = useState('');
  const selected = useMemo(() => new Set(value), [value]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? items.filter((i) => `${i.label} ${i.keywords ?? ''}`.toLowerCase().includes(needle)) : items;
  }, [items, q]);
  const selectable = shown.filter((i) => !i.disabled);
  const allShownSelected = selectable.length > 0 && selectable.every((i) => selected.has(i.id));

  const toggle = (itemId: string) => onChange(selected.has(itemId) ? value.filter((v) => v !== itemId) : [...value, itemId]);
  const selectShown = () => {
    const next = new Set(value);
    selectable.forEach((i) => next.add(i.id));
    onChange([...next]);
  };
  const clearShown = () => {
    const drop = new Set(selectable.map((i) => i.id));
    onChange(value.filter((v) => !drop.has(v)));
  };
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <fieldset className={className} aria-describedby={describedBy}>
      <legend className="label">{legend}</legend>
      <div className={cn('overflow-hidden rounded-lg border bg-white', error ? 'border-red-700' : 'border-sand-300')}>
        <div className="flex flex-wrap items-center gap-2 border-b border-sand-200 bg-ivory-50 p-2">
          <div className="relative min-w-0 flex-1 basis-40">
            <label htmlFor={`${id}-q`} className="sr-only">
              {searchPlaceholder}
            </label>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" aria-hidden />
            <input
              ref={inputRef}
              id={`${id}-q`}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault();
              }}
              placeholder={searchPlaceholder}
              className="input h-8 py-1 pl-8 text-[13px]"
            />
          </div>
          <span className="text-xs text-ink-muted num" aria-live="polite">
            {value.length} selected
          </span>
          <button
            type="button"
            className="rounded px-1 text-xs font-medium text-brand-700 hover:underline disabled:opacity-40"
            onClick={allShownSelected ? clearShown : selectShown}
            disabled={!selectable.length}
          >
            {allShownSelected ? (q ? 'Clear shown' : 'Clear all') : q ? 'Select shown' : 'Select all'}
          </button>
        </div>
        {loading ? (
          <p className="px-3 py-4 text-center text-[13px] text-ink-muted">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="px-3 py-4 text-center text-[13px] text-ink-muted">{emptyText}</p>
        ) : (
          <ul className="max-h-64 divide-y divide-sand-200/70 overflow-y-auto scrollbar-thin">
            {shown.map((item) => {
              const cid = `${id}-i-${item.id}`;
              return (
                <li key={item.id} className={cn('flex items-center gap-3 px-3 py-2', item.disabled && 'bg-ivory-50')}>
                  <input
                    id={cid}
                    type="checkbox"
                    className="h-4 w-4 shrink-0 cursor-pointer accent-brand-600 disabled:cursor-not-allowed"
                    checked={selected.has(item.id)}
                    disabled={item.disabled}
                    onChange={() => toggle(item.id)}
                  />
                  <label htmlFor={cid} className={cn('min-w-0 flex-1', item.disabled ? 'cursor-not-allowed text-ink-muted' : 'cursor-pointer text-ink')}>
                    <span className="block truncate text-[13px] font-medium" lang={item.lang}>
                      {item.label}
                    </span>
                    {item.meta && <span className="block truncate text-xs text-ink-muted">{item.meta}</span>}
                  </label>
                  {item.trailing && <div className="shrink-0">{item.trailing}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-muted">
          {hint}
        </p>
      )}
      <FieldError id={`${id}-error`} message={error} />
    </fieldset>
  );
}
