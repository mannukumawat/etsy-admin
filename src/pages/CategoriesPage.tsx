import { useEffect, useState } from 'react';
import { Controller, FormProvider, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { FolderPlus, FolderTree, Pencil, Trash2 } from 'lucide-react';
import { ImageField, useMediaMap } from '@/components/media/MediaPicker';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog, Drawer } from '@/components/ui/Dialog';
import { Badge, EmptyState, ErrorState, Notice, Skeleton } from '@/components/ui/Feedback';
import { SelectField, Switch, TextField } from '@/components/ui/Form';
import { ContentLangProvider, LocalizedField } from '@/components/ui/LocalizedField';
import { Menu } from '@/components/ui/Menu';
import { PageHeader } from '@/components/ui/Page';
import { usePageMeta } from '@/hooks/misc';
import { invalidate, useQuery } from '@/hooks/useQuery';
import { ApiError, errorMessage } from '@/services/api';
import { categoryService, type CategoryInput } from '@/services/catalogServices';
import { toast } from '@/store';
import type { CategoryWithCount } from '@/types';
import { applyServerErrors, localized, num } from '@/utils/forms';
import { slugify, SLUG_RE } from '@/utils/misc';

const schema = z.object({
  name: localized(true, 60),
  description: localized(false, 300),
  slug: z.string().trim().regex(SLUG_RE, 'Use lowercase letters, numbers and single hyphens.'),
  imageId: z.string().nullable(),
  bannerId: z.string().nullable(),
  displayOrder: z.number({ invalid_type_error: 'Enter a number.' }).int('Use a whole number.').min(0, 'Use 0 or more.'),
  isActive: z.boolean(),
});
type Values = z.infer<typeof schema>;

const empty: Values = { name: { en: '' }, description: { en: '' }, slug: '', imageId: null, bannerId: null, displayOrder: 0, isActive: true };

function CategoryForm({ category, nextOrder, onDone }: { category: CategoryWithCount | null; nextOrder: number; onDone: () => void }) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: category
      ? { name: category.name, description: category.description, slug: category.slug, imageId: category.imageId, bannerId: category.bannerId, displayOrder: category.displayOrder, isActive: category.isActive }
      : { ...empty, displayOrder: nextOrder },
  });
  const { register, handleSubmit, setError, setValue, control, formState } = form;
  const [slugTouched, setSlugTouched] = useState(!!category);
  const nameEn = useWatch({ control, name: 'name.en' });
  useEffect(() => {
    if (!slugTouched) setValue('slug', slugify(nameEn ?? ''));
  }, [nameEn, slugTouched, setValue]);

  const onSubmit = async (v: Values) => {
    const input: CategoryInput = { ...v };
    try {
      if (category) await categoryService.update(category.id, input);
      else await categoryService.create(input);
      invalidate('categories', 'products', 'dashboard', 'translation', 'media');
      toast(category ? 'Category saved.' : 'Category created.', 'success');
      onDone();
    } catch (e) {
      applyServerErrors(e, setError);
    }
  };

  return (
    <FormProvider {...form}>
      <form id="category-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <LocalizedField name="name" label="Name" required maxLength={60} />
        <LocalizedField name="description" label="Description" multiline rows={3} maxLength={300} />
        <TextField
          id="cat-slug"
          label="Slug"
          required
          hint="Used in the storefront URL: /category/slug"
          error={formState.errors.slug?.message}
          {...register('slug', { onChange: () => setSlugTouched(true) })}
        />
        <Controller control={control} name="imageId" render={({ field }) => <ImageField label="Category image" value={field.value} onChange={field.onChange} hint="Shown in category circles." />} />
        <Controller control={control} name="bannerId" render={({ field }) => <ImageField label="Banner" value={field.value} onChange={field.onChange} aspect="wide" hint="Wide image at the top of the category page." />} />
        <TextField id="cat-order" type="number" min={0} step={1} label="Display order" hint="Lower numbers appear first." required error={formState.errors.displayOrder?.message} {...register('displayOrder', { setValueAs: num })} />
        <Controller control={control} name="isActive" render={({ field }) => <Switch label="Active" description="Inactive categories are hidden from storefront navigation." checked={field.value} onChange={field.onChange} />} />
      </form>
    </FormProvider>
  );
}

