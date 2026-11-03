import { useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ImageOff, PackageSearch, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Dialog';
import { Badge, EmptyState, Notice, Skeleton } from '@/components/ui/Feedback';
import { FieldError } from '@/components/ui/Form';
import { ProductStatusBadge } from '@/components/ui/StatusBadges';
import type { MediaAsset, Product, ProductStatus } from '@/types';
import { moveItem } from '@/utils/misc';
import { ReorderControls, useReorderFocus } from './ReorderControls';

export const HOMEPAGE_LIST_MAX = 12;

function Thumb({ product, media, className = 'h-10 w-10' }: { product: Product | undefined; media: Map<string, MediaAsset>; className?: string }) {
  const img = product?.images[0] ? media.get(product.images[0].mediaId) : undefined;
  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-sand-200 bg-sand-100 ${className}`}>
      {img ? <img src={img.url} alt="" className="h-full w-full object-cover" loading="lazy" /> : <ImageOff className="h-4 w-4 text-ink-faint" aria-hidden />}
    </div>
  );
}

interface ProductListEditorProps {
  /** Section name used in labels, e.g. “Featured products”. */
  label: string;
  value: string[];
  onChange: (ids: string[]) => void;
  products: Product[] | undefined;
  media: Map<string, MediaAsset>;
  error?: string;
  max?: number;
}

/** Ordered list of product ids with move up / down / remove and an “Add products” picker. */
export function ProductListEditor({ label, value, onChange, products, media, error, max = HOMEPAGE_LIST_MAX }: ProductListEditorProps) {
  const [adding, setAdding] = useState(false);
  const addRef = useRef<HTMLButtonElement>(null);
  const focus = useReorderFocus<HTMLOListElement>(addRef);
  const byId = useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products]);
  const name = (id: string) => byId.get(id)?.name.en || 'Missing product';
  const blocking = products ? value.filter((id) => byId.get(id)?.status !== 'active') : [];

  const move = (from: number, to: number) => {
    const id = value[from];
    onChange(moveItem(value, from, to));
    focus.afterMove(id, to < from ? 'up' : 'down', `${name(id)} moved to position ${to + 1} of ${value.length}.`);
  };
  const remove = (index: number) => {
    const id = value[index];
    const next = value.filter((_, i) => i !== index);
    onChange(next);
    focus.afterRemove(next[index] ?? next[index - 1] ?? null, `${name(id)} removed from ${label}.`);
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-muted">
          <span className="num">
            {value.length} / {max}
          </span>{' '}
          products · shown in this order
        </p>
        <Button ref={addRef} variant="outline" size="sm" icon={<Plus className="h-3.5 w-3.5" aria-hidden />} onClick={() => setAdding(true)} disabled={value.length >= max || !products}>
          Add products
        </Button>
      </div>

      {blocking.length > 0 && (
        <Notice tone="warning" className="mb-2">
          {blocking.length === 1 ? '1 product in this list is' : `${blocking.length} products in this list are`} not active (or no longer exist). The draft can still be saved, but publishing is blocked until
          you activate {blocking.length === 1 ? 'it' : 'them'} or remove {blocking.length === 1 ? 'it' : 'them'} here.
        </Notice>
      )}
      <FieldError message={error} />

      {!products ? (
        <div className="space-y-2">
          {Array.from({ length: Math.min(3, Math.max(1, value.length)) }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : value.length === 0 ? (
        <p className="rounded-lg border border-dashed border-sand-300 px-3 py-4 text-center text-[13px] text-ink-muted">No products chosen for {label.toLowerCase()} yet.</p>
      ) : (
        <ol ref={focus.ref} className="divide-y divide-sand-200 rounded-lg border border-sand-200" aria-label={label}>
          {value.map((id, i) => {
            const p = byId.get(id);
            return (
              <li key={id} data-reorder-id={id} className="flex items-center gap-2 px-2 py-2 sm:gap-3 sm:px-3">
                <span className="w-5 shrink-0 text-right text-xs text-ink-faint num" aria-hidden>
                  {i + 1}
                </span>
                <Thumb product={p} media={media} />
                <div className="min-w-0 flex-1">
                  {p ? (
                    <Link to={`/products/${p.id}/edit`} className="block truncate text-[13px] font-medium text-ink hover:underline">
                      {p.name.en}
                    </Link>
                  ) : (
                    <p className="truncate text-[13px] font-medium text-red-800">Product no longer exists</p>
                  )}
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    {p ? <ProductStatusBadge status={p.status} /> : <Badge tone="danger">Missing</Badge>}
                    {(!p || p.status !== 'active') && <span className="text-2xs font-medium text-amber-900">Blocks publishing</span>}
                  </div>
                </div>
                <ReorderControls index={i} count={value.length} itemLabel={name(id)} onMove={(to) => move(i, to)} onRemove={() => remove(i)} removeLabel={`Remove ${name(id)} from ${label}`} />
              </li>
            );
          })}
        </ol>
      )}
      {focus.live}

      {adding && products && (
        <AddProductsModal
          listLabel={label}
          products={products}
          media={media}
          existing={value}
          remaining={max - value.length}
          onClose={() => setAdding(false)}
          onAdd={(ids) => {
            onChange([...value, ...ids]);
            focus.announce(`${ids.length} product${ids.length === 1 ? '' : 's'} added to ${label}.`);
          }}
        />
      )}
    </div>
  );
}

const statusRank: Record<ProductStatus, number> = { active: 0, draft: 1, archived: 2 };

function AddProductsModal({
  listLabel,
  products,
  media,
  existing,
  remaining,
  onClose,
  onAdd,
}: {
  listLabel: string;
  products: Product[];
  media: Map<string, MediaAsset>;
  existing: string[];
  remaining: number;
  onClose: () => void;
  onAdd: (ids: string[]) => void;
}) {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const searchId = useId();
  const inList = useMemo(() => new Set(existing), [existing]);
  const term = q.trim().toLowerCase();
  const rows = useMemo(
    () =>
      products
        .filter((p) => !term || `${p.name.en} ${p.slug}`.toLowerCase().includes(term))
        .sort((a, b) => statusRank[a.status] - statusRank[b.status] || a.name.en.localeCompare(b.name.en)),
    [products, term],
  );
  const full = selected.length >= remaining;
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const selectedInactive = selected.filter((id) => products.find((p) => p.id === id)?.status !== 'active').length;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Add products to ${listLabel.toLowerCase()}`}
      description={`You can add ${remaining} more (maximum ${HOMEPAGE_LIST_MAX}). Only active products can be published on the homepage.`}
      footer={
        <>
          <span className="mr-auto self-center text-xs text-ink-muted">{selected.length ? `${selected.length} selected` : 'Nothing selected'}</span>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!selected.length}
            onClick={() => {
              onAdd(selected);
              onClose();
            }}
          >
            {selected.length ? `Add ${selected.length} product${selected.length === 1 ? '' : 's'}` : 'Add products'}
          </Button>
        </>
      }
    >
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
        <label htmlFor={searchId} className="sr-only">
          Search products
        </label>
        <input id={searchId} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or slug" className="input h-9 pl-9" data-autofocus />
      </div>
      {selectedInactive > 0 && (
        <Notice tone="warning" className="mb-3">
          {selectedInactive === 1 ? '1 selected product is' : `${selectedInactive} selected products are`} not active. They can be saved in the draft but will block publishing.
        </Notice>
      )}
      {full && <p className="mb-2 text-xs font-medium text-amber-900">Limit reached — remove a selection or a product from the list to add others.</p>}
      {!rows.length ? (
        <EmptyState icon={<PackageSearch className="h-6 w-6" aria-hidden />} title="No products match" body="Try another name or slug." />
      ) : (
        <ul className="divide-y divide-sand-200 rounded-lg border border-sand-200" aria-label="Products">
          {rows.map((p) => {
            const already = inList.has(p.id);
            const checked = already || selected.includes(p.id);
            const disabled = already || (full && !selected.includes(p.id));
            return (
              <li key={p.id}>
                <label className={`flex items-center gap-3 px-3 py-2 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-ivory-50'}`}>
                  <input type="checkbox" className="h-4 w-4 shrink-0 accent-brand-600" checked={checked} disabled={disabled} onChange={() => toggle(p.id)} />
                  <Thumb product={p} media={media} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">{p.name.en}</span>
                    <span className="block truncate text-xs text-ink-muted">/{p.slug}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
                    {already && <Badge tone="muted">In list</Badge>}
                    <ProductStatusBadge status={p.status} />
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
