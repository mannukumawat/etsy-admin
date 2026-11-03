import type { AdjustmentMode, AdjustmentReason, Category, CategoryWithCount, InventoryRow, ListQuery, ListResult, StockAdjustment } from '@/types';
import { applyAdjustment, stockState } from '@/utils/inventoryRules';
import { newId, SLUG_RE } from '@/utils/misc';
import { variantLabel } from '@/utils/productRules';
import { ApiError, mockRequest, validationError, type FieldIssue } from './api';
import { API_MODE, categoriesApi, inventoryApi } from '@/api';
import { ADMIN_ACTOR, db, nowIso } from './db';
import { runList, type ListConfig } from './query';

// ---------------------------------------------------------------------------------------------
// Categories — future API: /api/admin/categories
// ---------------------------------------------------------------------------------------------

export type CategoryInput = Omit<Category, 'id' | 'createdAt' | 'updatedAt'>;

function checkCategory(input: CategoryInput, selfId?: string) {
  const issues: FieldIssue[] = [];
  if (!input.name.en.trim()) issues.push({ path: 'name.en', message: 'English name is required.' });
  if (!SLUG_RE.test(input.slug)) issues.push({ path: 'slug', message: 'Use lowercase letters, numbers and single hyphens.' });
  else if (db.categories.some((c) => c.slug === input.slug && c.id !== selfId)) issues.push({ path: 'slug', message: 'Another category already uses this slug.' });
  if (!Number.isInteger(input.displayOrder) || input.displayOrder < 0) issues.push({ path: 'displayOrder', message: 'Use a whole number, 0 or more.' });
  for (const key of ['imageId', 'bannerId'] as const) {
    const id = input[key];
    if (id && !db.media.some((m) => m.id === id)) issues.push({ path: key, message: 'Selected image no longer exists.' });
  }
  if (issues.length) throw validationError(issues);
}

const withCount = (c: Category): CategoryWithCount => ({ ...c, productCount: db.products.filter((p) => p.categoryId === c.id).length });

export const categoryService = {
  list(): Promise<CategoryWithCount[]> {
    if (API_MODE) return categoriesApi.fetchCategories();
    return mockRequest(() => [...db.categories].sort((a, b) => a.displayOrder - b.displayOrder || a.name.en.localeCompare(b.name.en)).map(withCount), [120, 300]);
  },

  create(input: CategoryInput): Promise<CategoryWithCount> {
    if (API_MODE) return categoriesApi.createCategory(input);
    return mockRequest(() => {
      checkCategory(input);
      const now = nowIso();
      const cat: Category = { ...input, id: db.categories.some((c) => c.id === input.slug) ? newId('cat') : input.slug, createdAt: now, updatedAt: now };
      db.categories.push(cat);
      return withCount(cat);
    });
  },

  update(id: string, input: CategoryInput): Promise<CategoryWithCount> {
    if (API_MODE) return categoriesApi.updateCategory(id, input);
    return mockRequest(() => {
      const cur = db.categories.find((c) => c.id === id);
      if (!cur) throw new ApiError('not_found', 'Category not found.');
      checkCategory(input, id);
      Object.assign(cur, input, { updatedAt: nowIso() });
      return withCount(cur);
    });
  },

  /** Deleting a category that still has products requires a reassignment target. */
  remove(id: string, reassignTo?: string): Promise<{ moved: number }> {
    return mockRequest(() => {
      const cat = db.categories.find((c) => c.id === id);
      if (!cat) throw new ApiError('not_found', 'Category not found.');
      const assigned = db.products.filter((p) => p.categoryId === id);
      if (assigned.length) {
        if (!reassignTo) throw new ApiError('in_use', `${assigned.length} products use this category. Choose another category for them first.`, [], { productCount: assigned.length });
        if (reassignTo === id || !db.categories.some((c) => c.id === reassignTo)) throw validationError([{ path: 'reassignTo', message: 'Choose a different, existing category.' }]);
        const now = nowIso();
        assigned.forEach((p) => {
          p.categoryId = reassignTo;
          p.updatedAt = now;
        });
      }
      db.categories = db.categories.filter((c) => c.id !== id);
      db.homepage.draft.featuredCategoryIds = db.homepage.draft.featuredCategoryIds.filter((c) => c !== id);
      db.coupons.forEach((c) => (c.categoryIds = c.categoryIds.filter((x) => x !== id)));
      return { moved: assigned.length };
    });
  },
};

// ---------------------------------------------------------------------------------------------
// Inventory — future API: GET /api/admin/inventory, POST /api/admin/inventory/adjustments
// ---------------------------------------------------------------------------------------------

