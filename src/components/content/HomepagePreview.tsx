import { ImageOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Dialog';
import { useSettings } from '@/hooks/misc';
import type { HomepageContent, LanguageCode, MediaAsset } from '@/types';
import { cn } from '@/utils/misc';
import type { HomepageItemGroup } from './itemGroupSections';
import { LText, MissingText, PreviewBanner } from './PreviewKit';

interface PreviewProps {
  open: boolean;
  onClose: () => void;
  values: HomepageContent;
  media: Map<string, MediaAsset>;
  itemSections: HomepageItemGroup[];
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

export function HomepagePreview({ open, onClose, values: v, media, itemSections }: PreviewProps) {
  const lang: LanguageCode = 'en';
  const { data: settings } = useSettings();
  const storeName = settings?.store.name ?? 'Your Store';

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

        {/* Item groups: one product row per group, same as the storefront */}
        {itemSections.length === 0 ? (
          <section className="border-t border-sand-200 px-4 py-6 text-[13px] text-ink-muted sm:px-8">No item group rows to show yet.</section>
        ) : (
          itemSections.map(({ group, products }) => (
            <section key={group.id} className="border-t border-sand-200 px-4 py-6 sm:px-8" aria-label={group.nameEn}>
              <div className="mb-4 flex items-end justify-between gap-3 border-b border-sand-200 pb-3">
                <h3 className="font-brand text-xl font-semibold text-ink">{group.nameEn}</h3>
                <span className="shrink-0 text-xs font-medium text-brand-700">View all →</span>
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
