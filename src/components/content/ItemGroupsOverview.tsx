import { Link } from 'react-router-dom';
import { ImageOff } from 'lucide-react';
import { Skeleton } from '@/components/ui/Feedback';
import type { MediaAsset } from '@/types';
import type { HomepageItemGroup } from './itemGroupSections';

/** Read-only list of the item-group rows the storefront homepage shows, in storefront order. */
export function ItemGroupsOverview({ sections, media, loading }: { sections: HomepageItemGroup[]; media: Map<string, MediaAsset>; loading: boolean }) {
  if (loading)
    return (
      <div className="space-y-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  if (sections.length === 0)
    return (
      <p className="rounded-lg border border-dashed border-sand-300 px-3 py-6 text-center text-[13px] text-ink-muted">
        No item group rows yet. Create an active item group and assign active products to it; it then appears on the homepage.
      </p>
    );
  return (
    <ol className="space-y-4" aria-label="Item groups on the homepage">
      {sections.map(({ group, products }, i) => (
        <li key={group.id} className="rounded-lg border border-sand-200 bg-ivory-50/60">
          <div className="flex items-center justify-between gap-3 border-b border-sand-200 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-800 num">{i + 1}</span>
              <p className="min-w-0 truncate text-sm font-semibold text-ink">{group.nameEn}</p>
            </div>
            <Link to={`/products?itemGroup=${group.id}`} className="shrink-0 text-xs font-medium text-brand-700 hover:underline">
              {products.length} product{products.length === 1 ? '' : 's'} shown →
            </Link>
          </div>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-4 p-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-10">
            {products.map((p) => {
              const img = p.images[0] ? media.get(p.images[0].mediaId) : undefined;
              return (
                <li key={p.id} className="min-w-0">
                  <Link to={`/products/${p.id}/edit`} title={p.name.en} className="group block">
                    <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-sand-200 bg-sand-100 transition-shadow group-hover:shadow-card">
                      {img ? <img src={img.url} alt="" loading="lazy" className="h-full w-full object-cover" /> : <ImageOff className="h-5 w-5 text-ink-faint" aria-hidden />}
                    </div>
                    <span
                      className="mt-1.5 block overflow-hidden text-xs font-medium leading-snug text-ink group-hover:underline"
                      style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
                    >
                      {p.name.en}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ol>
  );
}
