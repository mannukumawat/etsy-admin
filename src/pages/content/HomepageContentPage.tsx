import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, FormProvider, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, Layers, Plus, RotateCcw, Save, Send, X } from 'lucide-react';
import { itemGroupsApi } from '@/api';
import { PUBLISH_SIMULATION_TEXT } from '@/components/content/contentMeta';
import { HomepagePreview } from '@/components/content/HomepagePreview';
import { ItemGroupsOverview } from '@/components/content/ItemGroupsOverview';
import { buildHomepageItemGroups } from '@/components/content/itemGroupSections';
import { HOMEPAGE_LIST_MAX } from '@/components/content/ProductListEditor';
import { PublishStatus } from '@/components/content/PublishStatus';
import { ReorderControls, useReorderFocus } from '@/components/content/ReorderControls';
import { useUnsavedChangesGuard } from '@/components/content/useUnsavedChangesGuard';
import { ImageField, useMediaMap } from '@/components/media/MediaPicker';
import { Button, ButtonLink, IconButton } from '@/components/ui/Button';
import { ErrorState, Notice, Skeleton } from '@/components/ui/Feedback';
import { Switch, TextField } from '@/components/ui/Form';
import { ContentLangProvider, LocalizedField } from '@/components/ui/LocalizedField';
import { ActionBar, Card, PageHeader } from '@/components/ui/Page';
import { usePageMeta } from '@/hooks/misc';
import { invalidate, useQuery } from '@/hooks/useQuery';
import { ApiError, errorMessage, type FieldIssue } from '@/services/api';
import { contentService, hasUnpublishedChanges } from '@/services/contentServices';
import { productService } from '@/services/productService';
import { confirmAction, toast } from '@/store';
import type { HomepageContent, Versioned } from '@/types';
import { formatDateTime } from '@/utils/dates';
import { applyServerErrors, localized } from '@/utils/forms';
import { isHttpUrl, newId } from '@/utils/misc';

const MAX_SLIDES = 6;

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
    slides: z
      .array(
        z.object({
          id: z.string(),
          imageId: z.string().nullable(),
          title: localized(false, 120),
          subtitle: localized(false, 240),
          ctaLabel: localized(false, 40),
          ctaHref: z.string().trim().refine((v) => v === '' || v.startsWith('/') || isHttpUrl(v), 'Use a site path like /shop or a full https:// URL.'),
        }),
      )
      .max(MAX_SLIDES, `Use at most ${MAX_SLIDES} banners.`),
    featuredCategoryIds: z.array(z.string()),
    featuredProductIds: productIds,
    bestsellerProductIds: z.array(z.string()).max(8, 'Choose at most 8 products.'),
    newArrivalProductIds: z.array(z.string()).max(8, 'Choose at most 8 products.'),
    itemsProductIds: productIds,
    transferProductIds: productIds,
    // Brand story is no longer edited on the homepage (see Content > About us). Kept only so existing saved data passes through untouched.
    story: z.object({ title: localized(false, 120), body: localized(false, 2000), imageId: z.string().nullable(), ctaLabel: localized(false, 40), ctaHref: z.string() }),
    newsletter: z.object({ title: localized(true, 120), body: localized(false, 400) }),
  })
  .superRefine((v, ctx) => {
    if (v.announcement.enabled && !v.announcement.text.en.trim())
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['announcement', 'text', 'en'], message: 'Announcement text is required while the bar is enabled.' });
  });
type Values = z.infer<typeof schema>;

