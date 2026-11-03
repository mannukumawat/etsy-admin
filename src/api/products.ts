import type { Product, ProductStatus } from '@/types';
import type { ProductInput } from '@/types';
import { apiClient } from './client';
import { API_BASE_URL } from './config';
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

/** Download blank import template Excel. */
export function downloadImportTemplate(): void {
  const url = `${API_BASE_URL}/api/admin/products/template`;
  void fetch(url, { credentials: 'include' })
    .then((r) => r.blob())
    .then((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'product-import-template.xlsx';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    });
}

/** Trigger Excel download — opens the export URL directly in the browser tab. */
export function exportProductsExcel(): void {
  const csrfMatch = document.cookie.match(/(?:^|; )ys_csrf=([^;]*)/);
  const csrf = csrfMatch ? decodeURIComponent(csrfMatch[1]) : '';
  // GET export: no CSRF needed, open as download
  const url = `${API_BASE_URL}/api/admin/products/export`;
  const a = document.createElement('a');
  a.href = url;
  a.download = 'products-export.xlsx';
  // Pass CSRF via query for GET (server reads header, so we use fetch + blob instead)
  void fetch(url, { credentials: 'include', headers: csrf ? { 'x-csrf-token': csrf } : {} })
    .then((r) => r.blob())
    .then((blob) => {
      const blobUrl = URL.createObjectURL(blob);
      a.href = blobUrl;
      a.click();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    });
}

/** Delete every product and all related data (variants, options, images, specs). */
export function deleteAllProducts(): Promise<{ ok: boolean }> {
  return apiClient.delete<{ ok: boolean }>('/api/admin/products/all');
}

export interface ImportResult { imported: number; categories: number; variants: number; }

/** Upload xlsx file and bulk-import products. */
export async function importProductsExcel(file: File): Promise<ImportResult> {
  const fd = new FormData();
  fd.append('file', file);
  return apiClient.post<ImportResult>('/api/admin/products/import', fd);
}
