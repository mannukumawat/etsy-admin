import { apiClient } from './client';

export interface AdminNavLink {
  id: string;
  label: { en: string; hi: string };
  href: string;
  position: number;
  isActive: boolean;
  productCount: number;
}

export interface NavLinkInput {
  labelEn: string;
  href: string;
  isActive: boolean;
  position: number;
}

export async function fetchNavLinks(signal?: AbortSignal): Promise<AdminNavLink[]> {
  const { items } = await apiClient.get<{ items: AdminNavLink[] }>('/api/admin/nav-links', { signal });
  return items;
}

export function createNavLink(input: NavLinkInput): Promise<AdminNavLink> {
  return apiClient.post<AdminNavLink>('/api/admin/nav-links', input);
}

export function updateNavLink(id: string, input: NavLinkInput): Promise<AdminNavLink> {
  return apiClient.put<AdminNavLink>(`/api/admin/nav-links/${encodeURIComponent(id)}`, input);
}

export function deleteNavLink(id: string): Promise<void> {
  return apiClient.delete<void>(`/api/admin/nav-links/${encodeURIComponent(id)}`);
}

export async function reorderNavLinks(ids: string[]): Promise<AdminNavLink[]> {
  const { items } = await apiClient.post<{ items: AdminNavLink[] }>('/api/admin/nav-links/reorder', { ids });
  return items;
}
