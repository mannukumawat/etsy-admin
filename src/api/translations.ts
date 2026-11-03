import { apiClient } from './client';

export type ContentLang = 'de' | 'fr' | 'it' | 'es';

export interface TranslationRow {
  source: string;
  where: string[];
  translations: Record<ContentLang, string>;
}

export interface TranslationList {
  items: TranslationRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  sourceCount: number;
  counts: Record<ContentLang, number>;
}

export function fetchTranslations(query: { q?: string; lang?: ContentLang; status?: string; page?: number; pageSize?: number }, signal?: AbortSignal) {
  return apiClient.get<TranslationList>('/api/admin/translations', { query: { ...query }, signal });
}

export function saveTranslation(source: string, lang: ContentLang, text: string) {
  return apiClient.put<{ ok: true }>('/api/admin/translations', { source, lang, text });
}
