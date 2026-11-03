import type { LanguageCode, Localized, PageKey } from '@/types';

// Shared constants for the content screens (homepage, pages & policies).

export const PAGE_KEYS: PageKey[] = ['about', 'contact', 'faq', 'shipping', 'returns', 'privacy', 'terms'];

/** Storefront path of each content page (the storefront is a separate app). */
export const PAGE_PATH: Record<PageKey, string> = {
  about: '/about',
  contact: '/contact',
  faq: '/faq',
  shipping: '/shipping',
  returns: '/returns',
  privacy: '/privacy',
  terms: '/terms',
};

/** Fallback admin label used before a page has loaded (or when its English title is empty). */
export const PAGE_LABEL: Record<PageKey, string> = {
  about: 'About',
  contact: 'Contact',
  faq: 'FAQ',
  shipping: 'Shipping',
  returns: 'Returns',
  privacy: 'Privacy policy',
  terms: 'Terms',
};

export const isPageKey = (key: string | undefined): key is PageKey => !!key && (PAGE_KEYS as string[]).includes(key);

/** Wording used in every publish confirmation: publishing is simulated inside the admin only. */
export const PUBLISH_SIMULATION_TEXT =
  'This is an admin-preview simulation. It only copies the draft to the published version inside this admin. The storefront is a separate app and is NOT updated until backend integration, and everything here resets when you refresh.';

export const LEGAL_NOTICE_TEXT =
  'Sample legal text. It must be reviewed by the store owner (and a legal adviser where needed) before launch. The storefront always shows these pages with a draft notice.';

/** Preview text. Content is English-only, so there is never a fallback. */
export function pickLocalized(value: Localized | undefined, _lang: LanguageCode): { text: string; fallback: boolean } {
  return { text: value?.en ?? '', fallback: false };
}
