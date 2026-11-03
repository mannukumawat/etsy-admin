import type { Coupon, CouponInput, CouponState } from '@/types';
import { apiClient } from './client';

export async function fetchCoupons(signal?: AbortSignal): Promise<Array<Coupon & { state: CouponState }>> {
  const { items } = await apiClient.get<{ items: Array<Coupon & { state: CouponState }> }>('/api/admin/coupons', { signal });
  return items;
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
