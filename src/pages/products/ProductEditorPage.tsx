import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, FormProvider, useFieldArray, useForm, useFormContext, useWatch, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { ArrowDown, ArrowUp, ImagePlus, Plus, RefreshCw, Star, Trash2, X } from 'lucide-react';
import { MediaPickerModal, useMediaMap } from '@/components/media/MediaPicker';
import { Button, IconButton } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { EmptyState, ErrorState, Notice, Skeleton } from '@/components/ui/Feedback';
import { CheckboxField, SelectField, TextareaField, TextField } from '@/components/ui/Form';
import { ContentLangProvider, LocalizedField } from '@/components/ui/LocalizedField';
import { ActionBar, Card } from '@/components/ui/Page';
import { ProductStatusBadge, StockBadge } from '@/components/ui/StatusBadges';
import { usePageMeta, useSettings } from '@/hooks/misc';
import { invalidate, useQuery } from '@/hooks/useQuery';
import { ApiError, errorMessage } from '@/services/api';
import { categoryService } from '@/services/catalogServices';
import { itemGroupsApi, navLinksApi } from '@/api';
import { mediaService } from '@/services/contentServices';
import { productService } from '@/services/productService';
import { confirmAction, toast } from '@/store';
import type { Product, ProductInput, ProductStatus } from '@/types';
import { formatDateTime } from '@/utils/dates';
import { localized, num, numOrNull } from '@/utils/forms';
import { stockState } from '@/utils/inventoryRules';
import { cn, newId, slugify, SLUG_RE } from '@/utils/misc';
import { convertFromUsd, formatWithCode, toMajor, toMinor } from '@/utils/money';
import { comboKey, optionCombos, syncVariants, validateProduct, variantLabel, type Issue } from '@/utils/productRules';

// ---------------------------------------------------------------------------------------------
// Form model (prices in MAJOR USD units while editing; converted to minor units on save)
// ---------------------------------------------------------------------------------------------

const money = z.number({ invalid_type_error: 'Enter an amount.' }).min(0, 'Cannot be negative.');
const optionalMoney = z.number().positive('Must be above zero, or leave empty.').nullable();
const dim = z.number().min(0, 'Cannot be negative.').nullable();

const schema = z.object({
  name: localized(true, 120),
  shortDescription: localized(false, 200),
  description: localized(false, 5000),
  materials: localized(false, 500),
  care: localized(false, 1000),
  slug: z.string().trim().regex(SLUG_RE, 'Use lowercase letters, numbers and single hyphens.'),
  categoryId: z.string().min(1, 'Choose a category.'),
  itemGroupId: z.string().nullable().optional(),
  navLinkId: z.string().nullable().optional(),
  tagsText: z.string().max(700),
  basePrice: money,
  baseSalePrice: optionalMoney,
  images: z.array(z.object({ mediaId: z.string(), alt: localized(false, 200) })),
  options: z
    .array(
      z.object({
        id: z.string(),
        name: localized(true, 40),
        type: z.enum(['swatch', 'button']),
        values: z.array(z.object({ id: z.string(), label: localized(true, 40), swatch: z.string().nullable() })).min(1, 'Add at least one value.'),
      }),
    )
    .max(3, 'Use at most 3 options.'),
  variants: z
    .array(
      z.object({
        id: z.string(),
        sku: z.string().trim().min(1, 'SKU is required.'),
        options: z.record(z.string()),
        price: money,
        salePrice: optionalMoney,
        stock: z.number({ invalid_type_error: 'Enter a quantity.' }).int('Use a whole number.').min(0, 'Cannot be negative.'),
        imageIds: z.array(z.string()),
        isNew: z.boolean(),
      }),
    )
    .min(1, 'At least one variant is required.')
    .max(250, 'A product can have at most 250 variants. Reduce the number of option values.'),
  weight: z.object({ value: dim, unit: z.enum(['g', 'kg']) }),
  dimensions: z.object({ length: dim, width: dim, height: dim, unit: z.enum(['cm', 'in']) }),
  specs: z.array(z.object({ id: z.string(), label: localized(true, 40), value: localized(true, 80) })),
  returnsAllowed: z.boolean(),
  exchangeAllowed: z.boolean(),
  returnDays: z.number().int().min(1).max(365),
  isFeatured: z.boolean(),
  isBestseller: z.boolean(),
  isNew: z.boolean(),
  displayOrder: z.number({ invalid_type_error: 'Enter a number.' }).int('Use a whole number.').min(0, 'Use 0 or more.'),
  seo: z.object({ title: localized(false, 70), description: localized(false, 160) }),
});
export type ProductForm = z.infer<typeof schema>;

const L = () => ({ en: '' });

