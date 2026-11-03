import { apiClient } from './client';

export type ReviewStatus = 'published' | 'hidden';

export interface AdminReview {
  id: string;
  status: ReviewStatus;
  rating: number;
  title: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  product: { id: string; slug: string; name: { en: string; hi: string }; status: string };
  customer: { id: string; name: string; email: string };
  order: { id: string; number: string };
  moderation: Array<{ id: string; action: 'hidden' | 'restored'; reason: string; at: string }>;
}

export interface AdminReviewQuery {
  q?: string;
  productId?: string;
  status?: string;
  rating?: string;
  from?: string;
  to?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminReviewList {
  items: AdminReview[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  counts: { published: number; hidden: number };
}

export function fetchReviews(query: AdminReviewQuery, signal?: AbortSignal): Promise<AdminReviewList> {
  return apiClient.get<AdminReviewList>('/api/admin/reviews', { query: { ...query }, signal });
}

export function hideReview(id: string, reason: string): Promise<AdminReview> {
  return apiClient.post<AdminReview>(`/api/admin/reviews/${encodeURIComponent(id)}/hide`, { reason });
}

export function restoreReview(id: string, reason: string): Promise<AdminReview> {
  return apiClient.post<AdminReview>(`/api/admin/reviews/${encodeURIComponent(id)}/restore`, { reason });
}
