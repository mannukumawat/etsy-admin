import { apiClient } from './client';

export interface AdminWalletTransaction {
  id: string;
  customerId: string;
  type: string;
  amountPaise: number;
  balanceAfter: number;
  reference: string;
  orderId: string | null;
  topupId: string | null;
  note: string | null;
  createdAt: string;
}

export interface AdminWalletTransactionList {
  items: AdminWalletTransaction[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface AdminWalletCustomer {
  customerId: string;
  balancePaise: number;
  transactions: AdminWalletTransactionList;
}

export interface AdminWalletTopup {
  id: string;
  amountPaise: number;
  razorpayOrderId: string;
  razorpayPaymentId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminWalletTopupList {
  items: AdminWalletTopup[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export function fetchCustomerWallet(customerId: string, page = 1, signal?: AbortSignal): Promise<AdminWalletCustomer> {
  return apiClient.get<AdminWalletCustomer>(`/api/admin/wallet/customers/${encodeURIComponent(customerId)}`, { query: { page }, signal });
}

export function fetchCustomerTopups(customerId: string, page = 1, signal?: AbortSignal): Promise<AdminWalletTopupList> {
  return apiClient.get<AdminWalletTopupList>(`/api/admin/wallet/topups/${encodeURIComponent(customerId)}`, { query: { page }, signal });
}
