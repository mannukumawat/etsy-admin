import { apiClient } from './client';

export type PaymentRecoveryStatus = 'unmatched' | 'resolved';

export interface PaymentRecovery {
  id: string;
  razorpayPaymentId: string;
  razorpayOrderId: string | null;
  amount: number;
  currency: string;
  customerEmail: string | null;
  status: PaymentRecoveryStatus;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export function listPaymentRecoveries(status?: PaymentRecoveryStatus): Promise<PaymentRecovery[]> {
  return apiClient.get<PaymentRecovery[]>('/api/admin/payment-recoveries', { query: { status } });
}

export function resolvePaymentRecovery(id: string, note: string): Promise<{ ok: boolean }> {
  return apiClient.post<{ ok: boolean }>(`/api/admin/payment-recoveries/${encodeURIComponent(id)}/resolve`, { note });
}
