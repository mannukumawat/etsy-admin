import type { FulfilmentStatus, Order } from '@/types';
import { apiClient } from './client';

// Owner-only order management. The fulfilment state machine and payment rules are enforced server-side
// (backend/src/routes/adminOrders.ts), mirroring utils/orderRules.ts exactly.

export async function fetchOrders(params: { q?: string; status?: string } = {}, signal?: AbortSignal): Promise<Order[]> {
  const { items } = await apiClient.get<{ items: Order[] }>('/api/admin/orders', { query: params, signal });
  return items;
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

export function refundOrder(id: string, input: { amount: number; reason: string }): Promise<Order> {
  return apiClient.post<Order>(`/api/admin/orders/${encodeURIComponent(id)}/refund`, input);
}

export function markOrderPaid(id: string): Promise<Order> {
  return apiClient.post<Order>(`/api/admin/orders/${encodeURIComponent(id)}/mark-paid`, {});
}

export function recordCodCollection(
  id: string,
  data: { amount: number; collectedAt: string; collector: string; reference?: string; note?: string },
): Promise<Order> {
  return apiClient.post<Order>(`/api/admin/orders/${encodeURIComponent(id)}/record-cod-collection`, data);
}

export function addOrderNote(id: string, body: string): Promise<Order> {
  return apiClient.post<Order>(`/api/admin/orders/${encodeURIComponent(id)}/notes`, { body });
}
