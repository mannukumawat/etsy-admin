import type { CategoryWithCount } from '@/types';
import type { CategoryInput } from '@/services/catalogServices';
import { apiClient } from './client';
import type { CategoryListResponse } from './types';

export async function fetchCategories(signal?: AbortSignal): Promise<CategoryWithCount[]> {
  const { items } = await apiClient.get<CategoryListResponse>('/api/admin/categories', { signal });
  return items;
}

export function createCategory(input: CategoryInput): Promise<CategoryWithCount> {
  return apiClient.post<CategoryWithCount>('/api/admin/categories', input);
}

export function updateCategory(id: string, input: CategoryInput): Promise<CategoryWithCount> {
  return apiClient.put<CategoryWithCount>(`/api/admin/categories/${encodeURIComponent(id)}`, input);
}
