import { apiClient } from './client';
import type { ItemGroup } from '@/types';

export interface ItemGroupInput {
  nameEn: string;
  nameHi: string;
  slug: string;
  position: number;
  isActive: boolean;
  imageId: string | null;
}

export async function fetchItemGroups(signal?: AbortSignal): Promise<ItemGroup[]> {
  const { items } = await apiClient.get<{ items: ItemGroup[] }>('/api/admin/item-groups', { signal });
  return items;
}

export function createItemGroup(input: ItemGroupInput): Promise<ItemGroup> {
  return apiClient.post<ItemGroup>('/api/admin/item-groups', input);
}

export function updateItemGroup(id: string, input: ItemGroupInput): Promise<ItemGroup> {
  return apiClient.put<ItemGroup>(`/api/admin/item-groups/${encodeURIComponent(id)}`, input);
}

export function deleteItemGroup(id: string): Promise<void> {
  return apiClient.delete<void>(`/api/admin/item-groups/${encodeURIComponent(id)}`);
}

export async function reorderItemGroups(ids: string[]): Promise<ItemGroup[]> {
  const { items } = await apiClient.post<{ items: ItemGroup[] }>('/api/admin/item-groups/reorder', { ids });
  return items;
}
