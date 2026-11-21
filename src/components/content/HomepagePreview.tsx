import { ArrowRight, ImageOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Dialog';
import { useSettings } from '@/hooks/misc';
import type { CategoryWithCount, HomepageContent, LanguageCode, MediaAsset, Product } from '@/types';
import { cn } from '@/utils/misc';
import type { HomepageItemGroup } from './itemGroupSections';
import { LText, MissingText, PreviewBanner } from './PreviewKit';

interface PreviewProps {
  open: boolean;
  onClose: () => void;
  values: HomepageContent;
  media: Map<string, MediaAsset>;
  itemSections: HomepageItemGroup[];
  products?: Product[];
  categories?: CategoryWithCount[];
}

function Img({ asset, className, alt }: { asset: MediaAsset | undefined; className?: string; alt?: string }) {
  if (!asset)
    return (
      <div className={cn('flex items-center justify-center bg-sand-100 text-ink-faint', className)}>
        <ImageOff className="h-6 w-6" aria-label="No image" />
      </div>
    );
  return <img src={asset.url} alt={alt ?? asset.alt.en} className={cn('object-cover', className)} />;
}

export function HomepagePreview({ open, onClose, values: v, media, itemSections, products, categories }: PreviewProps) {
  const lang: LanguageCode = 'en';
  const { data: settings } = useSettings();
  const storeName = settings?.store.name ?? 'Your Store';
  const byId = new Map((products ?? []).map((p) => [p.id, p]));
  const byCatId = new Map((categories ?? []).map((c) => [c.id, c]));
  // H13: the preview now also shows the featured/bestseller/new-arrival rows, the
  // featured categories and the newsletter block, so the new editors can be checked.
  const productRow = (title: string, ids: string[]) => {
    if (!ids.length) return null;
    const rows = ids.map((id) => byId.get(id)).filter((p): p is Product => !!p);
    return (
      <section className="border-t border-sand-200 px-4 py-6 sm:px-8" aria-label={title}>
        <div className="mb-4 flex items-end justify-between gap-3 border-b border-sand-200 pb-3">
          <h3 className="font-brand text-xl font-semibold text-ink">{title}</h3>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-700">View all <ArrowRight className="h-3.5 w-3.5" aria-hidden /></span>
        </div>
        {rows.length === 0 ? (
          <p className="text-[13px] text-ink-muted">Products not loaded yet.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {rows.map((p) => {
              const img = p.images[0] ? media.get(p.images[0].mediaId) : undefined;
              return (
                <li key={p.id} className="min-w-0">
                  <Img asset={img} alt="" className="aspect-square w-full rounded-lg" />
                  <p className="mt-1.5 overflow-hidden text-[13px] font-medium leading-snug text-ink" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    <LText value={p.name} lang={lang} />
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Homepage preview"
      description="Simplified admin rendering of the current form values."
      footer={
        <Button variant="outline" onClick={onClose}>
          Close preview
        </Button>
      }
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PreviewBanner>The live storefront is a separate app and is not changed by anything here.</PreviewBanner>
      </div>

      <div className="overflow-hidden rounded-xl border border-sand-200 bg-ivory shadow-card" lang={lang}>
        {v.announcement.enabled && (
          <div className="bg-ink px-3 py-2 text-center text-xs text-white">
            <LText value={v.announcement.text} lang={lang} empty={<MissingText>Announcement text missing</MissingText>} />
          </div>
        )}
        <div className="flex items-center justify-between border-b border-sand-200 bg-white px-4 py-3 sm:px-8">
          <span className="font-brand text-xl font-semibold text-ink" lang="en">
            {storeName}
          </span>
          <span className="text-2xs uppercase tracking-wider text-ink-faint" lang="en">
            Navigation not shown
          </span>
        </div>

        {/* Hero */}
        <section className="grid items-center gap-6 px-4 py-8 sm:px-8 md:grid-cols-2" aria-label="Hero">
          <div className="min-w-0 space-y-4">
            <LText as="h3" value={v.hero.title} lang={lang} className="font-brand text-3xl font-semibold leading-tight text-ink sm:text-4xl" empty={<MissingText>Hero title missing</MissingText>} />
            <LText as="p" value={v.hero.subtitle} lang={lang} className="text-sm text-ink-soft" />
            <span className="text-xs text-ink-muted">
              Whole banner opens: <span className="font-mono">{v.hero.ctaHref || '(choose product)'}</span>
            </span>
          </div>
          <Img asset={v.hero.imageId ? media.get(v.hero.imageId) : undefined} className="aspect-[16/10] w-full rounded-xl" />
        </section>

        {/* Extra slider banners */}
        {(v.slides?.length ?? 0) > 0 && (
          <section className="border-t border-sand-200 px-4 py-6 sm:px-8" aria-label="Slider banners">
            <p className="mb-3 text-2xs font-semibold uppercase tracking-wider text-ink-faint">Slider banners (slide after the hero)</p>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {v.slides!.map((sl, i) => (
                <li key={sl.id || i} className="relative overflow-hidden rounded-lg border border-sand-200">
                  <Img asset={sl.imageId ? media.get(sl.imageId) : undefined} className="aspect-[16/8] w-full" />
                  {(sl.title.en || sl.ctaHref) && (
                    <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/60 to-transparent p-3 text-white">
                      {sl.title.en && <p className="font-brand text-base font-semibold leading-tight">{sl.title.en}</p>}
                      {sl.ctaHref && <span className="mt-1 text-xs opacity-90">Whole banner opens product</span>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Featured categories */}
        {(v.featuredCategoryIds?.length ?? 0) > 0 && (
          <section className="border-t border-sand-200 px-4 py-6 sm:px-8" aria-label="Featured categories">
            <div className="mb-4 flex items-end justify-between gap-3 border-b border-sand-200 pb-3">
              <h3 className="font-brand text-xl font-semibold text-ink">Featured categories</h3>
            </div>
            <ul className="flex flex-wrap gap-2">
              {v.featuredCategoryIds!.map((id) => (
                <li key={id} className="rounded-full border border-sand-300 bg-white px-3 py-1.5 text-[13px] font-medium text-ink">
                  {byCatId.get(id)?.name.en ?? 'Missing category'}
                </li>
              ))}
            </ul>
          </section>
        )}

        {productRow('Featured products', v.featuredProductIds ?? [])}
        {productRow('Bestsellers', v.bestsellerProductIds ?? [])}
        {productRow('New arrivals', v.newArrivalProductIds ?? [])}

        {/* Newsletter */}
        {(v.newsletter?.title.en || v.newsletter?.body.en) && (
          <section className="border-t border-sand-200 bg-sand-50 px-4 py-6 text-center sm:px-8" aria-label="Newsletter">
            <LText as="h3" value={v.newsletter.title} lang={lang} className="font-brand text-xl font-semibold text-ink" empty={<MissingText>Newsletter title missing</MissingText>} />
            <LText as="p" value={v.newsletter.body} lang={lang} className="mx-auto mt-2 max-w-md text-sm text-ink-soft" />
            <p className="mt-3 text-xs text-ink-muted">Email field + Subscribe button (storefront).</p>
          </section>
        )}

        {/* Item groups: one product row per group, same as the storefront */}
        {itemSections.length === 0 ? (
          <section className="border-t border-sand-200 px-4 py-6 text-[13px] text-ink-muted sm:px-8">No item group rows to show yet.</section>
        ) : (
          itemSections.map(({ group, products }) => (
            <section key={group.id} className="border-t border-sand-200 px-4 py-6 sm:px-8" aria-label={group.nameEn}>
              <div className="mb-4 flex items-end justify-between gap-3 border-b border-sand-200 pb-3">
                <h3 className="font-brand text-xl font-semibold text-ink">{group.nameEn}</h3>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-700">View all <ArrowRight className="h-3.5 w-3.5" aria-hidden /></span>
              </div>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {products.map((p) => {
                  const img = p.images[0] ? media.get(p.images[0].mediaId) : undefined;
                  return (
                    <li key={p.id} className="min-w-0">
                      <Img asset={img} alt="" className="aspect-square w-full rounded-lg" />
                      <p className="mt-1.5 overflow-hidden text-[13px] font-medium leading-snug text-ink" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        <LText value={p.name} lang={lang} />
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </Modal>
  );
}
