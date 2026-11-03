import type { CustomerDetail, CustomerSummary, ListQuery, ListResult } from '@/types';
import { apiClient } from './client';

export async function fetchCustomers(query: ListQuery = {}, signal?: AbortSignal): Promise<ListResult<CustomerSummary>> {
  return apiClient.get<ListResult<CustomerSummary>>('/api/admin/customers', {
    query: { q: query.q, kind: query.filters?.kind, sort: query.sort, dir: query.dir, page: query.page, pageSize: query.pageSize },
    signal,
  });
}

export function fetchCustomer(id: string, signal?: AbortSignal): Promise<CustomerDetail> {
  return apiClient.get<CustomerDetail>(`/api/admin/customers/${encodeURIComponent(id)}`, { signal });
}
