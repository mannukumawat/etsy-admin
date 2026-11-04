import type { HomepageContent, Localized, MediaAsset, MediaUsage, PageContent, PageDoc, PageKey, Versioned } from '@/types';
import { isHttpUrl, newId } from '@/utils/misc';
import { ApiError, mockRequest, validationError, type FieldIssue } from './api';
import { API_MODE, contentApi, mediaApi } from '@/api';
import { ADMIN_ACTOR, db, nowIso } from './db';

// "Publish" here only changes the admin's in-memory published copy. The storefront is a separate app and keeps
// showing its own bundled content until the backend integration phase.

const isLink = (href: string) => href.startsWith('/') || isHttpUrl(href);
const blank = (l: Localized) => !l.en.trim();

// ---------------------------------------------------------------------------------------------
// Homepage — future API: GET/PUT /api/admin/content/homepage, POST .../publish
// ---------------------------------------------------------------------------------------------

function checkHomepage(c: HomepageContent, publishing: boolean): FieldIssue[] {
  const issues: FieldIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });
  if (c.announcement.enabled && blank(c.announcement.text)) add('announcement.text.en', 'Announcement text is required while the bar is enabled.');
  if (c.announcement.text.en.length > 140) add('announcement.text.en', 'Keep the announcement under 140 characters.');
  if (blank(c.hero.title)) add('hero.title.en', 'Hero title is required.');
  if (blank(c.hero.ctaLabel)) add('hero.ctaLabel.en', 'Button label is required.');
  if (!isLink(c.hero.ctaHref)) add('hero.ctaHref', 'Use a site path like /shop or a full https:// URL.');
  if (c.hero.imageId && !db.media.some((m) => m.id === c.hero.imageId)) add('hero.imageId', 'Selected image no longer exists.');
  if (blank(c.story.title)) add('story.title.en', 'Story title is required.');
  if (!isLink(c.story.ctaHref)) add('story.ctaHref', 'Use a site path like /about or a full https:// URL.');
  if (blank(c.newsletter.title)) add('newsletter.title.en', 'Newsletter title is required.');
  const lists = ['featuredProductIds', 'bestsellerProductIds', 'newArrivalProductIds'] as const;
  for (const key of lists) {
    if (c[key].length > 12) add(key, 'Choose at most 12 products.');
    if (new Set(c[key]).size !== c[key].length) add(key, 'A product is listed twice.');
    for (const id of c[key]) {
      const p = db.products.find((x) => x.id === id);
      if (!p) add(key, 'A selected product no longer exists.');
      else if (publishing && p.status !== 'active') add(key, `"${p.name.en}" is not active, so it cannot be published on the homepage.`);
    }
  }
  for (const id of c.featuredCategoryIds) {
    const cat = db.categories.find((x) => x.id === id);
    if (!cat) add('featuredCategoryIds', 'A selected category no longer exists.');
    else if (publishing && !cat.isActive) add('featuredCategoryIds', `Category "${cat.name.en}" is inactive.`);
  }
  return issues;
}

