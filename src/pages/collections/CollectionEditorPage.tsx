import { useEffect, useState } from 'react';
import { Controller, FormProvider, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { ImageField, useMediaMap } from '@/components/media/MediaPicker';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ErrorState, Notice, Skeleton } from '@/components/ui/Feedback';
import { SelectField, TextField } from '@/components/ui/Form';
import { ContentLangProvider, LocalizedField } from '@/components/ui/LocalizedField';
import { PageHeader } from '@/components/ui/Page';
import { ProductListEditor } from '@/components/content/ProductListEditor';
import { usePageMeta } from '@/hooks/misc';
import { invalidate, useQuery } from '@/hooks/useQuery';
import { categoryService } from '@/services/catalogServices';
import { productService } from '@/services/productService';
import { collectionsApi, type AdminCollection } from '@/api';
import { toast } from '@/store';
import { applyServerErrors, localized } from '@/utils/forms';
import { slugify, SLUG_RE } from '@/utils/misc';

const localizedOptional = localized(false, 200);

const circleSchema = z.object({
  label: localized(true, 40),
  imageId: z.string().nullable(),
  linkType: z.enum(['category', 'collection', 'url']),
  linkValue: z.string().trim().min(1, 'Choose a destination.').max(200),
});

const sectionSchema = z.object({
  title: localized(true, 60),
  productIds: z.array(z.string()).default([]),
});

const schema = z.object({
  slug: z.string().trim().regex(SLUG_RE, 'Use lowercase letters, numbers and single hyphens.'),
  title: localized(true, 80),
  subtitle: localizedOptional,
  description: localized(false, 2000),
  heroImageId: z.string().nullable(),
  heroColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #F5ECE1.'),
  displayOrder: z.number().int().min(0),
  circles: z.array(circleSchema).max(12),
  sections: z.array(sectionSchema).min(1, 'Add at least one product section.').max(10),
});
type Values = z.infer<typeof schema>;

const emptyValues: Values = {
  slug: '',
  title: { en: '' },
  subtitle: { en: '' },
  description: { en: '' },
  heroImageId: null,
  heroColor: '#F5ECE1',
  displayOrder: 0,
  circles: [],
  sections: [{ title: { en: '' }, productIds: [] }],
};

function toValues(c: AdminCollection): Values {
  return {
    slug: c.slug,
    title: c.title,
    subtitle: c.subtitle,
    description: c.description,
    heroImageId: c.heroImageId,
    heroColor: c.heroColor,
    displayOrder: c.displayOrder,
    circles: c.circles.map((ci: AdminCollection['circles'][number]) => ({ label: ci.label, imageId: ci.imageId, linkType: ci.linkType, linkValue: ci.linkValue })),
    sections: c.sections.map((s: AdminCollection['sections'][number]) => ({ title: s.title, productIds: s.productIds })),
  };
}

