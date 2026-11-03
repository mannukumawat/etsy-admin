import { useEffect, useId, useState, type ReactNode } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { useDebounced } from '@/hooks/misc';
import { cn } from '@/utils/misc';

export interface FilterDef {
  key: string;
  label: string;
  options: Array<{ value: string; label: string }>;
}

interface FilterBarProps {
  search: string;
  onSearch: (q: string) => void;
  searchPlaceholder: string;
  filters?: FilterDef[];
  values?: Record<string, string | undefined>;
  onFilter?: (key: string, value: string) => void;
  activeCount?: number;
  onClear?: () => void;
  children?: ReactNode;
}

/** Search box (debounced) + filter selects + clear. Lives at the top of a list card. */
export function FilterBar({ search, onSearch, searchPlaceholder, filters = [], values = {}, onFilter, activeCount = 0, onClear, children }: FilterBarProps) {
  const id = useId();
  const [text, setText] = useState(search);
  const debounced = useDebounced(text, 300);
  useEffect(() => {
    setText(search);
  }, [search]);
  useEffect(() => {
    if (debounced !== search) onSearch(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return (
    <div className="flex flex-col gap-2 border-b border-sand-200 px-4 py-3 lg:flex-row lg:items-center">
      <div className="relative min-w-0 flex-1 lg:max-w-sm">
        <label htmlFor={`${id}-q`} className="sr-only">
          {searchPlaceholder}
        </label>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
        <input id={`${id}-q`} type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={searchPlaceholder} className="input h-9 pl-9" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <div key={f.key} className="relative">
            <label htmlFor={`${id}-${f.key}`} className="sr-only">
              {f.label}
            </label>
            <select
              id={`${id}-${f.key}`}
              value={values[f.key] ?? 'all'}
              onChange={(e) => onFilter?.(f.key, e.target.value)}
              className={cn('input h-9 appearance-none py-1 pr-8 text-[13px]', values[f.key] && 'border-brand-600 bg-brand-50/40')}
            >
              <option value="all">{f.label}: all</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {f.label}: {o.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" aria-hidden />
          </div>
        ))}
        {children}
        {activeCount > 0 && onClear && (
          <button type="button" onClick={onClear} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-[13px] font-medium text-brand-700 hover:bg-brand-50">
            <X className="h-3.5 w-3.5" aria-hidden /> Clear ({activeCount})
          </button>
        )}
      </div>
    </div>
  );
}
