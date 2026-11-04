import type { AdjustmentMode, AdjustmentReason, AdminUser, CategoryWithCount, InventoryRow, MediaAsset, Product, ProductStatus, Settings, StockAdjustment } from '@/types';

// Wire shapes for the admin endpoints. The backend maps rows into the admin's own Product/Category/
// MediaAsset shapes (backend/src/mappers.ts), so these mostly describe envelopes and request bodies.

export interface ListEnvelope<T> {
  items: T[];
  total?: number;
}

export type ProductListResponse = ListEnvelope<Product>;
export type CategoryListResponse = ListEnvelope<CategoryWithCount>;
export type MediaListResponse = ListEnvelope<MediaAsset>;

/** `POST /api/admin/auth/login` and `GET /api/admin/auth/me` */
export interface OwnerResponse {
  owner: AdminUser;
  csrfToken: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

/** Query accepted by `GET /api/admin/products`. */
export interface AdminProductListParams {
  q?: string;
  status?: ProductStatus;
}

/** `PATCH /api/admin/products/:id/status` */
export interface StatusRequest {
  status: ProductStatus;
}

/**
 * `POST /api/admin/media` — the current backend accepts base64 JSON. The client also supports
 * FormData for when the endpoint gains multipart handling.
 */
export interface MediaUploadRequest {
  fileName: string;
  mimeType: string;
  base64: string;
  width: number | null;
  height: number | null;
  alt: { en: string };
}

export type InventoryListResponse = ListEnvelope<InventoryRow>;
export type AdjustmentListResponse = ListEnvelope<StockAdjustment>;

export interface InventoryAdjustRequest {
  variantId: string;
  mode: AdjustmentMode;
  quantity: number;
  reason: AdjustmentReason;
  note: string;
}

export type SettingsResponse = Settings;

/** Error envelope every endpoint uses on failure. */
export interface ApiErrorResponse {
  error: { code: string; message: string; issues: Array<{ path: string; message: string }> };
}
