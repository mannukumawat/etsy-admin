import type { Product, ProductStatus } from '@/types';
import type { ProductInput } from '@/types';
import { apiClient } from './client';
import type { AdminProductListParams, ProductListResponse, StatusRequest } from './types';

// Owner-only product endpoints. Every call carries the session cookie via the central client.

export async function fetchProducts(params: AdminProductListParams = {}, signal?: AbortSignal): Promise<Product[]> {
  const { items } = await apiClient.get<ProductListResponse>('/api/admin/products', { query: { ...params }, signal });
  return items;
}

export function fetchProduct(id: string, signal?: AbortSignal): Promise<Product> {
  return apiClient.get<Product>(`/api/admin/products/${encodeURIComponent(id)}`, { signal });
}

export function createProduct(input: ProductInput, status: ProductStatus): Promise<Product> {
  return apiClient.post<Product>('/api/admin/products', { ...input, status });
}

export function updateProduct(id: string, input: ProductInput, status: ProductStatus): Promise<Product> {
  return apiClient.put<Product>(`/api/admin/products/${encodeURIComponent(id)}`, { ...input, status });
}

/** Publish / unpublish / archive. The server re-checks the publish rules. */
export function updateProductStatus(id: string, status: ProductStatus): Promise<Product> {
  return apiClient.patch<Product>(`/api/admin/products/${encodeURIComponent(id)}/status`, { status } satisfies StatusRequest);
}