function blankForm(): ProductForm {
  return {
    name: L(), shortDescription: L(), description: L(), materials: L(), care: L(),
    slug: '', categoryId: '', itemGroupId: null, navLinkId: null, tagsText: '', basePrice: 0, baseSalePrice: null, images: [], options: [],
    variants: [{ id: newId('var'), sku: '', options: {}, price: 0, salePrice: null, stock: 0, imageIds: [], isNew: true }],
    weight: { value: null, unit: 'g' }, dimensions: { length: null, width: null, height: null, unit: 'cm' }, specs: [],
    returnsAllowed: true, exchangeAllowed: true, returnDays: 30,
    isFeatured: false, isBestseller: false, isNew: true, displayOrder: 100, seo: { title: L(), description: L() },
  };
}

function toForm(p: Product): ProductForm {
  return {
    name: p.name, shortDescription: p.shortDescription, description: p.description, materials: p.materials, care: p.care,
    slug: p.slug, categoryId: p.categoryId, itemGroupId: p.itemGroupId ?? null, navLinkId: p.navLinkId ?? null, tagsText: p.tags.join(', '),
    basePrice: toMajor(p.basePrice), baseSalePrice: p.baseSalePrice === null ? null : toMajor(p.baseSalePrice),
    images: p.images, options: p.options,
    variants: p.variants.map((v) => ({ ...v, price: toMajor(v.price), salePrice: v.salePrice === null ? null : toMajor(v.salePrice), isNew: false })),
    weight: p.weight, dimensions: p.dimensions, specs: p.specs,
    returnsAllowed: p.returnsAllowed, exchangeAllowed: p.exchangeAllowed, returnDays: p.returnDays,
    isFeatured: p.isFeatured, isBestseller: p.isBestseller, isNew: p.isNew, displayOrder: p.displayOrder, seo: p.seo,
  };
}

function fromForm(v: ProductForm): ProductInput {
  return {
    name: v.name, shortDescription: v.shortDescription, description: v.description, materials: v.materials, care: v.care,
    slug: v.slug.trim(), categoryId: v.categoryId, itemGroupId: v.itemGroupId ?? null, navLinkId: v.navLinkId ?? null,
    tags: v.tagsText.split(',').map((t) => t.trim()).filter(Boolean),
    basePrice: toMinor(v.basePrice), baseSalePrice: v.baseSalePrice === null ? null : toMinor(v.baseSalePrice),
    images: v.images, options: v.options,
    variants: v.variants.map(({ isNew: _n, ...x }) => ({ ...x, sku: x.sku.trim().toUpperCase(), price: toMinor(x.price), salePrice: x.salePrice === null ? null : toMinor(x.salePrice) })),
    weight: v.weight, dimensions: v.dimensions, specs: v.specs,
    returnsAllowed: v.returnsAllowed, exchangeAllowed: v.exchangeAllowed, returnDays: v.returnDays,
    isFeatured: v.isFeatured, isBestseller: v.isBestseller, isNew: v.isNew, displayOrder: v.displayOrder, seo: v.seo,
  };
}

/** Rule paths that differ between the service model and this form. */
const formPath = (p: string) => (p === 'tags' ? 'tagsText' : p);

