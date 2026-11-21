import type { Product, ProductStatus } from '@/types';
import type { ProductInput } from '@/types';
import { apiClient } from './client';
import { API_BASE_URL } from './config';
import type { AdminProductListParams, ProductListResponse, StatusRequest } from './types';

// Owner-only product endpoints. Every call carries the session cookie via the central client.

export async function fetchProducts(params: AdminProductListParams = {}, signal?: AbortSignal): Promise<ProductListResponse> {
  return apiClient.get<ProductListResponse>('/api/admin/products', { query: { ...params }, signal });
}

/** H16: server-side slug/SKU uniqueness check (single source of truth — the client-side
 *  list is paged, so it cannot see clashes beyond the loaded page). */
export function checkAvailability(params: { slug?: string; skus?: string[]; excludeId?: string }): Promise<AvailabilityResult> {
  // The server takes skus as one comma-separated query value.
  return apiClient.get<AvailabilityResult>('/api/admin/products/check-availability', {
    query: { slug: params.slug, skus: params.skus?.join(','), excludeId: params.excludeId },
  });
}

export interface AvailabilityResult {
  slugAvailable: boolean;
  slugUsedBy: string | null;
  skuClashes: { sku: string; usedBy: string }[];
}

/** H17: duplicate a product on the server (copy is a draft with a fresh slug and SKUs). */
export function duplicateProduct(id: string): Promise<Product> {
  return apiClient.post<Product>(`/api/admin/products/${encodeURIComponent(id)}/duplicate`);
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

/** Download blank import template Excel. Throws with the server's message on failure (never saves an error body as a file). */
export async function downloadImportTemplate(): Promise<void> {
  const url = `${API_BASE_URL}/api/admin/products/template`;
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error(await downloadErrorMessage(response, 'Could not download the import template.'));
  const blob = await response.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'product-import-template.xlsx';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** Trigger Excel download — fetches the export with the session cookie and saves the
 *  returned file. H6: the current list filters are passed through so the export matches what is shown.
 *  L-P3: no CSRF header is sent — this is a GET, and the server only checks CSRF on
 *  state-changing requests (see backend csrf.middleware: GET is a no-op). The old code
 *  read the CSRF cookie and attached it anyway, contradicting its own comment that
 *  the export "opens the URL directly in the browser tab" (it never did — it fetches
 *  a blob). */
export async function exportProductsExcel(params: AdminProductListParams = {}): Promise<void> {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') query.set(k, String(v));
  const url = `${API_BASE_URL}/api/admin/products/export${query.size ? `?${query}` : ''}`;
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error(await downloadErrorMessage(response, 'Could not export products.'));
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = 'products-export.xlsx';
  a.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
}

async function downloadErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.clone().json()) as { error?: { message?: string } };
    if (body?.error?.message) return body.error.message;
  } catch {
    // Not JSON — fall through to the status text.
  }
  return `${fallback} (${response.status} ${response.statusText})`;
}

/** H7: delete products. With filters, only the filtered set is deleted; without them the
 *  whole catalogue is deleted. Media files and inventory history are deliberately kept
 *  (media can be shared; history is an audit trail) — see the backend's deleteAllProducts. */
export function deleteAllProducts(params: AdminProductListParams = {}): Promise<{ ok: boolean; deleted: number }> {
  return apiClient.delete<{ ok: boolean; deleted: number }>('/api/admin/products/all', { query: { ...params } });
}

export interface ImportRowError { row: number; field: string; message: string; }

export interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  categories: number;
  variants: number;
  errors: ImportRowError[];
}

/** Upload xlsx file and bulk-import products. */
export async function importProductsExcel(file: File): Promise<ImportResult> {
  const fd = new FormData();
  fd.append('file', file);
  return apiClient.post<ImportResult>('/api/admin/products/import', fd);
}
