import { apiClient } from './client';

export interface ReturnEvent {
  id: string;
  type: string;
  actor: string;
  message: string | null;
  createdAt: string;
}

export interface ReturnRefund {
  id: string;
  amount: number;
  method: string;
  status: string;
  reference: string | null;
  note: string | null;
  recordedBy: string | null;
  completedAt: string | null;
  failedAt: string | null;
  createdAt: string;
}

export interface AdminReturn {
  id: string;
  reference: string;
  orderId: string;
  lineId: string;
  variantId: string;
  requestedQty: number;
  approvedQty: number | null;
  receivedQty: number | null;
  acceptedQty: number | null;
  restockQty: number | null;
  reason: string;
  customerNote: string | null;
  adminNote: string | null;
  rejectionReason: string | null;
  photos: string[];
  status: string;
  shippingMethod: string | null;
  customerCarrier: string | null;
  customerTracking: string | null;
  pickupAddress: string | null;
  returnCarrier: string | null;
  returnTracking: string | null;
  refundableAmount: number;
  shippingFee: number;
  refundAmount: number | null;
  returnWindowDays: number;
  requestedAt: string;
  decidedAt: string | null;
  receivedAt: string | null;
  inspectedAt: string | null;
  refundedAt: string | null;
  events: ReturnEvent[];
  refund: ReturnRefund | null;
}

export interface AdminReturnList {
  items: AdminReturn[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  statusCounts: Record<string, number>;
}

export interface AdminReturnQuery {
  q?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export function fetchReturns(query: AdminReturnQuery, signal?: AbortSignal): Promise<AdminReturnList> {
  return apiClient.get<AdminReturnList>('/api/admin/returns', { query: { ...query }, signal });
}

export function fetchReturn(id: string, signal?: AbortSignal): Promise<AdminReturn> {
  return apiClient.get<AdminReturn>(`/api/admin/returns/${encodeURIComponent(id)}`, { signal });
}

export function approveReturn(id: string, data: { approvedQty: number; shippingFee?: number; note?: string }): Promise<AdminReturn> {
  return apiClient.patch<AdminReturn>(`/api/admin/returns/${encodeURIComponent(id)}/approve`, data);
}

export function rejectReturn(id: string, data: { reason: string }): Promise<AdminReturn> {
  return apiClient.patch<AdminReturn>(`/api/admin/returns/${encodeURIComponent(id)}/reject`, data);
}

export function arrangePickup(id: string, data: { pickupAddress: string; carrier?: string; note?: string }): Promise<AdminReturn> {
  return apiClient.patch<AdminReturn>(`/api/admin/returns/${encodeURIComponent(id)}/arrange-pickup`, data);
}

export function confirmShipping(id: string, data: { carrier: string; tracking: string }): Promise<AdminReturn> {
  return apiClient.patch<AdminReturn>(`/api/admin/returns/${encodeURIComponent(id)}/shipping`, data);
}

export function receiveReturn(id: string, data: { receivedQty: number; note?: string }): Promise<AdminReturn> {
  return apiClient.patch<AdminReturn>(`/api/admin/returns/${encodeURIComponent(id)}/receive`, data);
}

export function inspectReturn(id: string, data: { acceptedQty: number; rejectedQty: number; restockAccepted: boolean; note?: string }): Promise<AdminReturn> {
  return apiClient.patch<AdminReturn>(`/api/admin/returns/${encodeURIComponent(id)}/inspect`, data);
}

export function processRefund(id: string, data: { amount: number; method: string; reference?: string; note?: string }): Promise<AdminReturn> {
  return apiClient.post<AdminReturn>(`/api/admin/returns/${encodeURIComponent(id)}/refund`, data);
}

export function addReturnNote(id: string, data: { body: string }): Promise<AdminReturn> {
  return apiClient.post<AdminReturn>(`/api/admin/returns/${encodeURIComponent(id)}/notes`, data);
}