export const contentService = {
  getHomepage(): Promise<Versioned<HomepageContent>> {
    if (API_MODE) return contentApi.fetchHomepage();
    return mockRequest(() => db.homepage);
  },

  saveHomepageDraft(draft: HomepageContent): Promise<Versioned<HomepageContent>> {
    if (API_MODE) return contentApi.saveHomepageDraft(draft);
    return mockRequest(() => {
      const issues = checkHomepage(draft, false);
      if (issues.length) throw validationError(issues);
      db.homepage = { ...db.homepage, draft: structuredClone(draft), updatedAt: nowIso(), updatedBy: ADMIN_ACTOR };
      return db.homepage;
    }, [300, 600]);
  },

  publishHomepage(): Promise<Versioned<HomepageContent>> {
    if (API_MODE) return contentApi.publishHomepage();
    return mockRequest(() => {
      const issues = checkHomepage(db.homepage.draft, true);
      if (issues.length) throw validationError(issues, issues[0].message);
      const now = nowIso();
      db.homepage = { ...db.homepage, published: structuredClone(db.homepage.draft), publishedAt: now, updatedAt: now, updatedBy: ADMIN_ACTOR };
      return db.homepage;
    }, [400, 800]);
  },

  discardHomepageDraft(): Promise<Versioned<HomepageContent>> {
    if (API_MODE) return contentApi.discardHomepageDraft();
    return mockRequest(() => {
      if (!db.homepage.published) throw new ApiError('conflict', 'Nothing has been published yet.');
      db.homepage = { ...db.homepage, draft: structuredClone(db.homepage.published), updatedAt: nowIso(), updatedBy: ADMIN_ACTOR };
      return db.homepage;
    });
  },

  // -------------------------------------------------------------------------------------------
  // Pages
  // -------------------------------------------------------------------------------------------

  listPages(): Promise<PageDoc[]> {
    if (API_MODE) return contentApi.fetchPages();
    return mockRequest(() => db.pages, [120, 300]);
  },

  getPage(key: PageKey): Promise<PageDoc> {
    if (API_MODE) return contentApi.fetchPage(key);
    return mockRequest(() => findPage(key));
  },

  savePageDraft(key: PageKey, content: PageContent): Promise<PageDoc> {
    if (API_MODE) return contentApi.savePageDraft(key, content);
    return mockRequest(() => {
      const doc = findPage(key);
      const issues = checkPage(content);
      if (issues.length) throw validationError(issues);
      Object.assign(doc, { draft: structuredClone(content), updatedAt: nowIso(), updatedBy: ADMIN_ACTOR });
      return doc;
    }, [300, 600]);
  },

  publishPage(key: PageKey): Promise<PageDoc> {
    if (API_MODE) return contentApi.publishPage(key);
    return mockRequest(() => {
      const doc = findPage(key);
      const issues = checkPage(doc.draft);
      if (issues.length) throw validationError(issues, issues[0].message);
      const now = nowIso();
      Object.assign(doc, { published: structuredClone(doc.draft), publishedAt: now, updatedAt: now, updatedBy: ADMIN_ACTOR });
      return doc;
    }, [400, 800]);
  },

  discardPageDraft(key: PageKey): Promise<PageDoc> {
    if (API_MODE) return contentApi.discardPageDraft(key);
    return mockRequest(() => {
      const doc = findPage(key);
      if (!doc.published) throw new ApiError('conflict', 'Nothing has been published yet.');
      Object.assign(doc, { draft: structuredClone(doc.published), updatedAt: nowIso(), updatedBy: ADMIN_ACTOR });
      return doc;
    });
  },
};

function findPage(key: PageKey): PageDoc {
  const doc = db.pages.find((p) => p.key === key);
  if (!doc) throw new ApiError('not_found', 'Page not found.');
  return doc;
}

function checkPage(c: PageContent): FieldIssue[] {
  const issues: FieldIssue[] = [];
  if (blank(c.title)) issues.push({ path: 'title.en', message: 'English title is required.' });
  if (c.sections.length > 30) issues.push({ path: 'sections', message: 'Use at most 30 sections.' });
  c.sections.forEach((s, i) => {
    if (blank(s.heading)) issues.push({ path: `sections.${i}.heading.en`, message: 'Heading is required.' });
    if (blank(s.body)) issues.push({ path: `sections.${i}.body.en`, message: 'Text is required.' });
  });
  return issues;
}

/** True when the draft differs from what was last published. */
export function hasUnpublishedChanges<T>(doc: Versioned<T>): boolean {
  return !doc.published || JSON.stringify(doc.draft) !== JSON.stringify(doc.published);
}

// ---------------------------------------------------------------------------------------------
// Media — future API: POST /api/admin/media (multipart, server-side type/size checks + CDN storage)
// ---------------------------------------------------------------------------------------------

export const MEDIA_RULES = {
  types: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  maxBytes: 5 * 1024 * 1024,
  label: 'JPEG, PNG, WebP or GIF, up to 5 MB',
};

function usagesOf(id: string): MediaUsage[] {
  const out: MediaUsage[] = [];
  for (const p of db.products) {
    if (p.images.some((i) => i.mediaId === id)) out.push({ kind: 'product', label: `Product: ${p.name.en}`, href: `/products/${p.id}/edit` });
    else if (p.variants.some((v) => v.imageIds.includes(id))) out.push({ kind: 'variant', label: `Variant image: ${p.name.en}`, href: `/products/${p.id}/edit` });
  }
  for (const c of db.categories) {
    if (c.imageId === id) out.push({ kind: 'category-image', label: `Category image: ${c.name.en}`, href: '/categories' });
    if (c.bannerId === id) out.push({ kind: 'category-banner', label: `Category banner: ${c.name.en}`, href: '/categories' });
  }
  const home = [db.homepage.draft, db.homepage.published];
  if (home.some((h) => h?.hero.imageId === id)) out.push({ kind: 'homepage-hero', label: 'Homepage hero', href: '/content/homepage' });
  if (home.some((h) => h?.story.imageId === id)) out.push({ kind: 'homepage-story', label: 'Homepage brand story', href: '/content/homepage' });
  if (db.settings.store.logoId === id) out.push({ kind: 'store-logo', label: 'Store logo', href: '/settings/store' });
  return out;
}

