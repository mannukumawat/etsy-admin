import { useCallback, useEffect, useReducer, useRef } from 'react';
import { onReset } from '@/services/db';

// Small query cache: dedupes requests, keeps stale data visible while refetching, and lets mutations
// invalidate mounted queries. Swap for TanStack Query when a real API arrives.

interface Entry {
  status: 'loading' | 'success' | 'error';
  data?: unknown;
  error?: unknown;
  fetcher: () => Promise<unknown>;
  token: number;
}

const cache = new Map<string, Entry>();
const subscribers = new Map<string, Set<() => void>>();
let tokenSeq = 0;

function notify(key: string) {
  subscribers.get(key)?.forEach((fn) => fn());
}

function load(key: string, fetcher: () => Promise<unknown>) {
  const prev = cache.get(key);
  const token = ++tokenSeq;
  cache.set(key, { status: 'loading', data: prev?.data, fetcher, token });
  notify(key);
  fetcher().then(
    (data) => {
      if (cache.get(key)?.token !== token) return;
      cache.set(key, { status: 'success', data, fetcher, token });
      notify(key);
    },
    (error) => {
      if (cache.get(key)?.token !== token) return;
      cache.set(key, { status: 'error', error, data: prev?.data, fetcher, token });
      notify(key);
    },
  );
}

/** Refetch mounted queries whose key starts with any prefix; drop unmounted ones. No prefixes = everything. */
export function invalidate(...prefixes: string[]) {
  for (const [key, entry] of [...cache.entries()]) {
    if (prefixes.length && !prefixes.some((p) => key.startsWith(p))) continue;
    if (subscribers.get(key)?.size) load(key, entry.fetcher);
    else cache.delete(key);
  }
}

// Demo data reset: everything cached is stale.
onReset(() => invalidate());

export interface QueryResult<T> {
  data: T | undefined;
  error: unknown;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useQuery<T>(key: string | null, fetcher: () => Promise<T>, options: { keepPrevious?: boolean } = {}): QueryResult<T> {
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const lastData = useRef<T | undefined>(undefined);

  useEffect(() => {
    if (!key) return;
    const set = subscribers.get(key) ?? new Set();
    set.add(rerender);
    subscribers.set(key, set);
    if (!cache.has(key)) load(key, () => fetcherRef.current());
    else rerender();
    return () => {
      set.delete(rerender);
    };
  }, [key]);

  const entry = key ? cache.get(key) : undefined;
  let data = entry?.data as T | undefined;
  if (data !== undefined) lastData.current = data;
  else if (options.keepPrevious) data = lastData.current;

  const refetch = useCallback(() => {
    if (key) load(key, () => fetcherRef.current());
  }, [key]);

  const status = entry?.status ?? (key ? 'loading' : 'success');
  return {
    data,
    error: entry?.error,
    isLoading: status === 'loading' && data === undefined,
    isFetching: status === 'loading',
    isError: status === 'error' && entry?.data === undefined,
    refetch,
  };
}
