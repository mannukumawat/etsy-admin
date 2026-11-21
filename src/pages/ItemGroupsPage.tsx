import { useState } from 'react';
import { Controller, FormProvider, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowDown, ArrowUp, ExternalLink, Layers, Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ConfirmDialog, Drawer } from '@/components/ui/Dialog';
import { Badge, EmptyState, ErrorState, Notice, Skeleton } from '@/components/ui/Feedback';
import { Switch, TextField } from '@/components/ui/Form';
import { MediaPickerModal, useMediaMap } from '@/components/media/MediaPicker';
import { PageHeader } from '@/components/ui/Page';
import { usePageMeta } from '@/hooks/misc';
import { invalidate, useQuery } from '@/hooks/useQuery';
import { itemGroupsApi } from '@/api';
import { APP } from '@/config/app';
import type { ItemGroup } from '@/types';
import { applyServerErrors } from '@/utils/forms';
import { errorMessage } from '@/services/api';
import { toast } from '@/store';

const schema = z.object({
  nameEn: z.string().trim().min(1, 'English name is required.').max(120),
  nameHi: z.string().trim().max(120).default(''),
  slug: z.string().trim().min(1, 'Slug is required.').max(80).regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and hyphens only.'),
  isActive: z.boolean(),
  /** M-O8: the group image — the backend persists imageId, so the form must carry it
   *  instead of always sending null (which cleared any image on every save). */
  imageId: z.string().nullable(),
});
type Values = z.infer<typeof schema>;