export default function CategoriesPage() {
  usePageMeta('Categories', [{ label: 'Catalog' }]);
  const { data, isLoading, error, refetch } = useQuery('categories', () => categoryService.list());
  const { map: media } = useMediaMap();
  const [editing, setEditing] = useState<CategoryWithCount | 'new' | null>(null);
  const [deleting, setDeleting] = useState<CategoryWithCount | null>(null);
  const [reassignTo, setReassignTo] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const nextOrder = Math.max(0, ...(data ?? []).map((c) => c.displayOrder)) + 10;

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteError(null);
    try {
      const res = await categoryService.remove(deleting.id, deleting.productCount ? reassignTo : undefined);
      invalidate('categories', 'products', 'inventory', 'dashboard', 'coupons', 'homepage', 'media');
      toast(res.moved ? `Category deleted. ${res.moved} products moved.` : 'Category deleted.', 'success');
      setDeleting(null);
    } catch (e) {
      setDeleteError(e instanceof ApiError ? e.message : errorMessage(e));
    }
  };

  return (
    <ContentLangProvider>
      <PageHeader
        description="Categories drive storefront navigation, the homepage category circles and shop filters. IDs stay stable when you rename or re-slug."
        actions={
          <Button icon={<FolderPlus className="h-4 w-4" aria-hidden />} onClick={() => setEditing('new')}>
            Add category
          </Button>
        }
      />
      <div className="card">
        {error && !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : isLoading ? (
          <div className="space-y-3 p-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : !data?.length ? (
          <EmptyState icon={<FolderTree className="h-6 w-6" aria-hidden />} title="No categories yet" action={<Button onClick={() => setEditing('new')}>Add category</Button>} />
        ) : (
          <ul className="divide-y divide-sand-200">
            {data.map((c) => {
              const img = c.imageId ? media.get(c.imageId) : undefined;
              return (
                <li key={c.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-sand-200 bg-sand-100">{img && <img src={img.url} alt="" className="h-full w-full object-cover" />}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" className="font-medium text-ink hover:underline" onClick={() => setEditing(c)}>
                        {c.name.en}
                      </button>
                      {!c.isActive && <Badge tone="muted">Inactive</Badge>}
                    </div>
                    <p className="truncate text-xs text-ink-muted">
                      /category/{c.slug} · order {c.displayOrder}
                    </p>
                  </div>
                  <Link to={`/products?category=${c.id}`} className="hidden text-[13px] text-ink-soft hover:underline sm:block">
                    {c.productCount} product{c.productCount === 1 ? '' : 's'}
                  </Link>
                  <Menu
                    label={`Actions for ${c.name.en}`}
                    items={[
                      { label: 'Edit', icon: <Pencil className="h-4 w-4" aria-hidden />, onSelect: () => setEditing(c) },
                      {
                        label: 'Delete…',
                        icon: <Trash2 className="h-4 w-4" aria-hidden />,
                        danger: true,
                        onSelect: () => {
                          setDeleting(c);
                          setReassignTo('');
                          setDeleteError(null);
                        },
                      },
                    ]}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Add category' : `Edit ${editing?.name.en ?? ''}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" form="category-form">
              {editing === 'new' ? 'Create category' : 'Save category'}
            </Button>
          </div>
        }
      >
        {editing !== null && <CategoryForm key={editing === 'new' ? 'new' : editing.id} category={editing === 'new' ? null : editing} nextOrder={nextOrder} onDone={() => setEditing(null)} />}
      </Drawer>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Delete “${deleting?.name.en ?? ''}”?`}
        confirmLabel={deleting?.productCount ? 'Move products and delete' : 'Delete category'}
        tone="danger"
        disabled={!!deleting?.productCount && !reassignTo}
        onConfirm={confirmDelete}
      >
        {deleting && deleting.productCount > 0 ? (
          <div className="space-y-3">
            <Notice tone="warning">
              {deleting.productCount} product{deleting.productCount === 1 ? '' : 's'} use this category. Choose where to move them before deleting.
            </Notice>
            <SelectField label="Move products to" required value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
              <option value="">Select a category…</option>
              {(data ?? [])
                .filter((c) => c.id !== deleting.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name.en}
                    {c.isActive ? '' : ' (inactive)'}
                  </option>
                ))}
            </SelectField>
          </div>
        ) : (
          <p className="text-sm text-ink-soft">No products use this category. It will also be removed from homepage collections and coupon eligibility.</p>
        )}
        {deleteError && (
          <Notice tone="error" role="alert" className="mt-3">
            {deleteError}
          </Notice>
        )}
      </ConfirmDialog>
    </ContentLangProvider>
  );
}