export type NewMedia = Omit<MediaAsset, 'id' | 'createdAt' | 'source'>;

/** Reads a local object URL back into base64 so it can be uploaded. */
async function blobUrlToBase64(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  const buffer = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(binary);
}

export const mediaService = {
  list(q = ''): Promise<MediaAsset[]> {
    if (API_MODE) return mediaApi.fetchMedia(q);
    return mockRequest(() => {
      const term = q.trim().toLowerCase();
      return [...db.media]
        .filter((m) => !term || `${m.fileName} ${m.alt.en} ${m.alt.hi}`.toLowerCase().includes(term))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }, [120, 300]);
  },

  /** Registers files already validated and turned into local object URLs by the browser. Nothing is uploaded. */
  add(items: NewMedia[]): Promise<MediaAsset[]> {
    if (API_MODE) {
      // Uploads become durable rows served from /media/:id, so both apps keep resolving them
      // after a restart (object URLs would die with the tab).
      return Promise.all(
        items.map(async (item) => {
          const base64 = await blobUrlToBase64(item.url);
          return mediaApi.uploadMedia({
            fileName: item.fileName,
            mimeType: item.mimeType,
            base64,
            width: item.width,
            height: item.height,
            alt: item.alt,
          });
        }),
      );
    }
    return mockRequest(() => {
      const created = items.map((item): MediaAsset => {
        if (!MEDIA_RULES.types.includes(item.mimeType)) throw validationError([{ path: 'file', message: `${item.fileName}: unsupported type (${MEDIA_RULES.label}).` }]);
        if (item.sizeBytes > MEDIA_RULES.maxBytes) throw validationError([{ path: 'file', message: `${item.fileName}: larger than 5 MB.` }]);
        return { ...item, id: newId('m'), createdAt: nowIso(), source: 'upload' };
      });
      db.media.unshift(...created);
      return created;
    }, [300, 700]);
  },

  async importUrl(url: string, alt: Localized = { en: '' }): Promise<MediaAsset> {
    if (API_MODE) return mediaApi.importMediaUrl(url, alt);
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new ApiError('validation', 'That URL could not be loaded as an image.'));
      image.src = url;
    });
    const pathName = new URL(url).pathname;
    const asset: MediaAsset = {
      id: newId('m'), url, fileName: decodeURIComponent(pathName.split('/').pop() || 'remote-image'),
      mimeType: 'image/remote', sizeBytes: 0, width: dimensions.width, height: dimensions.height,
      alt, source: 'upload', createdAt: nowIso(),
    };
    db.media.unshift(asset);
    return asset;
  },

  updateAlt(id: string, alt: Localized): Promise<MediaAsset> {
    return mockRequest(() => {
      const m = db.media.find((x) => x.id === id);
      if (!m) throw new ApiError('not_found', 'Image not found.');
      if (alt.en.length > 200) throw validationError([{ path: 'alt.en', message: 'Keep alt text under 200 characters.' }]);
      m.alt = { en: alt.en.trim() };
      return m;
    });
  },

  usages(id: string): Promise<MediaUsage[]> {
    return mockRequest(() => usagesOf(id), [80, 200]);
  },

  /** Without `force`, deleting an image that is still referenced fails with the list of usages. */
  remove(id: string, force = false): Promise<{ detached: number }> {
    return mockRequest(() => {
      const m = db.media.find((x) => x.id === id);
      if (!m) throw new ApiError('not_found', 'Image not found.');
      const used = usagesOf(id);
      if (used.length && !force) throw new ApiError('in_use', 'This image is still used.', [], used);
      for (const p of db.products) {
        p.images = p.images.filter((i) => i.mediaId !== id);
        p.variants.forEach((v) => (v.imageIds = v.imageIds.filter((x) => x !== id)));
      }
      db.categories.forEach((c) => {
        if (c.imageId === id) c.imageId = null;
        if (c.bannerId === id) c.bannerId = null;
      });
      for (const h of [db.homepage.draft, db.homepage.published]) {
        if (!h) continue;
        if (h.hero.imageId === id) h.hero.imageId = null;
        if (h.story.imageId === id) h.story.imageId = null;
      }
      if (db.settings.store.logoId === id) db.settings.store.logoId = null;
      db.media = db.media.filter((x) => x.id !== id);
      if (m.url.startsWith('blob:') && typeof URL !== 'undefined' && 'revokeObjectURL' in URL) URL.revokeObjectURL(m.url);
      return { detached: used.length };
    });
  },
};
