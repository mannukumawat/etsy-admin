import { apiClient } from './client';

/** M-O10: admin API for exchanges (backend mounts /api/admin/exchanges; the admin
 *  previously had no module, page or route for it at all). */

export type ExchangeStatus = 'requested' | 'approved' | 'shipped' | 'delivered' | 'closed' | 'rejected';

export interface ExchangeEvent {
  id: string;
  type: string;
  actor: string;
  message: string;
  createdAt: string;
}

export interface AdminExchange {
  id: string;
  reference: string;
  orderId: string;
  lineId: string;
  originalVariantId: string;
  replacementVariantId: string;
  requestedQty: number;
  approvedQty: number | null;
  reason: string;
  customerNote: string | null;
  status: ExchangeStatus;
  priceDifference: number;
  exchangeWindowDays: number;
  replacementCarrier: string | null;
  replacementTracking: string | null;
  requestedAt: string;
  decidedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  closedAt: string | null;
  adminNote: string | null;
  rejectionReason: string | null;
  events: ExchangeEvent[];
}

export interface AdminExchangeList {
  items: AdminExchange[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export function fetchExchanges(params?: { status?: string; page?: number; pageSize?: number }) {
  return apiClient.get<AdminExchangeList>('/api/admin/exchanges', { query: params });
}

export function fetchExchange(id: string) {
  return apiClient.get<AdminExchange>(`/api/admin/exchanges/${encodeURIComponent(id)}`);
}

export function approveExchange(id: string, input: { approvedQty: number; note?: string }) {
  return apiClient.patch<AdminExchange>(`/api/admin/exchanges/${encodeURIComponent(id)}/approve`, input);
}

export function rejectExchange(id: string, input: { reason: string }) {
  return apiClient.patch<AdminExchange>(`/api/admin/exchanges/${encodeURIComponent(id)}/reject`, input);
}

export function shipExchange(id: string, input: { carrier: string; tracking: string }) {
  return apiClient.patch<AdminExchange>(`/api/admin/exchanges/${encodeURIComponent(id)}/ship`, input);
}

export function deliverExchange(id: string) {
  return apiClient.patch<AdminExchange>(`/api/admin/exchanges/${encodeURIComponent(id)}/deliver`, {});
}

export function closeExchange(id: string) {
  return apiClient.patch<AdminExchange>(`/api/admin/exchanges/${encodeURIComponent(id)}/close`, {});
}
