import type { Category, Product, ProductInput, ProductOption, ProductVariant, ProductStatus } from '@/types';
import { SLUG_RE } from './misc';

// Product business rules shared by the editor (instant feedback) and the mock service (authoritative check).
// Issue paths match react-hook-form field names so they can be shown next to the right input.

export interface Issue {
  path: string;
  message: string;
}

export const SKU_RE = /^[A-Z0-9][A-Z0-9-]{1,39}$/;
export const MAX_OPTIONS = 3;

/** Every combination of option values, in option order. No options -> one empty combination. */
export function optionCombos(options: Pick<ProductOption, 'id' | 'values'>[]): Record<string, string>[] {
  return options.reduce<Record<string, string>[]>(
    (acc, opt) => acc.flatMap((combo) => opt.values.map((v) => ({ ...combo, [opt.id]: v.id }))),
    [{}],
  );
}

export function comboKey(combo: Record<string, string>, options: Pick<ProductOption, 'id'>[]): string {
  return options.map((o) => combo[o.id] ?? '?').join('|');
}

export function variantLabel(options: ProductOption[], variant: Pick<ProductVariant, 'options'>, lang: 'en' | 'hi' = 'en'): string | null {
  if (!options.length) return null;
  const parts = options.map((o) => {
    const v = o.values.find((x) => x.id === variant.options[o.id]);
    return v ? v.label[lang] || v.label.en : '?';
  });
  return parts.join(' / ');
}

function skuPart(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 10) || 'X';
}

/**
 * Rebuild the variant list after options change. Existing variants keep their SKU, prices, stock and images when
 * their option combination still exists; new combinations get defaults; removed combinations are dropped.
 */
export function syncVariants(
  options: ProductOption[],
  existing: ProductVariant[],
  defaults: { price: number; salePrice: number | null; skuPrefix: string; idPrefix: string },
): ProductVariant[] {
  // A variant created before an option was added has no value for it: it adopts that option's first value,
  // so adding "Size" to a colour-only product keeps each colour's SKU, price and stock.
  const complete = (v: ProductVariant): Record<string, string> => {
    const opts = { ...v.options };
    for (const o of options) if (!(o.id in opts) && o.values[0]) opts[o.id] = o.values[0].id;
    return opts;
  };
  const byKey = new Map<string, ProductVariant>();
  for (const v of existing) {
    const key = comboKey(complete(v), options);
    if (!byKey.has(key)) byKey.set(key, v);
  }
  return optionCombos(options).map((combo) => {
    const key = comboKey(combo, options);
    const found = byKey.get(key);
    if (found) return { ...found, options: combo };
    const values = options.map((o) => combo[o.id]);
    const valueLabels = options.map((o) => skuPart(o.values.find((v) => v.id === combo[o.id])?.label.en ?? combo[o.id]));
    return {
      id: `${defaults.idPrefix}--${values.join('-') || 'default'}`,
      sku: [defaults.skuPrefix, ...valueLabels].filter(Boolean).join('-').slice(0, 40),
      options: combo,
      price: defaults.price,
      salePrice: defaults.salePrice,
      stock: 0,
      imageIds: [],
    };
  });
}

