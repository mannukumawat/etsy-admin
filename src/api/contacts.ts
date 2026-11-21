import { apiClient } from './client';

export type ContactStatus = 'unread' | 'read' | 'replied';

export interface AdminContact {
  id: string;
  name: string;
  email: string;
  subject: string;
  orderNumber: string | null;
  message: string;
  status: ContactStatus;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminContactList {
  items: AdminContact[];
  total: number;
  page: number;
  pages: number;
}

export function listContacts(params?: { status?: string; page?: number; q?: string }) {
  return apiClient.get<AdminContactList>('/api/admin/contacts', { query: params });
}

export function getContact(id: string) {
  return apiClient.get<AdminContact>(`/api/admin/contacts/${id}`);
}

export function updateContact(id: string, data: { status?: ContactStatus; note?: string | null }) {
  return apiClient.patch<AdminContact>(`/api/admin/contacts/${id}`, data);
}

export function deleteContact(id: string) {
  return apiClient.delete<{ ok: boolean }>(`/api/admin/contacts/${id}`);
}
