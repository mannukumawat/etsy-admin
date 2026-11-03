import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ListQuery } from '@/types';

/**
 * List state (search, filters, sort, page) lives in the URL so filtered views are shareable and
 * dashboard cards can deep-link to them, e.g. /orders?fulfilment=unfulfilled&payment=paid.
 */
export function useListParams(filterKeys: string[], defaults: { sort?: string; dir?: 'asc' | 'desc'; pageSize?: number } = {}) {
  const [params, setParams] = useSearchParams();

  const query = useMemo<ListQuery>(() => {
    const filters: Record<string, string | undefined> = {};
    for (const k of filterKeys) filters[k] = params.get(k) ?? undefined;
    const dir = params.get('dir');
    return {
      q: params.get('q') ?? '',
      page: Math.max(1, Number(params.get('page')) || 1),
      pageSize: defaults.pageSize ?? 20,
      sort: params.get('sort') ?? defaults.sort,
      dir: dir === 'asc' || dir === 'desc' ? dir : defaults.dir,
      filters,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const update = useCallback(
    (patch: Record<string, string | number | null | undefined>, resetPage = true) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === undefined || v === '' || v === 'all') next.delete(k);
            else next.set(k, String(v));
          }
          if (resetPage && !('page' in patch)) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const toggleSort = useCallback(
    (key: string) => {
      const same = query.sort === key;
      update({ sort: key, dir: same && query.dir === 'asc' ? 'desc' : 'asc' });
    },
    [query.sort, query.dir, update],
  );

  const activeFilters = filterKeys.filter((k) => !!params.get(k)).length + (params.get('q') ? 1 : 0);
  const clear = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams]);
  const key = params.toString();

  return { query, params, update, toggleSort, activeFilters, clear, key };
}
