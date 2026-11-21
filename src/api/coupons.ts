import type { Coupon, CouponInput, CouponState } from '@/types';
import { apiClient } from './client';

export interface CouponList {
  items: Array<Coupon & { state: CouponState }>;
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  stateCounts?: Record<string, number>;
}

/** M-O14: server pagination + search/state filter (was: whole list, client-filtered). */
export async function fetchCoupons(params?: { q?: string; state?: string; page?: number; pageSize?: number }, signal?: AbortSignal): Promise<CouponList> {
  return apiClient.get<CouponList>('/api/admin/coupons', { query: params, signal });
}

export function createCoupon(input: CouponInput): Promise<Coupon & { state: CouponState }> {
  return apiClient.post<Coupon & { state: CouponState }>('/api/admin/coupons', input);
}

export function updateCoupon(id: string, input: CouponInput): Promise<Coupon & { state: CouponState }> {
  return apiClient.put<Coupon & { state: CouponState }>(`/api/admin/coupons/${encodeURIComponent(id)}`, input);
}

export function deleteCoupon(id: string): Promise<void> {
  return apiClient.delete<void>(`/api/admin/coupons/${encodeURIComponent(id)}`);
}

export async function fetchCouponUses(code: string, email: string, signal?: AbortSignal): Promise<number> {
  const { uses } = await apiClient.get<{ uses: number }>('/api/admin/coupons/uses', { query: { code, email }, signal });
  return uses;
}
