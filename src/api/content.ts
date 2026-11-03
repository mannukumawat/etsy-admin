import type { HomepageContent, PageContent, PageDoc, PageKey, Versioned } from '@/types';
import { apiClient } from './client';

// Owner-only content endpoints. Draft save only checks that referenced products/categories/images
// EXIST; publish additionally requires them to be active — enforced server-side either way.

export function fetchHomepage(signal?: AbortSignal): Promise<Versioned<HomepageContent>> {
  return apiClient.get<Versioned<HomepageContent>>('/api/admin/content/homepage', { signal });
}

export function saveHomepageDraft(draft: HomepageContent): Promise<Versioned<HomepageContent>> {
  return apiClient.put<Versioned<HomepageContent>>('/api/admin/content/homepage', draft);
}

export function publishHomepage(): Promise<Versioned<HomepageContent>> {
  return apiClient.post<Versioned<HomepageContent>>('/api/admin/content/homepage/publish', {});
}

export function discardHomepageDraft(): Promise<Versioned<HomepageContent>> {
  return apiClient.post<Versioned<HomepageContent>>('/api/admin/content/homepage/discard', {});
}

export async function fetchPages(signal?: AbortSignal): Promise<PageDoc[]> {
  const { items } = await apiClient.get<{ items: PageDoc[] }>('/api/admin/content/pages', { signal });
  return items;
}

export function fetchPage(key: PageKey, signal?: AbortSignal): Promise<PageDoc> {
  return apiClient.get<PageDoc>(`/api/admin/content/pages/${key}`, { signal });
}

export function savePageDraft(key: PageKey, content: PageContent): Promise<PageDoc> {
  return apiClient.put<PageDoc>(`/api/admin/content/pages/${key}`, content);
}

export function publishPage(key: PageKey): Promise<PageDoc> {
  return apiClient.post<PageDoc>(`/api/admin/content/pages/${key}/publish`, {});
}

export function discardPageDraft(key: PageKey): Promise<PageDoc> {
  return apiClient.post<PageDoc>(`/api/admin/content/pages/${key}/discard`, {});
}