export function priceRange(variants: Pick<ProductVariant, 'price' | 'salePrice'>[]): { min: number; max: number } {
  const prices = variants.map((v) => v.salePrice ?? v.price);
  if (!prices.length) return { min: 0, max: 0 };
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

export function totalStock(p: Pick<Product, 'variants'>): number {
  return p.variants.reduce((s, v) => s + v.stock, 0);
}

interface RuleContext {
  intent: ProductStatus;
  /** All other products (any status) — used for slug/SKU uniqueness. */
  others: Pick<Product, 'id' | 'slug' | 'variants' | 'name'>[];
  categories: Pick<Category, 'id'>[];
  mediaIds?: Set<string>;
}

const blank = (s: string | undefined | null) => !s || !s.trim();

export function validateProduct(p: ProductInput, ctx: RuleContext): Issue[] {
  const issues: Issue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });
  const activating = ctx.intent === 'active';

  // Identity
  if (blank(p.name.en)) add('name.en', 'English name is required.');
  if (!SLUG_RE.test(p.slug)) add('slug', 'Use lowercase letters, numbers and single hyphens (e.g. "speckled-mug").');
  else if (ctx.others.some((o) => o.slug === p.slug)) add('slug', 'Another product already uses this slug.');
  if (!ctx.categories.some((c) => c.id === p.categoryId)) add('categoryId', 'Choose a category.');

  // Prices (USD minor units)
  if (!Number.isInteger(p.basePrice) || p.basePrice < 0) add('basePrice', 'Base price cannot be negative.');
  else if (activating && p.basePrice === 0) add('basePrice', 'Active products need a price above zero.');
  if (p.baseSalePrice !== null) {
    if (p.baseSalePrice <= 0) add('baseSalePrice', 'Sale price must be above zero, or left empty.');
    else if (p.baseSalePrice >= p.basePrice) add('baseSalePrice', 'Sale price must be lower than the base price.');
  }

  // Tags
  if (p.tags.length > 20) add('tags', 'Use at most 20 tags.');
  if (p.tags.some((t) => blank(t) || t.length > 30)) add('tags', 'Tags must be 1–30 characters.');
  if (new Set(p.tags.map((t) => t.toLowerCase())).size !== p.tags.length) add('tags', 'Tags must be unique.');

  // Images
  const imageIds = new Set(p.images.map((i) => i.mediaId));
  if (imageIds.size !== p.images.length) add('images', 'The same image is added twice.');
  if (ctx.mediaIds) p.images.forEach((img, i) => !ctx.mediaIds!.has(img.mediaId) && add(`images.${i}`, 'Image no longer exists in the media library.'));
  if (activating && p.images.length === 0) add('images', 'Add at least one image before activating.');

  // Options
  if (p.options.length > MAX_OPTIONS) add('options', `Use at most ${MAX_OPTIONS} options.`);
  const optionNames = new Set<string>();
  p.options.forEach((o, oi) => {
    const name = o.name.en.trim().toLowerCase();
    if (!name) add(`options.${oi}.name.en`, 'Option name is required.');
    else if (optionNames.has(name)) add(`options.${oi}.name.en`, 'Two options have the same name.');
    optionNames.add(name);
    if (o.values.length === 0) add(`options.${oi}.values`, 'Add at least one value.');
    const labels = new Set<string>();
    o.values.forEach((v, vi) => {
      const label = v.label.en.trim().toLowerCase();
      if (!label) add(`options.${oi}.values.${vi}.label.en`, 'Value label is required.');
      else if (labels.has(label)) add(`options.${oi}.values.${vi}.label.en`, 'Duplicate value in this option.');
      labels.add(label);
      if (o.type === 'swatch' && v.swatch && !/^#[0-9a-fA-F]{6}$/.test(v.swatch)) add(`options.${oi}.values.${vi}.swatch`, 'Use a hex colour like #C04A17.');
    });
  });

  // Variants
  if (p.variants.length === 0) add('variants', 'At least one variant is required.');
  const expected = new Set(optionCombos(p.options).map((c) => comboKey(c, p.options)));
  const seenCombos = new Map<string, number>();
  const seenSkus = new Map<string, number>();
  const otherSkus = new Map<string, string>();
  ctx.others.forEach((o) => o.variants.forEach((v) => otherSkus.set(v.sku.toUpperCase(), o.name.en)));

  p.variants.forEach((v, i) => {
    const key = comboKey(v.options, p.options);
    if (p.options.length && !expected.has(key)) add(`variants.${i}`, 'This variant does not match the current options.');
    if (seenCombos.has(key)) add(`variants.${i}`, 'Duplicate variant combination.');
    seenCombos.set(key, i);

    const sku = v.sku.trim().toUpperCase();
    if (!SKU_RE.test(sku)) add(`variants.${i}.sku`, 'SKU: 2–40 characters, A–Z, 0–9 and hyphens.');
    else if (seenSkus.has(sku)) add(`variants.${i}.sku`, 'SKU is used by another variant of this product.');
    else if (otherSkus.has(sku)) add(`variants.${i}.sku`, `SKU already used by "${otherSkus.get(sku)}".`);
    seenSkus.set(sku, i);

    if (!Number.isInteger(v.price) || v.price < 0) add(`variants.${i}.price`, 'Price cannot be negative.');
    else if (activating && v.price === 0) add(`variants.${i}.price`, 'Price must be above zero to activate.');
    if (v.salePrice !== null) {
      if (v.salePrice <= 0) add(`variants.${i}.salePrice`, 'Sale price must be above zero, or empty.');
      else if (v.salePrice >= v.price) add(`variants.${i}.salePrice`, 'Sale price must be lower than the price.');
    }
    if (!Number.isInteger(v.stock) || v.stock < 0) add(`variants.${i}.stock`, 'Stock must be a whole number, 0 or more.');
    if (v.imageIds.some((id) => !imageIds.has(id))) add(`variants.${i}.imageIds`, 'Variant images must be chosen from the product images.');
  });
  if (p.options.length && seenCombos.size < expected.size) add('variants', 'Some option combinations have no variant. Regenerate variants.');

  // Physical
  const nonNeg = (n: number | null) => n === null || (Number.isFinite(n) && n >= 0);
  if (!nonNeg(p.weight.value)) add('weight.value', 'Weight cannot be negative.');
  (['length', 'width', 'height'] as const).forEach((k) => !nonNeg(p.dimensions[k]) && add(`dimensions.${k}`, 'Dimensions cannot be negative.'));

  // Content needed to go live
  if (activating) {
    if (blank(p.shortDescription.en)) add('shortDescription.en', 'Short description is required to activate.');
    if (blank(p.description.en)) add('description.en', 'Description is required to activate.');
  }

  // SEO
  if (p.seo.title.en.length > 70) add('seo.title.en', 'SEO title should be 70 characters or fewer.');
  if (p.seo.description.en.length > 160) add('seo.description.en', 'SEO description should be 160 characters or fewer.');

  if (!Number.isInteger(p.displayOrder) || p.displayOrder < 0) add('displayOrder', 'Display order must be a whole number, 0 or more.');
  return issues;
}
