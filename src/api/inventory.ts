import type { InventoryRow, StockAdjustment } from '@/types';
import { apiClient } from './client';
import type { AdjustmentListResponse, InventoryAdjustRequest, InventoryListResponse } from './types';

// Owner-only inventory endpoints. The backend returns the whole list; search/sort/paging stay
// client-side (see services/catalogServices.ts) so the list UI behaves the same in both modes.

export async function fetchInventory(q?: string, signal?: AbortSignal): Promise<InventoryRow[]> {
  const { items } = await apiClient.get<InventoryListResponse>('/api/admin/inventory', { query: { q }, signal });
  return items;
}

export function adjustStock(input: InventoryAdjustRequest): Promise<StockAdjustment> {
  return apiClient.post<StockAdjustment>('/api/admin/inventory/adjust', input);
}

export async function fetchAdjustmentHistory(filter: { variantId?: string; q?: string } = {}, signal?: AbortSignal): Promise<StockAdjustment[]> {
  const { items } = await apiClient.get<AdjustmentListResponse>('/api/admin/inventory/history', { query: filter, signal });
  return items;
}
