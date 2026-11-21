import type { StockAdjustment } from '@/types';
import { apiClient } from './client';
import { API_BASE_URL } from './config';
import type { AdjustmentListResponse, InventoryAdjustRequest, InventoryListResponse } from './types';

// Owner-only inventory endpoints. M-I1: search/sort/paging/filtering are server-side —
// the admin passes q + filters and the backend pages, so a visit no longer downloads
// the whole catalogue (or a hard-capped 500-row history).

export interface InventoryQuery {
  q?: string;
  stock?: string;
  category?: string;
  status?: string;
  sort?: string;
  dir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export function fetchInventory(query: InventoryQuery = {}, signal?: AbortSignal): Promise<InventoryListResponse> {
  return apiClient.get<InventoryListResponse>('/api/admin/inventory', { query: { ...query }, signal });
}

export function adjustStock(input: InventoryAdjustRequest): Promise<StockAdjustment> {
  return apiClient.post<StockAdjustment>('/api/admin/inventory/adjust', input);
}

export interface AdjustmentHistoryQuery {
  variantId?: string;
  q?: string;
  reason?: string;
  actor?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export function fetchAdjustmentHistory(filter: AdjustmentHistoryQuery = {}, signal?: AbortSignal): Promise<AdjustmentListResponse> {
  return apiClient.get<AdjustmentListResponse>('/api/admin/inventory/history', { query: { ...filter }, signal });
}

/** Download the filtered adjustment history as CSV. Throws with the server's message on failure. */
export async function downloadAdjustmentHistoryCsv(filter: Omit<AdjustmentHistoryQuery, 'page' | 'pageSize'>): Promise<void> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) if (v !== undefined && v !== '') params.set(k, String(v));
  const response = await fetch(`${API_BASE_URL}/api/admin/inventory/history/export?${params}`, { credentials: 'include' });
  if (!response.ok) throw new Error('Could not download the adjustment history.');
  const blob = await response.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'stock-adjustments.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
