import { useEffect, useState } from 'react';
import { Controller, FormProvider, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, RotateCcw, Save, Send, X } from 'lucide-react';
import { CategoryListEditor } from '@/components/content/CategoryListEditor';
import { PUBLISH_SIMULATION_TEXT } from '@/components/content/contentMeta';
import { HomepagePreview } from '@/components/content/HomepagePreview';
import { HOMEPAGE_LIST_MAX, ProductListEditor } from '@/components/content/ProductListEditor';
import { PublishStatus } from '@/components/content/PublishStatus';
import { useUnsavedChangesGuard } from '@/components/content/useUnsavedChangesGuard';
import { ImageField, useMediaMap } from '@/components/media/MediaPicker';
import { Button, IconButton } from '@/components/ui/Button';
import { ErrorState, Notice, Skeleton } from '@/components/ui/Feedback';
import { Switch, TextField } from '@/components/ui/Form';
import { ContentLangProvider, LocalizedField } from '@/components/ui/LocalizedField';
import { ActionBar, Card, PageHeader } from '@/components/ui/Page';
import { usePageMeta } from '@/hooks/misc';
import { invalidate, useQuery } from '@/hooks/useQuery';
import { ApiError, errorMessage, type FieldIssue } from '@/services/api';
import { categoryService } from '@/services/catalogServices';
import { contentService, hasUnpublishedChanges } from '@/services/contentServices';
import { productService } from '@/services/productService';
import { confirmAction, toast } from '@/store';
import type { HomepageContent, Versioned } from '@/types';
import { formatDateTime } from '@/utils/dates';
import { applyServerErrors, localized } from '@/utils/forms';
import { isHttpUrl } from '@/utils/misc';

const link = (example: string) =>
  z
    .string()
    .trim()
    .min(1, 'Enter a link.')
    .refine((v) => v.startsWith('/') || isHttpUrl(v), `Use a site path like ${example} or a full https:// URL.`);

const productIds = z.array(z.string()).max(HOMEPAGE_LIST_MAX, `Choose at most ${HOMEPAGE_LIST_MAX} products.`);

const schema = z
  .object({
    announcement: z.object({ enabled: z.boolean(), text: localized(false, 140) }),
    hero: z.object({ title: localized(true, 120), subtitle: localized(false, 300), imageId: z.string().nullable(), ctaLabel: localized(true, 40), ctaHref: link('/shop') }),
    featuredCategoryIds: z.array(z.string()),
    featuredProductIds: productIds,
    bestsellerProductIds: z.array(z.string()).max(8, 'Choose at most 8 products.'),
    newArrivalProductIds: z.array(z.string()).max(8, 'Choose at most 8 products.'),
    itemsProductIds: productIds,
    transferProductIds: productIds,
    story: z.object({ title: localized(true, 120), body: localized(false, 2000), imageId: z.string().nullable(), ctaLabel: localized(false, 40), ctaHref: link('/about') }),
    newsletter: z.object({ title: localized(true, 120), body: localized(false, 400) }),
  })
  .superRefine((v, ctx) => {
    if (v.announcement.enabled && !v.announcement.text.en.trim())
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['announcement', 'text', 'en'], message: 'Announcement text is required while the bar is enabled.' });
  });
type Values = z.infer<typeof schema>;

type ProductListName = 'featuredProductIds' | 'bestsellerProductIds' | 'newArrivalProductIds' | 'itemsProductIds' | 'transferProductIds';
const PRODUCT_LISTS: Array<{ name: ProductListName; title: string; description: string; maxItems: number }> = [
  { name: 'featuredProductIds', title: 'Featured items', description: 'First product row on the homepage, directly below the hero.', maxItems: 12 },
  { name: 'newArrivalProductIds', title: 'New arrivals', description: 'Second product row on the homepage.', maxItems: 8 },
  { name: 'bestsellerProductIds', title: 'Bestsellers', description: 'Third product row on the homepage.', maxItems: 8 },
  { name: 'itemsProductIds', title: 'Items', description: 'Fourth product row on the homepage.', maxItems: 12 },
  { name: 'transferProductIds', title: 'Transfer', description: 'Fifth product row on the homepage.', maxItems: 12 },
];

