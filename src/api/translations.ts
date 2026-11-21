import { apiClient } from './client';

export type ContentLang = 'de' | 'fr' | 'it' | 'es';

export interface TranslationRow {
  key?: string;
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

export function fetchUiTranslations(query: { q?: string; lang?: ContentLang; status?: string; page?: number; pageSize?: number }, signal?: AbortSignal) {
  return apiClient.get<TranslationList>('/api/admin/translations/ui', { query: { ...query }, signal });
}

export function saveUiTranslation(key: string, lang: ContentLang, value: string) {
  return apiClient.put<{ ok: true }>('/api/admin/translations/ui', { key, lang, value });
}
