import { apiClient } from './client';

export interface HelpCategory {
  id: string; slug: string;
  name: { en: string; hi: string };
  description: { en: string; hi: string };
  icon: string; position: number; isActive: boolean;
  createdAt: string; updatedAt: string;
}
export interface HelpArticle {
  id: string; categoryId: string; slug: string;
  title: { en: string; hi: string };
  body: { en: string; hi: string };
  position: number; isActive: boolean;
  createdAt: string; updatedAt: string;
}
export interface HelpCategoryInput {
  slug: string; nameEn: string; nameHi?: string;
  descriptionEn?: string | null; descriptionHi?: string | null;
  icon?: string; position?: number; isActive?: boolean;
}
export interface HelpArticleInput {
  slug: string; titleEn: string; titleHi?: string;
  bodyEn: string; bodyHi?: string;
  position?: number; isActive?: boolean;
}

export const listCategories = () => apiClient.get<{ items: HelpCategory[] }>('/api/admin/help/categories');
export const createCategory = (data: HelpCategoryInput) => apiClient.post<HelpCategory>('/api/admin/help/categories', data);
export const updateCategory = (id: string, data: Partial<HelpCategoryInput>) => apiClient.patch<HelpCategory>(`/api/admin/help/categories/${id}`, data);
export const deleteCategory = (id: string) => apiClient.delete<{ ok: boolean }>(`/api/admin/help/categories/${id}`);

export const listArticles = (catId: string) => apiClient.get<{ items: HelpArticle[] }>(`/api/admin/help/categories/${catId}/articles`);
export const createArticle = (catId: string, data: HelpArticleInput) => apiClient.post<HelpArticle>(`/api/admin/help/categories/${catId}/articles`, data);
export const updateArticle = (catId: string, id: string, data: Partial<HelpArticleInput>) => apiClient.patch<HelpArticle>(`/api/admin/help/categories/${catId}/articles/${id}`, data);
export const deleteArticle = (catId: string, id: string) => apiClient.delete<{ ok: boolean }>(`/api/admin/help/categories/${catId}/articles/${id}`);