function HomepageEditor({ doc: loadedDoc }: { doc: Versioned<HomepageContent> }) {
  const [doc, setDoc] = useState(loadedDoc);
  useEffect(() => {
    setDoc(loadedDoc);
  }, [loadedDoc]);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      ...loadedDoc.draft,
      itemsProductIds: loadedDoc.draft.itemsProductIds ?? [],
      transferProductIds: loadedDoc.draft.transferProductIds ?? [],
    },
  });
  const {
    register,
    control,
    handleSubmit,
    setError,
    clearErrors,
    reset,
    getValues,
    formState: { errors, isDirty },
  } = form;
  const announcementEnabled = useWatch({ control, name: 'announcement.enabled' });

  const { data: products } = useQuery('products:all', () => productService.all());
  const { data: categories } = useQuery('categories', () => categoryService.list());
  const { map: media } = useMediaMap();

  const [busy, setBusy] = useState<null | 'save' | 'publish' | 'discard'>(null);
  const [publishIssues, setPublishIssues] = useState<FieldIssue[]>([]);
  const [preview, setPreview] = useState<HomepageContent | null>(null);

  useUnsavedChangesGuard(isDirty);

  const changed = hasUnpublishedChanges(doc);
  const canDiscard = !!doc.published && (changed || isDirty);

  const applySaved = (next: Versioned<HomepageContent>) => {
    setDoc(next);
    reset({
      ...next.draft,
      itemsProductIds: next.draft.itemsProductIds ?? [],
      transferProductIds: next.draft.transferProductIds ?? [],
    });
    invalidate('homepage', 'translation', 'media');
  };

  /** Saves the given (validated) values as the draft. Returns true on success. */
  const persist = async (values: Values, quiet = false) => {
    try {
      applySaved(await contentService.saveHomepageDraft(values));
      if (!quiet) toast('Draft saved. Publishing is a separate step.', 'success');
      return true;
    } catch (e) {
      applyServerErrors(e, setError, 'Could not save the draft.');
      return false;
    }
  };

  const onInvalid = () => toast('Please fix the highlighted fields.', 'error');

  const onSave = handleSubmit(async (values) => {
    setBusy('save');
    await persist(values);
    setBusy(null);
  }, onInvalid);

  const validateAndSave = () =>
    new Promise<boolean>((resolve) => {
      void handleSubmit(
        async (values) => resolve(await persist(values, true)),
        () => {
          toast('Fix the highlighted fields before publishing.', 'error');
          resolve(false);
        },
      )();
    });

  const publish = async () => {
    const saveFirst = isDirty;
    const ok = await confirmAction({
      title: 'Publish homepage (simulated)?',
      body: (
        <div className="space-y-2">
          <p>{saveFirst ? 'Your unsaved edits are saved to the draft first; then the draft becomes the published version.' : 'The saved draft becomes the published version.'}</p>
          <p>{PUBLISH_SIMULATION_TEXT}</p>
        </div>
      ),
      confirmLabel: 'Publish in admin preview',
    });
    if (!ok) return;
    setBusy('publish');
    setPublishIssues([]);
    try {
      if (saveFirst && !(await validateAndSave())) return;
      applySaved(await contentService.publishHomepage());
      toast('Published in the admin preview only. The storefront is not updated until backend integration.', 'success');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'validation') setPublishIssues(e.issues);
      applyServerErrors(e, setError, 'Could not publish.');
    } finally {
      setBusy(null);
    }
  };

  const discard = async () => {
    const ok = await confirmAction({
      title: 'Discard draft changes?',
      body: `The draft goes back to the version published in the admin preview on ${formatDateTime(doc.publishedAt)}. Unsaved edits are lost too. This can’t be undone.`,
      confirmLabel: 'Discard changes',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy('discard');
    try {
      applySaved(await contentService.discardHomepageDraft());
      setPublishIssues([]);
      toast('Draft changes discarded.', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const openPreview = () => setPreview(getValues());

  return (
    <ContentLangProvider>
      <FormProvider {...form}>
        <PageHeader
          description={<PublishStatus doc={doc} dirty={isDirty} />}
          actions={
            <Button variant="outline" icon={<Eye className="h-4 w-4" aria-hidden />} onClick={openPreview}>
              Preview
            </Button>
          }
        />

        {publishIssues.length > 0 && (
          <Notice
            tone="error"
            role="alert"
            title="Publishing was blocked"
            className="mb-5"
            action={
              <IconButton size="sm" label="Dismiss publishing problems" onClick={() => setPublishIssues([])}>
                <X className="h-4 w-4" aria-hidden />
              </IconButton>
            }
          >
            <p>The draft was kept. Fix these and publish again:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {publishIssues.map((i, idx) => (
                <li key={idx}>{i.message}</li>
              ))}
            </ul>
          </Notice>
        )}

        <form id="homepage-form" onSubmit={onSave} noValidate className="space-y-5">

          <Card title="Announcement bar" description="Thin strip above the storefront header.">
            <Controller
              control={control}
              name="announcement.enabled"
              render={({ field }) => <Switch label="Show announcement bar" description="When off, the text is kept but not shown." checked={field.value} onChange={field.onChange} />}
            />
            <LocalizedField name="announcement.text" label="Announcement text" required={announcementEnabled} maxLength={140} className="mt-4" />
          </Card>

          <Card title="Hero" description="The large banner at the top of the homepage.">
            <div className="space-y-4">
              <LocalizedField name="hero.title" label="Title" required multiline rows={2} maxLength={120} hint="Press Enter for a line break — the title is shown over two lines." />
              <LocalizedField name="hero.subtitle" label="Subtitle" multiline rows={3} maxLength={300} />
              <div className="grid gap-4 sm:grid-cols-2">
                <LocalizedField name="hero.ctaLabel" label="Button label" required maxLength={40} />
                <TextField label="Button link" required hint="A site path like /shop or a full https:// URL." placeholder="/shop" error={errors.hero?.ctaHref?.message} {...register('hero.ctaHref')} />
              </div>
              <Controller
                control={control}
                name="hero.imageId"
                render={({ field }) => (
                  <ImageField
                    label="Hero image"
                    aspect="wide"
                    value={field.value}
                    onChange={(id) => {
                      field.onChange(id);
                      clearErrors('hero.imageId');
                    }}
                    hint="Wide image beside the hero text."
                    error={errors.hero?.imageId?.message}
                  />
                )}
              />
            </div>
          </Card>

          {PRODUCT_LISTS.map((list) => (
            <Card key={list.name} title={list.title} description={`${list.description} Choose up to ${list.maxItems} products; only active products can be published.`}>
              <Controller
                control={control}
                name={list.name}
                render={({ field }) => (
                  <ProductListEditor
                    label={list.title}
                    value={field.value}
                    onChange={(ids) => {
                      field.onChange(ids);
                      clearErrors(list.name);
                    }}
                    products={products}
                    media={media}
                    error={errors[list.name]?.message}
                    max={list.maxItems}
                  />
                )}
              />
            </Card>
          ))}

          <Card title="Homepage categories" description="Category shortcuts shown below all three product rows. These group products; choose products above to control homepage items.">
            <Controller
              control={control}
              name="featuredCategoryIds"
              render={({ field }) => (
                <CategoryListEditor
                  value={field.value}
                  onChange={(ids) => {
                    field.onChange(ids);
                    clearErrors('featuredCategoryIds');
                  }}
                  categories={categories}
                  media={media}
                  error={errors.featuredCategoryIds?.message}
                />
              )}
            />
          </Card>

          <Card title="Brand story" description="The “about the studio” block further down the homepage.">
            <div className="space-y-4">
              <LocalizedField name="story.title" label="Title" required maxLength={120} />
              <LocalizedField name="story.body" label="Text" multiline rows={6} maxLength={2000} hint="Leave an empty line between paragraphs." />
              <div className="grid gap-4 sm:grid-cols-2">
                <LocalizedField name="story.ctaLabel" label="Button label" maxLength={40} />
                <TextField label="Button link" required hint="A site path like /about or a full https:// URL." placeholder="/about" error={errors.story?.ctaHref?.message} {...register('story.ctaHref')} />
              </div>
              <Controller
                control={control}
                name="story.imageId"
                render={({ field }) => (
                  <ImageField
                    label="Story image"
                    value={field.value}
                    onChange={(id) => {
                      field.onChange(id);
                      clearErrors('story.imageId');
                    }}
                    error={errors.story?.imageId?.message}
                  />
                )}
              />
            </div>
          </Card>

          <Card title="Newsletter" description="Sign-up block near the footer.">
            <div className="space-y-4">
              <LocalizedField name="newsletter.title" label="Title" required maxLength={120} />
              <LocalizedField name="newsletter.body" label="Text" multiline rows={3} maxLength={400} />
            </div>
          </Card>
        </form>

        <ActionBar
          status={
            isDirty
              ? 'You have unsaved edits.'
              : !doc.published
                ? 'Draft saved. Not published yet.'
                : changed
                  ? 'Draft saved. It differs from the published version (admin preview).'
                  : 'Draft matches the published version (admin preview).'
          }
        >
          {canDiscard && (
            <Button variant="ghost" icon={<RotateCcw className="h-4 w-4" aria-hidden />} onClick={discard} loading={busy === 'discard'} disabled={!!busy}>
              Discard draft changes
            </Button>
          )}
          <Button variant="outline" icon={<Eye className="h-4 w-4" aria-hidden />} onClick={openPreview}>
            Preview
          </Button>
          <Button variant="outline" type="submit" form="homepage-form" icon={<Save className="h-4 w-4" aria-hidden />} loading={busy === 'save'} disabled={!!busy || !isDirty}>
            Save draft
          </Button>
          <Button icon={<Send className="h-4 w-4" aria-hidden />} onClick={publish} loading={busy === 'publish'} disabled={!!busy || (!isDirty && !changed && !!doc.published)}>
            Publish…
          </Button>
        </ActionBar>

        {preview && <HomepagePreview open values={preview} onClose={() => setPreview(null)} categories={categories} products={products} media={media} />}
      </FormProvider>
    </ContentLangProvider>
  );
}

export default function HomepageContentPage() {
  usePageMeta('Homepage', [{ label: 'Content' }]);
  const { data, error, refetch } = useQuery('homepage', () => contentService.getHomepage());

  if (!data) {
    if (error)
      return (
        <div className="card">
          <ErrorState error={error} onRetry={refetch} />
        </div>
      );
    return (
      <div className="space-y-5" aria-busy="true">
        <Skeleton className="h-12 w-full max-w-xl" />
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    );
  }
  return <HomepageEditor doc={data} />;
}
