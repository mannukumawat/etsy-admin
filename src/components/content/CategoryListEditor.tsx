import { useId, useMemo, useRef, useState } from 'react';
import { ImageOff, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge, Notice, Skeleton } from '@/components/ui/Feedback';
import { FieldError } from '@/components/ui/Form';
import type { Category, MediaAsset } from '@/types';
import { moveItem } from '@/utils/misc';
import { ReorderControls, useReorderFocus } from './ReorderControls';

/** Ordered list of featured category ids: add from the categories not yet chosen, move up / down, remove. */
export function CategoryListEditor({
  value,
  onChange,
  categories,
  media,
  error,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  categories: Category[] | undefined;
  media: Map<string, MediaAsset>;
  error?: string;
}) {
  const [pick, setPick] = useState('');
  const selectId = useId();
  const selectRef = useRef<HTMLSelectElement>(null);
  const focus = useReorderFocus<HTMLOListElement>(selectRef);
  const byId = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories]);
  const available = (categories ?? []).filter((c) => !value.includes(c.id));
  const name = (id: string) => byId.get(id)?.name.en || 'Missing category';
  const inactive = categories ? value.filter((id) => !byId.get(id)?.isActive) : [];

  const move = (from: number, to: number) => {
    const id = value[from];
    onChange(moveItem(value, from, to));
    focus.afterMove(id, to < from ? 'up' : 'down', `${name(id)} moved to position ${to + 1} of ${value.length}.`);
  };
  const remove = (index: number) => {
    const id = value[index];
    const next = value.filter((_, i) => i !== index);
    onChange(next);
    focus.afterRemove(next[index] ?? next[index - 1] ?? null, `${name(id)} removed from featured collections.`);
  };
  const add = () => {
    if (!pick || value.includes(pick)) return;
    onChange([...value, pick]);
    focus.announce(`${name(pick)} added at position ${value.length + 1}.`);
    setPick('');
  };

  return (
    <div>
      {inactive.length > 0 && (
        <Notice tone="warning" className="mb-2">
          {inactive.length === 1 ? '1 chosen category is' : `${inactive.length} chosen categories are`} inactive (or no longer exist). Inactive categories are hidden from storefront navigation, so
          publishing is blocked until you activate or remove them.
        </Notice>
      )}
      <FieldError message={error} />

      {!categories ? (
        <Skeleton className="h-24" />
      ) : value.length === 0 ? (
        <p className="rounded-lg border border-dashed border-sand-300 px-3 py-4 text-center text-[13px] text-ink-muted">No featured collections chosen yet.</p>
      ) : (
        <ol ref={focus.ref} className="divide-y divide-sand-200 rounded-lg border border-sand-200" aria-label="Featured collections">
          {value.map((id, i) => {
            const c = byId.get(id);
            const img = c?.imageId ? media.get(c.imageId) : undefined;
            return (
              <li key={id} data-reorder-id={id} className="flex items-center gap-2 px-2 py-2 sm:gap-3 sm:px-3">
                <span className="w-5 shrink-0 text-right text-xs text-ink-faint num" aria-hidden>
                  {i + 1}
                </span>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-sand-200 bg-sand-100">
                  {img ? <img src={img.url} alt="" className="h-full w-full object-cover" /> : <ImageOff className="h-4 w-4 text-ink-faint" aria-hidden />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={c ? 'truncate text-[13px] font-medium text-ink' : 'truncate text-[13px] font-medium text-red-800'}>{c ? c.name.en : 'Category no longer exists'}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    {!c ? (
                      <Badge tone="danger">Missing</Badge>
                    ) : c.isActive ? (
                      <span className="text-xs text-ink-muted">/category/{c.slug}</span>
                    ) : (
                      <>
                        <Badge tone="warning">Inactive</Badge>
                        <span className="text-2xs font-medium text-amber-900">Blocks publishing</span>
                      </>
                    )}
                  </div>
                </div>
                <ReorderControls index={i} count={value.length} itemLabel={name(id)} onMove={(to) => move(i, to)} onRemove={() => remove(i)} removeLabel={`Remove ${name(id)} from featured collections`} />
              </li>
            );
          })}
        </ol>
      )}
      {focus.live}

      {categories && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor={selectId} className="label">
              Add a category
            </label>
            <select ref={selectRef} id={selectId} className="input" value={pick} onChange={(e) => setPick(e.target.value)} disabled={!available.length}>
              <option value="">{available.length ? 'Choose a category…' : 'All categories are already featured'}</option>
              {available.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name.en}
                  {c.isActive ? '' : ' (inactive)'}
                </option>
              ))}
            </select>
          </div>
          <Button variant="outline" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={add} disabled={!pick}>
            Add
          </Button>
        </div>
      )}
    </div>
  );
}