function collectMessages(errors: FieldErrors, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(errors)) {
    if (!v || typeof v !== 'object') continue;
    const path = prefix ? `${prefix}.${k}` : k;
    if ('message' in v && typeof v.message === 'string' && v.message) out.push(v.message);
    else out.push(...collectMessages(v as FieldErrors, path));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------------------------

function PricePreview({ usdMajor }: { usdMajor: number | null }) {
  const { data: settings } = useSettings();
  if (!settings || usdMajor === null || !Number.isFinite(usdMajor) || usdMajor <= 0) return null;
  const others = settings.currencies.currencies.filter((c) => c.enabled && c.code !== 'USD');
  return (
    <p className="mt-1 text-xs text-ink-muted">
      ≈ {others.map((c) => formatWithCode(convertFromUsd(toMinor(usdMajor), c), c.code, c.fractionDigits)).join(' · ')} <span className="text-ink-faint">(current manual rates)</span>
    </p>
  );
}

function ImagesSection() {
  const { control } = useFormContext<ProductForm>();
  const { fields, append, remove, move } = useFieldArray({ control, name: 'images', keyName: 'key' });
  const { map } = useMediaMap();
  const [picking, setPicking] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [urlBusy, setUrlBusy] = useState(false);
  const [urlError, setUrlError] = useState('');
  const variants = useWatch({ control, name: 'variants' });
  return (
    <Card
      title="Images"
      description="The first image is the primary image. Alt text describes the photo for screen readers and SEO."
      actions={
        <Button size="sm" variant="outline" icon={<ImagePlus className="h-4 w-4" aria-hidden />} onClick={() => setPicking(true)}>
          Add images
        </Button>
      }
    >
      <div className="mb-4 rounded-lg border border-sand-200 bg-ivory-50 p-3">
        <div className="flex flex-col items-end gap-2 sm:flex-row">
          <TextField
            label="Add image from URL"
            type="url"
            value={imageUrl}
            onChange={(event) => { setImageUrl(event.target.value); setUrlError(''); }}
            placeholder="https://example.com/product-image.jpg"
            error={urlError}
            containerClassName="w-full flex-1"
          />
          <Button
            type="button"
            variant="outline"
            loading={urlBusy}
            disabled={!imageUrl.trim()}
            onClick={async () => {
              setUrlBusy(true);
              setUrlError('');
              try {
                const asset = await mediaService.importUrl(imageUrl.trim());
                invalidate('media');
                append({ mediaId: asset.id, alt: asset.alt });
                setImageUrl('');
                toast('Image URL added to this product.', 'success');
              } catch (error) {
                setUrlError(errorMessage(error));
              } finally {
                setUrlBusy(false);
              }
            }}
          >
            Add URL
          </Button>
        </div>
        <p className="mt-1 text-xs text-ink-muted">Paste a direct public URL to a JPEG, PNG, WebP or GIF image.</p>
      </div>
      {fields.length === 0 ? (
        <EmptyState icon={<ImagePlus className="h-6 w-6" aria-hidden />} title="No images yet" body="Active products need at least one image." className="py-6" />
      ) : (
        <ol className="space-y-4">
          {fields.map((f, i) => {
            const asset = map.get(f.mediaId);
            const usedBy = variants.filter((v) => v.imageIds.includes(f.mediaId)).length;
            return (
              <li key={f.key} className="flex flex-col gap-3 rounded-lg border border-sand-200 p-3 sm:flex-row">
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-md bg-sand-100">
                  {asset ? <img src={asset.url} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-xs text-red-700">Missing</span>}
                  {i === 0 && <span className="absolute left-1 top-1 rounded bg-ink/80 px-1.5 text-2xs font-semibold text-white">Primary</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <LocalizedField name={`images.${i}.alt`} label={`Alt text — image ${i + 1}`} maxLength={200} />
                  <p className="mt-1 truncate text-xs text-ink-muted">
                    {asset?.fileName}
                    {usedBy ? ` · used by ${usedBy} variant${usedBy === 1 ? '' : 's'}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1 sm:flex-col">
                  <IconButton size="sm" label={`Make image ${i + 1} primary`} disabled={i === 0} onClick={() => move(i, 0)}>
                    <Star className="h-4 w-4" aria-hidden />
                  </IconButton>
                  <IconButton size="sm" label={`Move image ${i + 1} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                    <ArrowUp className="h-4 w-4" aria-hidden />
                  </IconButton>
                  <IconButton size="sm" label={`Move image ${i + 1} down`} disabled={i === fields.length - 1} onClick={() => move(i, i + 1)}>
                    <ArrowDown className="h-4 w-4" aria-hidden />
                  </IconButton>
                  <IconButton size="sm" label={`Remove image ${i + 1}`} onClick={() => remove(i)}>
                    <Trash2 className="h-4 w-4 text-red-700" aria-hidden />
                  </IconButton>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {picking && (
        <MediaPickerModal
          open
          multiple
          title="Add product images"
          onClose={() => setPicking(false)}
          onSelect={(ids) => {
            const existing = new Set(fields.map((f) => f.mediaId));
            ids.filter((id) => !existing.has(id)).forEach((id) => append({ mediaId: id, alt: map.get(id)?.alt ?? { en: '' } }));
          }}
        />
      )}
    </Card>
  );
}

function OptionValues({ optionIndex, type }: { optionIndex: number; type: 'swatch' | 'button' }) {
  const { control, register, formState } = useFormContext<ProductForm>();
  const { fields, append, remove, move } = useFieldArray({ control, name: `options.${optionIndex}.values`, keyName: 'key' });
  const rootError = formState.errors.options?.[optionIndex]?.values?.root?.message ?? formState.errors.options?.[optionIndex]?.values?.message;
  return (
    <div className="space-y-3">
      {fields.map((f, vi) => (
        <div key={f.key} className="flex flex-wrap items-start gap-2 rounded-md bg-ivory-50 p-2">
          <LocalizedField name={`options.${optionIndex}.values.${vi}.label`} label={`Value ${vi + 1}`} required className="min-w-[12rem] flex-1" maxLength={40} />
          {type === 'swatch' && (
            <Controller
              control={control}
              name={`options.${optionIndex}.values.${vi}.swatch`}
              render={({ field }) => (
                <div>
                  <label className="label" htmlFor={`sw-${optionIndex}-${vi}`}>
                    Swatch
                  </label>
                  <input id={`sw-${optionIndex}-${vi}`} type="color" value={field.value ?? '#cccccc'} onChange={(e) => field.onChange(e.target.value)} className="h-9 w-14 cursor-pointer rounded border border-sand-300 bg-white" />
                </div>
              )}
            />
          )}
          <div className="flex gap-1 self-center pt-4">
            <IconButton size="sm" label="Move value up" disabled={vi === 0} onClick={() => move(vi, vi - 1)}>
              <ArrowUp className="h-4 w-4" aria-hidden />
            </IconButton>
            <IconButton size="sm" label="Move value down" disabled={vi === fields.length - 1} onClick={() => move(vi, vi + 1)}>
              <ArrowDown className="h-4 w-4" aria-hidden />
            </IconButton>
            <IconButton size="sm" label={`Remove value ${vi + 1}`} onClick={() => remove(vi)}>
              <X className="h-4 w-4" aria-hidden />
            </IconButton>
          </div>
          <input type="hidden" {...register(`options.${optionIndex}.values.${vi}.id`)} />
        </div>
      ))}
      {rootError && <p className="text-[13px] text-red-700">{rootError}</p>}
      <Button size="xs" variant="outline" icon={<Plus className="h-3.5 w-3.5" aria-hidden />} onClick={() => append({ id: newId('val'), label: { en: '' }, swatch: type === 'swatch' ? '#d8cab6' : null })}>
        Add value
      </Button>
    </div>
  );
}

function OptionsAndVariants({ productId, savedVariantIds }: { productId: string; savedVariantIds: Set<string> }) {
  const { control, register, getValues, setValue, formState } = useFormContext<ProductForm>();
  const options = useFieldArray({ control, name: 'options', keyName: 'key' });
  const variants = useFieldArray({ control, name: 'variants', keyName: 'key' });
  const watchedOptions = useWatch({ control, name: 'options' });
  const watchedVariants = useWatch({ control, name: 'variants' });
  const images = useWatch({ control, name: 'images' });
  const { data: settings } = useSettings();
  const { map } = useMediaMap();
  const [pendingSync, setPendingSync] = useState<{ removed: Array<{ sku: string; stock: number }>; apply: () => void } | null>(null);
  const threshold = settings?.store.lowStockThreshold ?? 5;

  const expected = useMemo(() => new Set(optionCombos(watchedOptions ?? []).map((c) => comboKey(c, watchedOptions ?? []))), [watchedOptions]);
  const outOfSync = watchedVariants.length !== expected.size || watchedVariants.some((v) => !expected.has(comboKey(v.options, watchedOptions ?? [])));

  const regenerate = () => {
    const v = getValues();
    const current = v.variants.map((x) => ({ ...x, price: x.price, salePrice: x.salePrice }));
    const slugPart = (v.slug || 'product').toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 20);
    const next = syncVariants(v.options, current, { price: v.basePrice, salePrice: v.baseSalePrice, skuPrefix: `YS-${slugPart}`, idPrefix: productId }).map((x) => ({
      ...x,
      id: current.some((c) => c.id === x.id) ? x.id : newId('var'),
      isNew: !savedVariantIds.has(x.id),
    }));
    const kept = new Set(next.map((x) => x.id));
    const removed = current.filter((x) => !kept.has(x.id) && x.stock > 0).map((x) => ({ sku: x.sku, stock: x.stock }));
    const apply = () => setValue('variants', next as ProductForm['variants'], { shouldDirty: true, shouldValidate: formState.isSubmitted });
    if (removed.length) setPendingSync({ removed, apply });
    else apply();
  };

  const applyBasePrice = () => {
    const v = getValues();
    v.variants.forEach((_, i) => {
      setValue(`variants.${i}.price`, v.basePrice, { shouldDirty: true });
      setValue(`variants.${i}.salePrice`, v.baseSalePrice, { shouldDirty: true });
    });
  };

  const rootError = formState.errors.variants?.root?.message ?? formState.errors.variants?.message;

  return (
    <Card
      title="Options & variants"
      description="Options (such as colour or size) generate one variant per combination. Each variant has its own SKU, price and stock."
      actions={
        watchedOptions.length < 3 && (
          <Button
            size="sm"
            variant="outline"
            icon={<Plus className="h-4 w-4" aria-hidden />}
            onClick={() => options.append({ id: newId('opt'), name: { en: '' }, type: 'button', values: [{ id: newId('val'), label: { en: '' }, swatch: null }] })}
          >
            Add option
          </Button>
        )
      }
    >
      <div className="space-y-4">
        {options.fields.map((f, oi) => (
          <fieldset key={f.key} className="rounded-lg border border-sand-200 p-3">
            <legend className="px-1 text-[13px] font-semibold">Option {oi + 1}</legend>
            <div className="mb-3 flex flex-wrap items-end gap-3">
              <LocalizedField name={`options.${oi}.name`} label="Option name" required className="min-w-[12rem] flex-1" maxLength={40} />
              <SelectField label="Display as" containerClassName="w-40" {...register(`options.${oi}.type`)}>
                <option value="button">Buttons (size, length)</option>
                <option value="swatch">Colour swatches</option>
              </SelectField>
              <Button size="sm" variant="dangerOutline" className="mb-0.5" onClick={() => options.remove(oi)} icon={<Trash2 className="h-3.5 w-3.5" aria-hidden />}>
                Remove option
              </Button>
            </div>
            <OptionValues optionIndex={oi} type={watchedOptions[oi]?.type ?? 'button'} />
          </fieldset>
        ))}
        {options.fields.length === 0 && <p className="text-[13px] text-ink-muted">No options — this product is sold as a single variant.</p>}

        {outOfSync && (
          <Notice tone="warning" role="status" title="Variants need updating" action={<Button size="xs" onClick={regenerate} icon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}>Update variants</Button>}>
            The options changed. Update variants to match every combination. Existing variants keep their SKU, prices and stock.
          </Notice>
        )}
        {rootError && <p className="text-[13px] text-red-700">{rootError}</p>}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-sand-200 pt-3">
          <p className="text-[13px] font-semibold">
            {variants.fields.length} variant{variants.fields.length === 1 ? '' : 's'} <span className="font-normal text-ink-muted">· prices in USD (base currency)</span>
          </p>
          <Button size="xs" variant="ghost" onClick={applyBasePrice}>
            Apply base price to all
          </Button>
        </div>
        <ul className="space-y-3">
          {variants.fields.map((f, i) => {
            const v = watchedVariants[i];
            const label = variantLabel(watchedOptions as never, v ?? f) ?? 'Default variant';
            const isNew = v?.isNew ?? f.isNew;
            const errs = formState.errors.variants?.[i];
            return (
              <li key={f.key} className="rounded-lg border border-sand-200 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <p className="text-[13px] font-semibold">{label}</p>
                  {!isNew && v && <StockBadge state={stockState(v.stock, threshold)} />}
                  {isNew && <span className="text-xs text-brand-700">New</span>}
                  {errs?.message && <span className="text-xs text-red-700">{errs.message}</span>}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <TextField label="SKU" required className="font-mono uppercase" error={errs?.sku?.message} {...register(`variants.${i}.sku`)} />
                  <TextField label="Price" prefix="USD" type="number" step="0.01" min={0} required error={errs?.price?.message} {...register(`variants.${i}.price`, { setValueAs: num })} />
                  <TextField label="Sale price" prefix="USD" type="number" step="0.01" min={0} error={errs?.salePrice?.message} {...register(`variants.${i}.salePrice`, { setValueAs: numOrNull })} />
                  {isNew ? (
                    <TextField label="Initial stock" type="number" step={1} min={0} hint="Recorded as a restock adjustment." error={errs?.stock?.message} {...register(`variants.${i}.stock`, { setValueAs: num })} />
                  ) : (
                    <div>
                      <p className="label">Stock</p>
                      <p className="flex h-9 items-center gap-2 text-sm">
                        <strong className="num">{v?.stock}</strong>
                        <Link to={`/inventory?q=${encodeURIComponent(v?.sku ?? '')}`} className="link text-xs">
                          Adjust in inventory
                        </Link>
                      </p>
                    </div>
                  )}
                </div>
                {images.length > 0 && (
                  <Controller
                    control={control}
                    name={`variants.${i}.imageIds`}
                    render={({ field }) => (
                      <fieldset className="mt-3">
                        <legend className="label">Images for this variant</legend>
                        <div className="flex flex-wrap gap-2">
                          {images.map((img, ii) => {
                            const on = field.value.includes(img.mediaId);
                            const asset = map.get(img.mediaId);
                            return (
                              <button
                                key={img.mediaId}
                                type="button"
                                aria-pressed={on}
                                aria-label={`${on ? 'Remove' : 'Use'} image ${ii + 1} for ${label}`}
                                onClick={() => field.onChange(on ? field.value.filter((x) => x !== img.mediaId) : [...field.value, img.mediaId])}
                                className={cn('h-12 w-12 overflow-hidden rounded-md border-2', on ? 'border-brand-600' : 'border-transparent opacity-60 hover:opacity-100')}
                              >
                                {asset && <img src={asset.url} alt="" className="h-full w-full object-cover" />}
                              </button>
                            );
                          })}
                        </div>
                        {errs?.imageIds?.message && <p className="mt-1 text-xs text-red-700">{errs.imageIds.message}</p>}
                      </fieldset>
                    )}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <ConfirmDialog
        open={!!pendingSync}
        onClose={() => setPendingSync(null)}
        title="Remove variants that still have stock?"
        confirmLabel="Update variants"
        tone="danger"
        onConfirm={() => {
          pendingSync?.apply();
          setPendingSync(null);
        }}
      >
        <p className="text-sm text-ink-soft">These combinations no longer exist, so their variants and stock will be removed when you save:</p>
        <ul className="mt-2 list-disc pl-5 text-sm">
          {pendingSync?.removed.map((r) => (
            <li key={r.sku}>
              <span className="font-mono">{r.sku}</span> — {r.stock} in stock
            </li>
          ))}
        </ul>
      </ConfirmDialog>
    </Card>
  );
}

function SpecsSection() {
  const { control } = useFormContext<ProductForm>();
  const { fields, append, remove } = useFieldArray({ control, name: 'specs', keyName: 'key' });
  return (
    <div className="space-y-3">
      <p className="label">Additional specifications</p>
      {fields.map((f, i) => (
        <div key={f.key} className="flex flex-wrap items-start gap-2 rounded-md bg-ivory-50 p-2">
          <LocalizedField name={`specs.${i}.label`} label="Label" required className="min-w-[10rem] flex-1" maxLength={40} />
          <LocalizedField name={`specs.${i}.value`} label="Value" required className="min-w-[10rem] flex-1" maxLength={80} />
          <IconButton size="sm" label={`Remove specification ${i + 1}`} className="mt-5" onClick={() => remove(i)}>
            <Trash2 className="h-4 w-4 text-red-700" aria-hidden />
          </IconButton>
        </div>
      ))}
      <Button size="xs" variant="outline" icon={<Plus className="h-3.5 w-3.5" aria-hidden />} onClick={() => append({ id: newId('spec'), label: { en: '' }, value: { en: '' } })}>
        Add specification (e.g. capacity)
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------

function Editor({ product }: { product: Product | null }) {
  const navigate = useNavigate();
  const idRef = useRef(product?.id ?? newId('new'));
  const { data: categories } = useQuery('categories', () => categoryService.list());
  const { data: itemGroups } = useQuery('item-groups', () => itemGroupsApi.fetchItemGroups());
  const { data: navLinks } = useQuery('nav-links', () => navLinksApi.fetchNavLinks());
  const { data: all } = useQuery('products:all', () => productService.all());
  const form = useForm<ProductForm>({ resolver: zodResolver(schema), defaultValues: product ? toForm(product) : blankForm(), mode: 'onSubmit' });
  const { register, handleSubmit, setError, setValue, control, formState, reset, getValues } = form;
  const [issues, setIssues] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [slugTouched, setSlugTouched] = useState(!!product);
  const nameEn = useWatch({ control, name: 'name.en' });
  const basePrice = useWatch({ control, name: 'basePrice' });
  const salePrice = useWatch({ control, name: 'baseSalePrice' });
  const status: ProductStatus = product?.status ?? 'draft';
  const savedVariantIds = useMemo(() => new Set(product?.variants.map((v) => v.id) ?? []), [product]);

  useEffect(() => {
    if (!slugTouched) setValue('slug', slugify(nameEn ?? ''));
  }, [nameEn, slugTouched, setValue]);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => formState.isDirty && !saving && currentLocation.pathname !== nextLocation.pathname);

  const save = (intent: ProductStatus) =>
    handleSubmit(
      async (v) => {
        setIssues([]);
        const input = fromForm(v);
        // Client-side business rules (the service re-checks everything).
        const ruleIssues: Issue[] = validateProduct(input, {
          intent,
          others: (all ?? []).filter((p) => p.id !== product?.id),
          categories: categories ?? [],
        });
        if (ruleIssues.length) {
          ruleIssues.forEach((i, idx) => setError(formPath(i.path) as never, { type: 'rule', message: i.message }, { shouldFocus: idx === 0 }));
          setIssues(ruleIssues.map((i) => i.message));
          toast(intent === 'active' ? 'This product cannot be activated yet.' : 'Please fix the highlighted fields.', 'error');
          return;
        }
        setSaving(true);
        try {
          const saved = product ? await productService.update(product.id, input, intent) : await productService.create(input, intent);
          invalidate('products', 'product:', 'inventory', 'adjustments', 'dashboard', 'categories', 'translation', 'media');
          reset(toForm(saved));
          toast(intent === 'active' ? (product?.status === 'active' ? 'Product saved.' : 'Product activated.') : intent === 'archived' ? 'Product saved (archived).' : 'Draft saved.', 'success');
          if (!product) navigate(`/products/${saved.id}/edit`, { replace: true });
        } catch (e) {
          if (e instanceof ApiError && e.code === 'validation') {
            e.issues.forEach((i, idx) => setError(formPath(i.path) as never, { type: 'server', message: i.message }, { shouldFocus: idx === 0 }));
            setIssues(e.issues.map((i) => i.message));
            toast(e.message, 'error');
          } else toast(errorMessage(e), 'error');
        } finally {
          setSaving(false);
        }
      },
      (errors) => {
        setIssues(collectMessages(errors).slice(0, 12));
        toast('Please fix the highlighted fields.', 'error');
      },
    )();

  const archive = async () => {
    if (!product) return;
    const ok = await confirmAction({ title: `Archive “${product.name.en}”?`, body: 'It stops being sellable. Unsaved edits are discarded.', confirmLabel: 'Archive', tone: 'danger' });
    if (!ok) return;
    try {
      await productService.setStatus([product.id], 'archived');
      invalidate('products', 'product:', 'inventory', 'dashboard');
      reset(getValues());
      toast('Product archived.', 'success');
      navigate('/products');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };


  return (
    <ContentLangProvider>
      <FormProvider {...form}>
        <form noValidate onSubmit={(e) => e.preventDefault()}>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <ProductStatusBadge status={status} />
            {product && <span className="text-xs text-ink-muted">Updated {formatDateTime(product.updatedAt)}</span>}
          </div>
          {issues.length > 0 && (
            <Notice tone="error" role="alert" className="mb-4" title="Please review">
              <ul className="list-disc pl-4">
                {[...new Set(issues)].map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </Notice>
          )}

          <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
            <div className="min-w-0 space-y-6">
              <Card title="Details">
                <div className="space-y-4">
                  <LocalizedField name="name" label="Product name" required maxLength={120} />
                  <LocalizedField name="shortDescription" label="Short description" maxLength={200} hint="One sentence shown under the title. Required to activate." />
                  <LocalizedField name="description" label="Description" multiline rows={5} hint="Required to activate." />
                  <TextField
                    id="slug"
                    label="URL slug"
                    required
                    prefix="/product/"
                    className="pl-[4.75rem]"
                    error={formState.errors.slug?.message}
                    hint="Lowercase letters, numbers and hyphens. Must be unique."
                    {...register('slug', { onChange: () => setSlugTouched(true) })}
                  />
                </div>
              </Card>

              <ImagesSection />
              <OptionsAndVariants productId={idRef.current} savedVariantIds={savedVariantIds} />

              <Card title="Materials, care & specifications">
                <div className="space-y-4">
                  <LocalizedField name="materials" label="Materials" multiline rows={2} />
                  <LocalizedField name="care" label="Care instructions" multiline rows={3} />
                  <SpecsSection />
                </div>
              </Card>

              <Card title="Search engine listing" description="Optional. Falls back to the product name and short description.">
                <div className="space-y-4">
                  <LocalizedField name="seo.title" label="SEO title" maxLength={70} />
                  <LocalizedField name="seo.description" label="SEO description" multiline rows={2} maxLength={160} />
                </div>
              </Card>
            </div>

            <div className="space-y-6">
              <Card title="Organisation">
                <div className="space-y-4">
                  <SelectField id="category" label="Category" required error={formState.errors.categoryId?.message} {...register('categoryId')}>
                    <option value="">Select…</option>
                    {(categories ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name.en}
                        {c.isActive ? '' : ' (inactive)'}
                      </option>
                    ))}
                  </SelectField>
                  <SelectField id="item-group" label="Item Group" error={formState.errors.itemGroupId?.message} {...register('itemGroupId')}>
                    <option value="">None</option>
                    {(itemGroups ?? []).filter((g) => g.isActive).map((g) => (
                      <option key={g.id} value={g.id}>{g.nameEn}</option>
                    ))}
                  </SelectField>
                  <SelectField id="nav-link" label="Nav Link" error={formState.errors.navLinkId?.message} {...register('navLinkId')}>
                    <option value="">None</option>
                    {(navLinks ?? []).filter((l) => l.isActive).map((l) => (
                      <option key={l.id} value={l.id}>{l.label.en} ({l.href})</option>
                    ))}
                  </SelectField>
                  <TextareaField id="tags" label="Tags" rows={2} hint="Comma separated, used for search." error={formState.errors.tagsText?.message} {...register('tagsText')} />
                  <TextField id="order" label="Display order" type="number" min={0} step={1} hint="Lower numbers show first in “Featured” sorting." error={formState.errors.displayOrder?.message} {...register('displayOrder', { setValueAs: num })} />
                  <fieldset className="space-y-2">
                    <legend className="label">Merchandising flags</legend>
                    <CheckboxField label="Featured" {...register('isFeatured')} />
                    <CheckboxField label="Bestseller" {...register('isBestseller')} />
                    <CheckboxField label="New arrival" {...register('isNew')} />
                  </fieldset>
                </div>
              </Card>

              <Card title="Pricing" description="USD is the base currency. Variants can override these defaults.">
                <div className="space-y-4">
                  <div>
                    <TextField id="base-price" label="Base price" prefix="USD" type="number" step="0.01" min={0} required error={formState.errors.basePrice?.message} {...register('basePrice', { setValueAs: num })} />
                    <PricePreview usdMajor={basePrice} />
                  </div>
                  <div>
                    <TextField id="sale-price" label="Sale price" prefix="USD" type="number" step="0.01" min={0} hint="Optional. Must be lower than the base price." error={formState.errors.baseSalePrice?.message} {...register('baseSalePrice', { setValueAs: numOrNull })} />
                    <PricePreview usdMajor={salePrice} />
                  </div>
                </div>
              </Card>

              <Card title="Shipping details">
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <TextField id="weight" label="Weight" type="number" step="any" min={0} containerClassName="flex-1" error={formState.errors.weight?.value?.message} {...register('weight.value', { setValueAs: numOrNull })} />
                    <SelectField label="Unit" containerClassName="w-20" {...register('weight.unit')}>
                      <option value="g">g</option>
                      <option value="kg">kg</option>
                    </SelectField>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <TextField label="Length" type="number" step="any" min={0} error={formState.errors.dimensions?.length?.message} {...register('dimensions.length', { setValueAs: numOrNull })} />
                    <TextField label="Width" type="number" step="any" min={0} error={formState.errors.dimensions?.width?.message} {...register('dimensions.width', { setValueAs: numOrNull })} />
                    <TextField label="Height" type="number" step="any" min={0} error={formState.errors.dimensions?.height?.message} {...register('dimensions.height', { setValueAs: numOrNull })} />
                  </div>
                  <SelectField label="Dimension unit" {...register('dimensions.unit')}>
                    <option value="cm">Centimetres (cm)</option>
                    <option value="in">Inches (in)</option>
                  </SelectField>
                </div>
              </Card>

              <Card title="Returns & exchanges" description="These settings appear on the product page for customers.">
                <div className="space-y-4">
                  <CheckboxField label="Returns accepted" {...register('returnsAllowed')} />
                  <p className="-mt-2 text-xs text-ink-muted">Customer can return this item after delivery.</p>
                  <CheckboxField label="Exchanges accepted" {...register('exchangeAllowed')} />
                  <p className="-mt-2 text-xs text-ink-muted">Customer can exchange this item after delivery.</p>
                  <TextField
                    id="return-days"
                    label="Return / exchange window (days)"
                    type="number"
                    min={1}
                    max={365}
                    step={1}
                    hint="Number of days after delivery during which returns and exchanges are accepted."
                    error={formState.errors.returnDays?.message}
                    {...register('returnDays', { setValueAs: (v) => (v === '' || v === null ? 30 : Number(v)) })}
                  />
                </div>
              </Card>
            </div>
          </div>

          <ActionBar status={formState.isDirty ? 'Unsaved changes' : product ? 'All changes saved' : 'New product — not saved yet'}>
            {product && status !== 'archived' && (
              <Button variant="ghost" onClick={() => void archive()}>
                Archive
              </Button>
            )}
            {status === 'active' ? (
              <>
                <Button variant="outline" loading={saving} onClick={() => void save('draft')}>
                  Move to draft
                </Button>
                <Button loading={saving} onClick={() => void save('active')}>
                  Save changes
                </Button>
              </>
            ) : status === 'archived' ? (
              <>
                <Button variant="outline" loading={saving} onClick={() => void save('archived')}>
                  Save
                </Button>
                <Button loading={saving} onClick={() => void save('draft')}>
                  Restore as draft
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" loading={saving} onClick={() => void save('draft')}>
                  Save draft
                </Button>
                <Button loading={saving} onClick={() => void save('active')}>
                  {product ? 'Activate' : 'Save & activate'}
                </Button>
              </>
            )}
          </ActionBar>
        </form>
      </FormProvider>

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onClose={() => blocker.reset?.()}
        title="Leave without saving?"
        confirmLabel="Discard changes"
        tone="danger"
        onConfirm={() => blocker.proceed?.()}
      >
        <p className="text-sm text-ink-soft">You have unsaved changes to this product. They will be lost.</p>
      </ConfirmDialog>
    </ContentLangProvider>
  );
}

export default function ProductEditorPage() {
  const { id } = useParams();
  const { data, error, isLoading, refetch } = useQuery(id ? `product:${id}` : null, () => productService.get(id!));
  usePageMeta(id ? (data?.name.en ?? 'Edit product') : 'New product', [{ label: 'Catalog' }, { label: 'Products', to: '/products' }]);
  if (!id) return <Editor key="new" product={null} />;
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-72" />
      </div>
    );
  }
  if (!data) {
    const notFound = error instanceof ApiError && error.code === 'not_found';
    return (
      <div className="card">
        {notFound ? (
          <EmptyState title="Product not found" body="It may have been removed in this preview session (data resets on refresh)." action={<Link to="/products" className="link">Back to products</Link>} />
        ) : (
          <ErrorState error={error} onRetry={refetch} />
        )}
      </div>
    );
  }
  return <Editor key={data.id} product={data} />;
}
