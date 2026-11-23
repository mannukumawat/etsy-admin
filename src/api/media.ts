import type { Localized, MediaAsset, MediaUsage } from '@/types';
import { apiClient } from './client';
import type { MediaListResponse, MediaUploadRequest } from './types';

// Media endpoints. Images are stored by the API and served from `/media/:id` — outside the `/api`
// prefix — so the URLs it returns stay valid across restarts and work from both apps.

export async function fetchMedia(q = '', signal?: AbortSignal): Promise<MediaAsset[]> {
  const { items } = await apiClient.get<MediaListResponse>('/api/admin/media', { query: { q: q.trim() }, signal });
  return items;
}

/** Upload as base64 JSON, which is what the current endpoint accepts. */
export function uploadMedia(body: MediaUploadRequest): Promise<MediaAsset> {
  return apiClient.post<MediaAsset>('/api/admin/media', body);
}

export function importMediaUrl(url: string, alt: Localized): Promise<MediaAsset> {
  return apiClient.post<MediaAsset>('/api/admin/media/from-url', { url, alt });
}

export function deleteMedia(id: string): Promise<{ ok: boolean; detached?: number }> {
  return apiClient.delete<{ ok: boolean; detached?: number }>(`/api/admin/media/${id}`);
}

export async function fetchMediaUsages(id: string): Promise<MediaUsage[]> {
  const { usages } = await apiClient.get<{ usages: MediaUsage[] }>(`/api/admin/media/${id}/usages`);
  return usages;
}

export function updateMediaAlt(id: string, alt: Localized): Promise<MediaAsset> {
  return apiClient.put<MediaAsset>(`/api/admin/media/${id}`, { alt });
}

/**
 * Multipart upload, ready for when the endpoint accepts it. The client deliberately does not set
 * Content-Type for FormData so the browser can add its own multipart boundary.
 */
export function uploadMediaFile(file: File, alt: Localized): Promise<MediaAsset> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('altEn', alt.en);
  return apiClient.post<MediaAsset>('/api/admin/media', form);
}
