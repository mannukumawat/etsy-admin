import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/misc';
import { IconButton } from './Button';
import { ErrorState, Skeleton } from './Feedback';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Server sort key; makes the header a sort button. */
  sortKey?: string;
  align?: 'left' | 'right' | 'center';
  /** Hide on small screens to keep tables readable. */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

interface DataTableProps<T> {
  /** Accessible table caption (visually hidden). */
  caption: string;
  columns: Column<T>[];
  rows: T[] | undefined;
  getRowId: (row: T) => string;
  loading?: boolean;
  /** True while refreshing stale rows (keeps rows visible, dims them). */
  refreshing?: boolean;
  error?: unknown;
  onRetry?: () => void;
  empty?: ReactNode;
  sort?: string;
  dir?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  selected?: Set<string>;
  onSelectedChange?: (next: Set<string>) => void;
  page?: number;
  pageCount?: number;
  total?: number;
  pageSize?: number;
  onPage?: (page: number) => void;
}

const hide = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell', xl: 'hidden xl:table-cell' };
const align = { left: 'text-left', right: 'text-right', center: 'text-center' };

export function DataTable<T>(props: DataTableProps<T>) {
  const { caption, columns, rows, getRowId, loading, refreshing, error, onRetry, empty, sort, dir, onSort, selected, onSelectedChange } = props;
  const selectable = !!onSelectedChange && !!selected;
  const ids = rows?.map(getRowId) ?? [];
  const allSelected = selectable && ids.length > 0 && ids.every((id) => selected!.has(id));
  const someSelected = selectable && ids.some((id) => selected!.has(id));

  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) ids.forEach((id) => next.delete(id));
    else ids.forEach((id) => next.add(id));
    onSelectedChange!(next);
  };
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange!(next);
  };

  if (error && !rows) return <ErrorState error={error} onRetry={onRetry} />;

  return (
    <div>
      {/* `relative` is required, not decorative: a statically-positioned scroll container lets the wide table's
          overflow propagate to the page, so the whole page scrolls sideways instead of just the table. */}
      <div className="relative max-w-full overflow-x-auto scrollbar-thin">
        <table className={cn('w-full min-w-[560px] border-collapse text-left text-[13px]', refreshing && 'opacity-60 transition-opacity')} aria-busy={loading || refreshing || undefined}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-sand-200 bg-ivory-50 text-xs text-ink-muted">
              {selectable && (
                <th scope="col" className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    aria-label="Select all rows on this page"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = !allSelected && someSelected;
                    }}
                    onChange={toggleAll}
                    className="h-4 w-4 accent-brand-600"
                  />
                </th>
              )}
              {columns.map((c) => {
                const active = c.sortKey && sort === c.sortKey;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (dir === 'desc' ? 'descending' : 'ascending') : undefined}
                    className={cn('whitespace-nowrap px-3 py-2.5 font-medium first:pl-4 last:pr-4', align[c.align ?? 'left'], c.hideBelow && hide[c.hideBelow], c.className)}
                  >
                    {c.sortKey && onSort ? (
                      <button type="button" onClick={() => onSort(c.sortKey!)} className={cn('inline-flex items-center gap-1 rounded hover:text-ink', active && 'text-ink')}>
                        {c.header}
                        {active ? dir === 'desc' ? <ArrowDown className="h-3 w-3" aria-hidden /> : <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowUpDown className="h-3 w-3 opacity-40" aria-hidden />}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading && !rows
              ? Array.from({ length: 6 }, (_, i) => (
                  <tr key={i} className="border-b border-sand-200/70">
                    {selectable && <td className="px-3 py-3" />}
                    {columns.map((c) => (
                      <td key={c.key} className={cn('px-3 py-3 first:pl-4 last:pr-4', c.hideBelow && hide[c.hideBelow])}>
                        <Skeleton className="h-4 w-full max-w-[10rem]" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows?.map((row) => {
                  const id = getRowId(row);
                  const isSel = selectable && selected!.has(id);
                  return (
                    <tr key={id} className={cn('border-b border-sand-200/70 last:border-0 hover:bg-ivory-50', isSel && 'bg-brand-50/50')}>
                      {selectable && (
                        <td className="px-3 py-2.5">
                          <input type="checkbox" aria-label={`Select row ${id}`} checked={isSel} onChange={() => toggle(id)} className="h-4 w-4 accent-brand-600" />
                        </td>
                      )}
                      {columns.map((c) => (
                        <td key={c.key} className={cn('px-3 py-2.5 align-middle first:pl-4 last:pr-4', align[c.align ?? 'left'], c.hideBelow && hide[c.hideBelow], c.className)}>
                          {c.cell(row)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
      {rows && rows.length === 0 && !loading && <div className="border-t border-sand-200/70">{empty}</div>}
      {props.onPage && props.total !== undefined && props.total > 0 && <Pagination page={props.page ?? 1} pageCount={props.pageCount ?? 1} total={props.total} pageSize={props.pageSize ?? 20} onPage={props.onPage} />}
    </div>
  );
}

export function Pagination({ page, pageCount, total, pageSize, onPage }: { page: number; pageCount: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-sand-200 px-4 py-2.5 text-xs text-ink-muted">
      <p className="num">
        {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-1">
        <IconButton size="sm" label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </IconButton>
        <span className="px-1 num" aria-current="page">
          Page {page} of {pageCount}
        </span>
        <IconButton size="sm" label="Next page" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </IconButton>
      </div>
    </nav>
  );
}
