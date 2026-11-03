import { apiClient } from './client';

export interface AdminCollectionCircle {
  id: string;
  label: { en: string; hi: string };
  imageId: string | null;
  linkType: 'category' | 'collection' | 'url';
  linkValue: string;
}

export interface AdminCollectionSection {
  id: string;
  title: { en: string; hi: string };
  productIds: string[];
}

export interface AdminCollection {
  id: string;
  slug: string;
  title: { en: string; hi: string };
  subtitle: { en: string; hi: string };
  description: { en: string; hi: string };
  heroImageId: string | null;
  heroColor: string;
  status: 'draft' | 'published';
  displayOrder: number;
  showInNavigation: boolean;
  publishedAt: string | null;
  circles: AdminCollectionCircle[];
  sections: AdminCollectionSection[];
  createdAt: string;
  updatedAt: string;
}

export interface CollectionInput {
  slug: string;
  titleEn: string;
  subtitleEn: string;
  descriptionEn: string;
  heroImageId: string | null;
  heroColor: string;
  displayOrder: number;
  showInNavigation: boolean;
  circles: Array<{ labelEn: string; imageId: string | null; linkType: 'category' | 'collection' | 'url'; linkValue: string }>;
  sections: Array<{ titleEn: string; productIds: string[] }>;
}

export async function fetchCollections(signal?: AbortSignal): Promise<AdminCollection[]> {
  const { items } = await apiClient.get<{ items: AdminCollection[] }>('/api/admin/collections', { signal });
  return items;
}

export function fetchCollection(id: string, signal?: AbortSignal): Promise<AdminCollection> {
  return apiClient.get<AdminCollection>(`/api/admin/collections/${encodeURIComponent(id)}`, { signal });
}

export function createCollection(input: CollectionInput): Promise<AdminCollection> {
  return apiClient.post<AdminCollection>('/api/admin/collections', input);
}

export function updateCollection(id: string, input: CollectionInput): Promise<AdminCollection> {
  return apiClient.put<AdminCollection>(`/api/admin/collections/${encodeURIComponent(id)}`, input);
}

export function updateCollectionStatus(id: string, status: 'draft' | 'published'): Promise<AdminCollection> {
  return apiClient.patch<AdminCollection>(`/api/admin/collections/${encodeURIComponent(id)}/status`, { status });
}

export function deleteCollection(id: string): Promise<void> {
  return apiClient.delete<void>(`/api/admin/collections/${encodeURIComponent(id)}`);
}