function ItemGroupForm({ group, nextPosition, onDone }: { group: ItemGroup | 'new'; nextPosition: number; onDone: () => void }) {
  const isNew = group === 'new';
  const { map } = useMediaMap();
  const [picking, setPicking] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: isNew
      ? { nameEn: '', nameHi: '', slug: '', isActive: true, imageId: null }
      : { nameEn: group.nameEn, nameHi: group.nameHi, slug: group.slug, isActive: group.isActive, imageId: group.imageId ?? null },
  });
  const { register, handleSubmit, setError, formState, control, setValue } = form;
  const imageId = useWatch({ control, name: 'imageId' });

  const autoSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const onSubmit = async (v: Values) => {
    const input = { nameEn: v.nameEn, nameHi: v.nameHi, slug: v.slug, isActive: v.isActive, position: isNew ? nextPosition : (group as ItemGroup).position, imageId: v.imageId ?? null };
    try {
      if (isNew) await itemGroupsApi.createItemGroup(input);
      else await itemGroupsApi.updateItemGroup((group as ItemGroup).id, input);
      invalidate('item-groups');
      toast(isNew ? 'Item group created.' : 'Item group saved.', 'success');
      onDone();
    } catch (e) {
      applyServerErrors(e, setError);
    }
  };

  return (
    <FormProvider {...form}>
      <form id="itemgroup-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <TextField
          label="Name (English)"
          required
          error={formState.errors.nameEn?.message}
          {...register('nameEn', {
            onChange: (e) => {
              if (isNew) setValue('slug', autoSlug(e.target.value), { shouldValidate: false });
            },
          })}
        />
        <TextField
          label="Name (Hindi)"
          error={formState.errors.nameHi?.message}
          {...register('nameHi')}
        />
        <TextField
          label="Slug"
          required
          hint="URL-safe identifier — lowercase, numbers and hyphens only."
          error={formState.errors.slug?.message}
          {...register('slug')}
        />
        <Controller
          control={control}
          name="isActive"
          render={({ field }) => (
            <Switch
              label="Active"
              description="Inactive groups are hidden from the storefront."
              checked={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <div>
          <span className="label">Image</span>
          <div className="flex items-center gap-3">
            {imageId && map.get(imageId)?.url ? (
              <img src={map.get(imageId)!.url} alt="" className="h-16 w-16 rounded-lg border border-sand-200 object-cover" />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-sand-300 text-xs text-ink-muted">No image</span>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setPicking(true)}>
                {imageId ? 'Change image' : 'Choose image'}
              </Button>
              {imageId && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setValue('imageId', null, { shouldDirty: true })}>
                  Remove
                </Button>
              )}
            </div>
          </div>
          <p className="mt-1.5 text-xs text-ink-muted">Shown with the group on the homepage. Saving keeps the chosen image — it is no longer cleared.</p>
        </div>
        {picking && (
          <MediaPickerModal
            open
            title="Choose group image"
            initial={imageId ? [imageId] : []}
            onClose={() => setPicking(false)}
            onSelect={(ids) => {
              if (ids[0]) setValue('imageId', ids[0], { shouldDirty: true });
              setPicking(false);
            }}
          />
        )}
      </form>
    </FormProvider>
  );
}

export default function ItemGroupsPage() {
  usePageMeta('Item Groups', [{ label: 'Catalog' }]);
  const { data, isLoading, error, refetch } = useQuery('item-groups', () => itemGroupsApi.fetchItemGroups());
  const { map: mediaMap } = useMediaMap();
  const [editing, setEditing] = useState<ItemGroup | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ItemGroup | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  const nextPosition = Math.max(-1, ...(data ?? []).map((g) => g.position)) + 1;

  const move = async (id: string, dir: -1 | 1) => {
    if (!data) return;
    const ids = data.map((g) => g.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setReordering(true);
    try {
      await itemGroupsApi.reorderItemGroups(ids);
      invalidate('item-groups');
    } catch (e) {
      // M-O11: a failed reorder used to fail silently (try/finally, no catch) — the
      // list never moved, with no explanation. Say so; the order is unchanged.
      toast(`Could not move the group: ${errorMessage(e)}`, 'error');
    } finally {
      setReordering(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteError(null);
    try {
      await itemGroupsApi.deleteItemGroup(deleting.id);
      invalidate('item-groups');
      toast('Item group deleted.', 'success');
      setDeleting(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Something went wrong.');
    }
  };

  return (
    <>
      <PageHeader
        description="Groups of products shown as sections on the homepage. Assign products to a group via the product editor."
        actions={
          <Button icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setEditing('new')}>
            Add group
          </Button>
        }
      />
      <div className="card">
        {error && !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : isLoading ? (
          <div className="space-y-3 p-4">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : !data?.length ? (
          <EmptyState
            icon={<Layers className="h-6 w-6" aria-hidden />}
            title="No item groups yet"
            body="Create groups and assign products to them to show curated sections on the homepage."
            action={<Button onClick={() => setEditing('new')}>Add group</Button>}
          />
        ) : (
          <ul className="divide-y divide-sand-200">
            {data.map((g, i) => (
              <li key={g.id} className="flex items-center gap-4 px-4 py-3">
                <div className="flex shrink-0 flex-col">
                  <button type="button" disabled={i === 0 || reordering} onClick={() => move(g.id, -1)} className="text-ink-muted hover:text-ink disabled:opacity-30" aria-label={`Move ${g.nameEn} up`}>
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button type="button" disabled={i === data.length - 1 || reordering} onClick={() => move(g.id, 1)} className="text-ink-muted hover:text-ink disabled:opacity-30" aria-label={`Move ${g.nameEn} down`}>
                    <ArrowDown className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-sand-200 bg-sand-100">
                  {g.imageId && mediaMap.get(g.imageId)?.url ? (
                    <img src={mediaMap.get(g.imageId)!.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <Layers className="h-4 w-4 text-ink-faint" aria-hidden />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className="font-medium text-ink hover:underline" onClick={() => setEditing(g)}>
                      {g.nameEn}
                    </button>
                    {!g.isActive && <Badge tone="muted">Inactive</Badge>}
                    {g.productCount !== undefined && (
                      <span className="rounded-full bg-sand-100 px-2 py-0.5 text-xs font-semibold text-ink-muted">
                        {g.productCount} {g.productCount === 1 ? 'product' : 'products'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-ink-muted">/{g.slug}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ButtonLink
                    to={`/products?itemGroup=${g.id}`}
                    variant="ghost"
                    size="sm"
                    icon={<Package className="h-4 w-4" aria-hidden />}
                    title={`View products in ${g.nameEn}`}
                  >
                    Products
                  </ButtonLink>
                  <a
                    href={`${APP.storefrontUrl}/shop?group=${g.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded p-1 text-ink-muted hover:bg-sand-100 hover:text-ink"
                    aria-label={`View ${g.nameEn} in store`}
                    title="View in store"
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden />
                  </a>
                  <button type="button" onClick={() => setEditing(g)} className="rounded p-1 text-ink-muted hover:bg-sand-100 hover:text-ink" aria-label={`Edit ${g.nameEn}`}>
                    <Pencil className="h-4 w-4" aria-hidden />
                  </button>
                  <button type="button" onClick={() => { setDeleting(g); setDeleteError(null); }} className="rounded p-1 text-ink-muted hover:bg-red-50 hover:text-red-600" aria-label={`Delete ${g.nameEn}`}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' || !editing ? 'Add item group' : `Edit ${(editing as ItemGroup).nameEn}`}
        footer={<Button type="submit" form="itemgroup-form">Save</Button>}
      >
        {editing !== null && <ItemGroupForm group={editing} nextPosition={nextPosition} onDone={() => setEditing(null)} />}
      </Drawer>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Delete "${deleting?.nameEn ?? ''}"?`}
        confirmLabel="Delete"
        tone="danger"
        onConfirm={confirmDelete}
      >
        <p>Products assigned to this group will be unlinked but not deleted.</p>
        {deleteError && <Notice tone="error" className="mt-3">{deleteError}</Notice>}
      </ConfirmDialog>
    </>
  );
}
