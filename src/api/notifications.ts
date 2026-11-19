import { apiClient } from './client';

export interface NotificationItem {
  id: string;
  kind: 'customer' | 'owner';
  recipientId: string;
  event: string;
  title: string;
  body: string;
  link: string;
  isRead: boolean;
  pushStatus: string;
  createdAt: string;
}

export interface NotificationPage {
  items: NotificationItem[];
  nextCursor: string | null;
}

export interface NotificationSendRecord {
  id: string;
  title: string;
  body: string;
  recipientType: 'one' | 'all';
  recipientId: string | null;
  successCount: number;
  failCount: number;
  sentAt: string;
}

export function fetchOwnerNotifications(cursor?: string, limit = 20, signal?: AbortSignal): Promise<NotificationPage> {
  return apiClient.get<NotificationPage>('/api/admin/notifications', {
    query: { cursor, limit },
    signal,
  });
}

export function fetchOwnerUnreadCount(signal?: AbortSignal): Promise<{ count: number }> {
  return apiClient.get<{ count: number }>('/api/admin/notifications/unread-count', { signal });
}

export function markOwnerNotificationRead(id: string): Promise<{ ok: boolean }> {
  return apiClient.patch<{ ok: boolean }>(`/api/admin/notifications/${encodeURIComponent(id)}/read`, {});
}

export function markAllOwnerNotificationsRead(): Promise<{ ok: boolean }> {
  return apiClient.post<{ ok: boolean }>('/api/admin/notifications/read-all', {});
}

export interface SendNotificationInput {
  customerId: string | null;
  title: string;
  body: string;
  link?: string;
}

export function sendNotification(input: SendNotificationInput): Promise<{ recipientCount: number; sendId: string }> {
  return apiClient.post<{ recipientCount: number; sendId: string }>('/api/admin/notifications/send', input);
}

export function fetchNotificationSends(signal?: AbortSignal): Promise<NotificationSendRecord[]> {
  return apiClient.get<NotificationSendRecord[]>('/api/admin/notifications/sends', { signal });
}
