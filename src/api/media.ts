import type { Localized, MediaAsset } from '@/types';
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
