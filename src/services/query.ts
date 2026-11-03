import type { ListQuery, ListResult } from '@/types';

// Generic list handling that mirrors what the future API will do server-side: search, filter, sort, paginate.

export interface ListConfig<T> {
  search: (item: T) => string;
  sorts: Record<string, (item: T) => string | number>;
  filters?: Record<string, (item: T, value: string) => boolean>;
  defaultSort: string;
  defaultDir?: 'asc' | 'desc';
}

export const DEFAULT_PAGE_SIZE = 20;

export function runList<T>(items: T[], query: ListQuery, cfg: ListConfig<T>): ListResult<T> {
  let rows = items;
  const q = query.q?.trim().toLowerCase();
  if (q) {
    const tokens = q.split(/\s+/);
    rows = rows.filter((r) => {
      const hay = cfg.search(r).toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }
  for (const [key, value] of Object.entries(query.filters ?? {})) {
    const fn = cfg.filters?.[key];
    if (fn && value !== undefined && value !== '' && value !== 'all') rows = rows.filter((r) => fn(r, value));
  }
  const sortKey = query.sort && cfg.sorts[query.sort] ? query.sort : cfg.defaultSort;
  const dir = query.dir ?? (query.sort ? 'asc' : (cfg.defaultDir ?? 'asc'));
  const accessor = cfg.sorts[sortKey];
  rows = [...rows].sort((a, b) => {
    const x = accessor(a);
    const y = accessor(b);
    const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { numeric: true });
    return dir === 'desc' ? -cmp : cmp;
  });
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE));
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(pageCount, Math.max(1, query.page ?? 1));
  return { items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize, pageCount };
}