export default function CollectionEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  usePageMeta(isNew ? 'New collection' : 'Edit collection', [{ label: 'Content' }, { label: 'Collections', to: '/collections' }]);

  const { data: existing, isLoading, error } = useQuery(isNew ? null : `collection:${id}`, () => collectionsApi.fetchCollection(id!));
  const { data: products } = useQuery('products:all', () => productService.all());
  const { data: categories } = useQuery('categories', () => categoryService.list());
  const { map: media } = useMediaMap();

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: emptyValues });
  const { register, handleSubmit, setError, setValue, control, formState, reset } = form;
  const [slugTouched, setSlugTouched] = useState(!isNew);

  useEffect(() => {
    if (existing) reset(toValues(existing));
  }, [existing, reset]);

  const titleEn = useWatch({ control, name: 'title.en' });
  useEffect(() => {
    if (!slugTouched) setValue('slug', slugify(titleEn ?? ''));
  }, [titleEn, slugTouched, setValue]);

  const circlesArray = useFieldArray({ control, name: 'circles' });
  const sectionsArray = useFieldArray({ control, name: 'sections' });
  const sectionsValue = useWatch({ control, name: 'sections' });

  const onSubmit = async (v: Values) => {
    const input = {
      slug: v.slug,
      titleEn: v.title.en,
      subtitleEn: v.subtitle.en,
      descriptionEn: v.description.en,
      heroImageId: v.heroImageId,
      heroColor: v.heroColor,
      displayOrder: v.displayOrder,
      circles: v.circles.map((c) => ({ labelEn: c.label.en, imageId: c.imageId, linkType: c.linkType, linkValue: c.linkValue })),
      sections: v.sections.map((s) => ({ titleEn: s.title.en, productIds: s.productIds })),
    };
    try {
      const saved = isNew ? await collectionsApi.createCollection(input) : await collectionsApi.updateCollection(id!, input);
      invalidate('collections');
      toast(isNew ? 'Collection created.' : 'Collection saved.', 'success');
      if (isNew) navigate(`/collections/${saved.id}/edit`, { replace: true });
    } catch (e) {
      applyServerErrors(e, setError);
    }
  };

  const publish = async (status: 'draft' | 'published') => {
    if (!id) return;
    try {
      await collectionsApi.updateCollectionStatus(id, status);
      invalidate('collections', `collection:${id}`);
      toast(status === 'published' ? 'Collection published.' : 'Collection unpublished.', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not update status.', 'error');
    }
  };

  if (!isNew && isLoading) return <Skeleton className="h-96" />;
  if (!isNew && error) return <ErrorState error={error} onRetry={() => {}} />;

  return (
    <ContentLangProvider>
      <PageHeader
        actions={
          <div className="flex items-center gap-2">
            <ButtonLink to="/collections" variant="ghost" icon={<ArrowLeft className="h-4 w-4" aria-hidden />}>
              Back
            </ButtonLink>
            {!isNew && existing && (
              <Button variant="outline" onClick={() => publish(existing.status === 'published' ? 'draft' : 'published')}>
                {existing.status === 'published' ? 'Unpublish' : 'Publish'}
              </Button>
            )}
            <Button type="submit" form="collection-form">
              Save
            </Button>
          </div>
        }
      />

      <FormProvider {...form}>
        <form id="collection-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-8">
          <section className="card space-y-5 p-5">
            <LocalizedField name="title" label="Title" required maxLength={80} />
            <TextField id="col-slug" label="Slug" required hint="Storefront URL: /collection/slug" error={formState.errors.slug?.message} {...register('slug', { onChange: () => setSlugTouched(true) })} />
            <LocalizedField name="subtitle" label="Subtitle" maxLength={200} />
            <LocalizedField name="description" label="Description" multiline rows={4} maxLength={2000} />
            <Controller control={control} name="heroImageId" render={({ field }) => <ImageField label="Hero image" value={field.value} onChange={field.onChange} aspect="wide" hint="Optional — shown behind the title." />} />
            <TextField id="col-color" label="Hero background colour" hint="Hex colour, e.g. #F5ECE1" error={formState.errors.heroColor?.message} {...register('heroColor')} />
          </section>

          <section className="card space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Circular links</h2>
              <Button type="button" variant="outline" size="sm" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => circlesArray.append({ label: { en: '' }, imageId: null, linkType: 'category', linkValue: '' })} disabled={circlesArray.fields.length >= 12}>
                Add circle
              </Button>
            </div>
            <p className="text-sm text-ink-muted">Round image links under the hero, to a category, another collection, or any URL. Leave empty for a curated listing page like "Top Gifts".</p>
            {circlesArray.fields.map((f, i) => {
              const linkType = form.watch(`circles.${i}.linkType`);
              return (
                <div key={f.id} className="grid gap-3 rounded-lg border border-sand-200 p-4 sm:grid-cols-[1fr_1fr_auto]">
                  <TextField id={`circle-${i}-en`} label="Label" {...register(`circles.${i}.label.en`)} error={formState.errors.circles?.[i]?.label?.en?.message} />
                  <Controller control={control} name={`circles.${i}.imageId`} render={({ field }) => <ImageField label="Image" value={field.value} onChange={field.onChange} />} />
                  <SelectField id={`circle-${i}-type`} label="Links to" {...register(`circles.${i}.linkType`)}>
                    <option value="category">Category</option>
                    <option value="collection">Collection</option>
                    <option value="url">URL</option>
                  </SelectField>
                  {linkType === 'category' ? (
                    <SelectField id={`circle-${i}-value`} label="Category" {...register(`circles.${i}.linkValue`)} error={formState.errors.circles?.[i]?.linkValue?.message}>
                      <option value="">Choose…</option>
                      {categories?.map((c) => <option key={c.id} value={c.slug}>{c.name.en}</option>)}
                    </SelectField>
                  ) : (
                    <TextField id={`circle-${i}-value`} label={linkType === 'collection' ? 'Collection slug' : 'URL or path'} {...register(`circles.${i}.linkValue`)} error={formState.errors.circles?.[i]?.linkValue?.message} />
                  )}
                  <Button type="button" variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" aria-hidden />} onClick={() => circlesArray.remove(i)}>
                    Remove
                  </Button>
                </div>
              );
            })}
          </section>

          <section className="card space-y-5 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Product sections</h2>
              <Button type="button" variant="outline" size="sm" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => sectionsArray.append({ title: { en: '' }, productIds: [] })} disabled={sectionsArray.fields.length >= 10}>
                Add section
              </Button>
            </div>
            {formState.errors.sections?.message && <Notice tone="error">{formState.errors.sections.message}</Notice>}
            {sectionsArray.fields.map((f, i) => (
              <div key={f.id} className="space-y-3 rounded-lg border border-sand-200 p-4">
                <div className="flex items-end gap-3">
                  <TextField id={`section-${i}-en`} label="Section title" className="flex-1" {...register(`sections.${i}.title.en`)} error={formState.errors.sections?.[i]?.title?.en?.message} />
                  {sectionsArray.fields.length > 1 && (
                    <Button type="button" variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" aria-hidden />} onClick={() => sectionsArray.remove(i)}>
                      Remove section
                    </Button>
                  )}
                </div>
                <Controller
                  control={control}
                  name={`sections.${i}.productIds`}
                  render={({ field }) => (
                    <ProductListEditor label={sectionsValue?.[i]?.title?.en || `Section ${i + 1}`} value={field.value} onChange={field.onChange} products={products} media={media} max={60} />
                  )}
                />
              </div>
            ))}
          </section>
        </form>
      </FormProvider>
    </ContentLangProvider>
  );
}