function inventoryRows(): InventoryRow[] {
  const lastAdjusted = new Map<string, string>();
  for (const a of db.adjustments) if (!lastAdjusted.has(a.variantId) || lastAdjusted.get(a.variantId)! < a.createdAt) lastAdjusted.set(a.variantId, a.createdAt);
  const mediaUrl = new Map(db.media.map((m) => [m.id, m.url]));
  return db.products.flatMap((p) =>
    p.variants.map((v) => ({
      productId: p.id,
      variantId: v.id,
      sku: v.sku,
      productName: p.name,
      variantLabel: variantLabel(p.options, v),
      imageUrl: mediaUrl.get(v.imageIds[0] ?? p.images[0]?.mediaId ?? '') ?? null,
      categoryId: p.categoryId,
      productStatus: p.status,
      stock: v.stock,
      lastAdjustedAt: lastAdjusted.get(v.id) ?? null,
    })),
  );
}

export interface AdjustInput {
  variantId: string;
  mode: AdjustmentMode;
  quantity: number;
  reason: AdjustmentReason;
  note: string;
}

function inventoryListConfig(threshold: number): ListConfig<InventoryRow> {
  return {
    search: (r) => `${r.sku} ${r.productName.en} ${r.productName.hi} ${r.variantLabel ?? ''}`,
    sorts: { stock: (r) => r.stock, sku: (r) => r.sku, product: (r) => r.productName.en, adjusted: (r) => r.lastAdjustedAt ?? '' },
    filters: {
      stock: (r, v) => stockState(r.stock, threshold) === v,
      category: (r, v) => r.categoryId === v,
      status: (r, v) => r.productStatus === v,
    },
    defaultSort: 'stock',
  };
}

export const inventoryService = {
  list(query: ListQuery): Promise<ListResult<InventoryRow>> {
    const threshold = db.settings.store.lowStockThreshold;
    if (API_MODE) {
      // The API returns every variant; search/sort/paging stay client-side so the list UI behaves
      // the same in both modes.
      return inventoryApi.fetchInventory().then((items) => runList(items, query, inventoryListConfig(threshold)));
    }
    return mockRequest(() => runList(inventoryRows(), query, inventoryListConfig(threshold)));
  },

  adjust(input: AdjustInput): Promise<StockAdjustment> {
    if (API_MODE) return inventoryApi.adjustStock(input);
    return mockRequest(() => {
      const product = db.products.find((p) => p.variants.some((v) => v.id === input.variantId));
      const variant = product?.variants.find((v) => v.id === input.variantId);
      if (!product || !variant) throw new ApiError('not_found', 'Variant not found.');
      const issues: FieldIssue[] = [];
      if (input.reason === 'order_cancelled') issues.push({ path: 'reason', message: 'This reason is recorded automatically by order cancellations.' });
      if (input.reason === 'other' && input.note.trim().length < 3) issues.push({ path: 'note', message: 'Explain the adjustment when the reason is "Other".' });
      if (input.note.length > 300) issues.push({ path: 'note', message: 'Keep notes under 300 characters.' });
      const result = applyAdjustment(variant.stock, input.mode, input.quantity);
      if ('error' in result) issues.push({ path: 'quantity', message: result.error });
      if (issues.length) throw validationError(issues);
      const { after, delta } = result as { after: number; delta: number };
      const adj: StockAdjustment = {
        id: newId('adj'),
        productId: product.id,
        variantId: variant.id,
        sku: variant.sku,
        productName: product.name.en,
        variantLabel: variantLabel(product.options, variant),
        before: variant.stock,
        after,
        delta,
        reason: input.reason,
        note: input.note.trim(),
        createdAt: nowIso(),
        actor: ADMIN_ACTOR,
      };
      variant.stock = after;
      product.updatedAt = adj.createdAt;
      db.adjustments.unshift(adj);
      return adj;
    });
  },

  history(filter: { variantId?: string; q?: string; limit?: number } = {}): Promise<StockAdjustment[]> {
    if (API_MODE) return inventoryApi.fetchAdjustmentHistory(filter).then((items) => (filter.limit ? items.slice(0, filter.limit) : items));
    return mockRequest(() => {
      const q = filter.q?.trim().toLowerCase();
      return db.adjustments
        .filter((a) => (!filter.variantId || a.variantId === filter.variantId) && (!q || `${a.sku} ${a.productName}`.toLowerCase().includes(q)))
        .slice(0, filter.limit ?? 50);
    }, [120, 300]);
  },
};
