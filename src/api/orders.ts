import type { FulfilmentStatus, ListQuery, ListResult, Order } from '@/types';
import { apiClient } from './client';

// Owner-only order management. The fulfilment state machine and payment rules are enforced server-side
// (backend/src/routes/adminOrders.ts), mirroring utils/orderRules.ts exactly.

export async function fetchOrders(query: ListQuery = {}, signal?: AbortSignal): Promise<ListResult<Order>> {
  return apiClient.get<ListResult<Order>>('/api/admin/orders', {
    query: {
      q: query.q,
      fulfilment: query.filters?.fulfilment,
      payment: query.filters?.payment,
      currency: query.filters?.currency,
      customer: query.filters?.customer,
      from: query.filters?.from,
      to: query.filters?.to,
      pending: query.filters?.pending,
      paidOnly: query.filters?.paidOnly,
      sort: query.sort,
      dir: query.dir,
      page: query.page,
      pageSize: query.pageSize,
    },
    signal,
  });
}

export function fetchOrder(id: string, signal?: AbortSignal): Promise<Order> {
  return apiClient.get<Order>(`/api/admin/orders/${encodeURIComponent(id)}`, { signal });
}

export function advanceOrder(id: string, to: FulfilmentStatus, tracking?: { carrier: string; trackingNumber: string; trackingUrl?: string }): Promise<Order> {
  return apiClient.patch<Order>(`/api/admin/orders/${encodeURIComponent(id)}/advance`, { to, ...tracking });
}

export function updateOrderTracking(id: string, tracking: { carrier: string; trackingNumber: string; trackingUrl?: string }): Promise<Order> {
  return apiClient.patch<Order>(`/api/admin/orders/${encodeURIComponent(id)}/tracking`, tracking);
}

export function cancelOrder(id: string, input: { restock: boolean; refund: boolean; reason: string }): Promise<Order> {
  return apiClient.post<Order>(`/api/admin/orders/${encodeURIComponent(id)}/cancel`, input);
}

/** L-I6: restock a cancelled order that was cancelled without restock. */
export function restockOrder(id: string): Promise<Order> {
  return apiClient.post<Order>(`/api/admin/orders/${encodeURIComponent(id)}/restock`, {});
}

export type RefundMethod = 'original' | 'manual_bank' | 'manual_upi' | 'store_credit';

export function refundOrder(
  id: string,
  input: { amount: number; reason: string; method: RefundMethod; reference?: string; note?: string },
): Promise<Order> {
  return apiClient.post<Order>(`/api/admin/orders/${encodeURIComponent(id)}/refund`, input);
}

/** Verify a pending manual (bank/UPI) refund: only now do the order totals move. */
export function verifyRefund(id: string, refundId: string): Promise<Order> {
  return apiClient.post<Order>(`/api/admin/orders/${encodeURIComponent(id)}/refunds/${encodeURIComponent(refundId)}/verify`, {});
}

export function markOrderPaid(id: string): Promise<Order> {
  return apiClient.post<Order>(`/api/admin/orders/${encodeURIComponent(id)}/mark-paid`, {});
}

export function addOrderNote(id: string, body: string): Promise<Order> {
  return apiClient.post<Order>(`/api/admin/orders/${encodeURIComponent(id)}/notes`, { body });
}