function HomepageEditor({ doc: loadedDoc }: { doc: Versioned<HomepageContent> }) {
  const [doc, setDoc] = useState(loadedDoc);
  useEffect(() => {
    setDoc(loadedDoc);
  }, [loadedDoc]);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      ...loadedDoc.draft,
      slides: loadedDoc.draft.slides ?? [],
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
  const { fields: slideFields, append: appendSlide, remove: removeSlide, move: moveSlide } = useFieldArray({ control, name: 'slides', keyName: 'fieldKey' });
  const addSlideRef = useRef<HTMLButtonElement>(null);
  const slideFocus = useReorderFocus<HTMLOListElement>(addSlideRef);

  const { map: media } = useMediaMap();
  const { data: itemGroups } = useQuery('item-groups', () => itemGroupsApi.fetchItemGroups());
  const { data: products } = useQuery('products:all', () => productService.all());
  const itemSections = useMemo(() => buildHomepageItemGroups(itemGroups, products), [itemGroups, products]);

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
      slides: next.draft.slides ?? [],
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


          <Card
            title="Slider banners"
            description="Extra banners that slide after the hero at the top of the homepage. With none, the slider shows only the hero. Add a banner to make it slide automatically."
            actions={<span className="text-xs text-ink-muted num">{slideFields.length} / {MAX_SLIDES}</span>}
          >
            {slideFields.length === 0 ? (
              <p className="rounded-lg border border-dashed border-sand-300 px-3 py-6 text-center text-[13px] text-ink-muted">No extra banners. The slider shows only the hero.</p>
            ) : (
              <ol ref={slideFocus.ref} className="space-y-4" aria-label="Slider banners">
                {slideFields.map((f, i) => (
                  <li key={f.fieldKey} data-reorder-id={f.fieldKey} className="rounded-lg border border-sand-200 bg-ivory-50/60">
                    <div className="flex items-center justify-between gap-2 border-b border-sand-200 px-3 py-2">
                      <p className="text-[13px] font-semibold text-ink">
                        <span className="text-ink-muted">Slide {i + 2}</span> <span className="text-xs font-normal text-ink-faint">(after the hero)</span>
                      </p>
                      <ReorderControls
                        index={i}
                        count={slideFields.length}
                        itemLabel={`banner ${i + 1}`}
                        onMove={(to) => {
                          const key = f.fieldKey;
                          moveSlide(i, to);
                          slideFocus.afterMove(key, to < i ? 'up' : 'down', `Banner moved to position ${to + 1} of ${slideFields.length}.`);
                        }}
                        onRemove={() => {
                          const nextKey = slideFields[i + 1]?.fieldKey ?? slideFields[i - 1]?.fieldKey ?? null;
                          removeSlide(i);
                          slideFocus.afterRemove(nextKey, `Banner ${i + 1} removed.`);
                        }}
                        removeLabel={`Remove banner ${i + 1}`}
                      />
                    </div>
                    <div className="space-y-4 p-3">
                      <Controller
                        control={control}
                        name={`slides.${i}.imageId`}
                        render={({ field }) => (
                          <ImageField
                            label="Banner image"
                            aspect="wide"
                            value={field.value}
                            onChange={(id) => {
                              field.onChange(id);
                              clearErrors(`slides.${i}.imageId`);
                            }}
                            hint="Wide image (e.g. 1600×760). Required."
                            error={errors.slides?.[i]?.imageId?.message}
                          />
                        )}
                      />
                      <LocalizedField name={`slides.${i}.title`} label="Title (optional)" maxLength={120} />
                      <LocalizedField name={`slides.${i}.subtitle`} label="Subtitle (optional)" multiline rows={2} maxLength={240} />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <LocalizedField name={`slides.${i}.ctaLabel`} label="Button label (optional)" maxLength={40} />
                        <TextField label="Button link" hint="Site path like /shop or a full https:// URL. The button shows only if both label and link are set." placeholder="/shop" error={errors.slides?.[i]?.ctaHref?.message} {...register(`slides.${i}.ctaHref`)} />
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {slideFocus.live}
            <Button
              ref={addSlideRef}
              variant="outline"
              size="sm"
              className="mt-4"
              icon={<Plus className="h-4 w-4" aria-hidden />}
              onClick={() => appendSlide({ id: newId('slide'), imageId: null, title: { en: '' }, subtitle: { en: '' }, ctaLabel: { en: '' }, ctaHref: '' })}
              disabled={slideFields.length >= MAX_SLIDES}
            >
              Add banner
            </Button>
          </Card>

          <Card
            title="Item groups"
            description="Product rows shown on the homepage below the hero. Managed from Item Groups and each product's Item Group field."
            actions={
              <ButtonLink to="/item-groups" variant="outline" size="sm" icon={<Layers className="h-3.5 w-3.5" aria-hidden />}>
                Manage item groups
              </ButtonLink>
            }
          >
            <ItemGroupsOverview sections={itemSections} media={media} loading={!itemGroups || !products} />
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

        {preview && <HomepagePreview open values={preview} onClose={() => setPreview(null)} media={media} itemSections={itemSections} />}
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
