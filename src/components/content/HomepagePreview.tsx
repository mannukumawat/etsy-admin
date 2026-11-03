import type { ReactNode } from 'react';
import { ImageOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Dialog';
import { Badge } from '@/components/ui/Feedback';
import { useSettings } from '@/hooks/misc';
import type { Category, HomepageContent, LanguageCode, MediaAsset, Product } from '@/types';
import { cn } from '@/utils/misc';
import { LText, MissingText, PreviewBanner } from './PreviewKit';

interface PreviewProps {
  open: boolean;
  onClose: () => void;
  values: HomepageContent;
  categories: Category[] | undefined;
  products: Product[] | undefined;
  media: Map<string, MediaAsset>;
}

/** Section label in the preview. Storefront section headings are not editable content, so they are shown as admin annotations. */
function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-2xs font-semibold uppercase tracking-wider text-ink-faint">{children}</p>;
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

function CtaLink({ label, href, lang }: { label: HomepageContent['hero']['ctaLabel']; href: string; lang: LanguageCode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="inline-flex min-h-[2.5rem] items-center rounded-full bg-brand-600 px-5 py-2 text-sm font-medium text-white">
        <LText value={label} lang={lang} empty={<span className="opacity-80">Button label missing</span>} />
      </span>
      <span className="font-mono text-2xs text-ink-muted">→ {href || '(no link)'}</span>
    </div>
  );
}

export function HomepagePreview({ open, onClose, values: v, categories, products, media }: PreviewProps) {
  const lang: LanguageCode = 'en';
  const { data: settings } = useSettings();
  const storeName = settings?.store.name ?? 'Your Store';
  const catById = new Map((categories ?? []).map((c) => [c.id, c]));
  const productById = new Map((products ?? []).map((p) => [p.id, p]));

  const productGrid = (label: string, ids: string[]) => (
    <section className="border-t border-sand-200 px-4 py-6 sm:px-8" aria-label={label}>
      <SectionLabel>{label}</SectionLabel>
      {ids.length === 0 ? (
        <p className="text-[13px] text-ink-muted">No products chosen.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {ids.map((id) => {
            const p = productById.get(id);
            const img = p?.images[0] ? media.get(p.images[0].mediaId) : undefined;
            return (
              <li key={id} className="min-w-0">
                <Img asset={img} alt="" className="aspect-square w-full rounded-lg" />
                <p className="mt-1.5 line-clamp-2 text-[13px] font-medium text-ink">{p ? <LText value={p.name} lang={lang} /> : <MissingText>Missing product</MissingText>}</p>
                {p && p.status !== 'active' && (
                  <Badge tone="warning" className="mt-1">
                    {p.status === 'draft' ? 'Draft' : 'Archived'} — blocks publishing
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

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
            <CtaLink label={v.hero.ctaLabel} href={v.hero.ctaHref} lang={lang} />
          </div>
          <Img asset={v.hero.imageId ? media.get(v.hero.imageId) : undefined} className="aspect-[16/10] w-full rounded-xl" />
        </section>

        {productGrid('Featured items (first row, up to 12)', v.featuredProductIds)}
        {productGrid('New arrivals (second row, up to 8)', v.newArrivalProductIds)}
        {productGrid('Bestsellers (third row, up to 8)', v.bestsellerProductIds)}

        {/* Homepage categories */}
        <section className="border-t border-sand-200 px-4 py-6 sm:px-8" aria-label="Homepage categories">
          <SectionLabel>Homepage categories (below product rows)</SectionLabel>
          {v.featuredCategoryIds.length === 0 ? (
            <p className="text-[13px] text-ink-muted">No categories chosen.</p>
          ) : (
            <ul className="flex flex-wrap gap-4">
              {v.featuredCategoryIds.map((id) => {
                const c = catById.get(id);
                const img = c?.imageId ? media.get(c.imageId) : undefined;
                return (
                  <li key={id} className="flex w-20 flex-col items-center gap-1.5 text-center">
                    <Img asset={img} alt="" className="h-16 w-16 rounded-full border border-sand-200" />
                    <span className="text-xs font-medium text-ink">{c ? <LText value={c.name} lang={lang} /> : <MissingText>Missing</MissingText>}</span>
                    {c && !c.isActive && <Badge tone="warning">Inactive</Badge>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Brand story */}
        <section className="grid items-center gap-6 border-t border-sand-200 bg-white px-4 py-8 sm:px-8 md:grid-cols-2" aria-label="Brand story">
          <Img asset={v.story.imageId ? media.get(v.story.imageId) : undefined} className="aspect-[4/3] w-full rounded-xl" />
          <div className="min-w-0 space-y-3">
            <LText as="h3" value={v.story.title} lang={lang} className="font-brand text-2xl font-semibold leading-tight text-ink" empty={<MissingText>Story title missing</MissingText>} />
            <LText as="p" value={v.story.body} lang={lang} className="text-sm text-ink-soft" />
            {v.story.ctaLabel.en.trim() && <CtaLink label={v.story.ctaLabel} href={v.story.ctaHref} lang={lang} />}
          </div>
        </section>

        {/* Newsletter */}
        <section className="border-t border-sand-200 px-4 py-8 text-center sm:px-8" aria-label="Newsletter">
          <LText as="h3" value={v.newsletter.title} lang={lang} className="font-brand text-2xl font-semibold text-ink" empty={<MissingText>Newsletter title missing</MissingText>} />
          <LText as="p" value={v.newsletter.body} lang={lang} className="mx-auto mt-2 max-w-md text-sm text-ink-soft" />
          <div className="mx-auto mt-4 flex max-w-sm gap-2" aria-hidden>
            <span className="flex h-10 flex-1 items-center rounded-full border border-sand-300 bg-white px-4 text-left text-[13px] text-ink-faint">email@example.com</span>
            <span className="flex h-10 items-center rounded-full bg-ink px-4 text-[13px] font-medium text-white">→</span>
          </div>
          <p className="mt-2 text-2xs text-ink-faint" lang="en">
            Sign-up form shown for layout only.
          </p>
        </section>
      </div>
    </Modal>
  );
}
