import type { ListQuery, ListResult, Product, ProductInput, ProductStatus, StockAdjustment } from '@/types';
import { stockState } from '@/utils/inventoryRules';
import { newId } from '@/utils/misc';
import { priceRange, totalStock, validateProduct, variantLabel } from '@/utils/productRules';
import { ApiError, mockRequest, validationError } from './api';
import { API_MODE, productsApi } from '@/api';
import { ADMIN_ACTOR, db, nowIso } from './db';
import { runList, type ListConfig } from './query';

// Future API: GET/POST /api/admin/products, GET/PUT /api/admin/products/:id,
// POST /api/admin/products/:id/duplicate, POST /api/admin/products/bulk-status.

function find(id: string): Product {
  const p = db.products.find((x) => x.id === id);
  if (!p) throw new ApiError('not_found', 'Product not found.');
  return p;
}

function normalize(input: ProductInput): ProductInput {
  return {
    ...input,
    slug: input.slug.trim(),
    tags: input.tags.map((t) => t.trim()).filter(Boolean),
    variants: input.variants.map((v) => ({ ...v, sku: v.sku.trim().toUpperCase() })),
  };
}

function check(input: ProductInput, status: ProductStatus, selfId?: string) {
  const issues = validateProduct(input, {
    intent: status,
    others: db.products.filter((p) => p.id !== selfId),
    categories: db.categories,
    mediaIds: new Set(db.media.map((m) => m.id)),
  });
  if (issues.length) throw validationError(issues, status === 'active' ? 'This product cannot be activated yet. Fix the highlighted fields.' : undefined);
}

function logInitialStock(p: Product, variantIds: Set<string>) {
  for (const v of p.variants) {
    if (!variantIds.has(v.id) || v.stock <= 0) continue;
    const adj: StockAdjustment = {
      id: newId('adj'),
      productId: p.id,
      variantId: v.id,
      sku: v.sku,
      productName: p.name.en,
      variantLabel: variantLabel(p.options, v),
      before: 0,
      after: v.stock,
      delta: v.stock,
      reason: 'restock',
      note: 'Initial stock for a new variant (product editor).',
      createdAt: nowIso(),
      actor: ADMIN_ACTOR,
    };
    db.adjustments.unshift(adj);
  }
}

/** Search, sort and filter rules for the product list — shared by the mock and API paths. */
function listConfig(threshold: number): ListConfig<Product> {
  return {
    search: (p) => [p.name.en, p.slug, p.tags.join(' '), ...p.variants.map((v) => v.sku)].join(' '),
    sorts: {
      name: (p) => p.name.en,
      price: (p) => priceRange(p.variants).min,
      stock: (p) => totalStock(p),
      updated: (p) => p.updatedAt,
      order: (p) => p.displayOrder,
    },
    filters: {
      status: (p, v) => p.status === v,
      category: (p, v) => p.categoryId === v,
      stock: (p, v) => {
        // A product is "low"/"out" if any of its variants is.
        const states = p.variants.map((x) => stockState(x.stock, threshold));
        return v === 'out' ? states.includes('out') : v === 'low' ? states.includes('low') : states.every((s) => s === 'in');
      },
      flag: (p, v) => (v === 'featured' ? p.isFeatured : v === 'bestseller' ? p.isBestseller : v === 'new' ? p.isNew : true),
      itemGroup: (p, v) => p.itemGroupId === v,
    },
    defaultSort: 'updated',
    defaultDir: 'desc',
  };
}

const ALL_PAGE_SIZE = 100;
const ALL_MAX_PAGES = 10; // Safety cap: pickers never need more than 1,000 products at once.

export const productService = {
  /** H16: in live mode the list is paged, filtered and sorted on the server (the old
   *  client-side runList over the whole catalogue was capped at 500 products). */
  list(query: ListQuery): Promise<ListResult<Product>> {
    const threshold = db.settings.store.lowStockThreshold;
    if (API_MODE) {
      const f = query.filters ?? {};
      return productsApi
        .fetchProducts({
          q: query.q || undefined,
          status: f.status as ProductStatus | undefined,
          category: f.category,
          stock: f.stock as 'in' | 'low' | 'out' | undefined,
          flag: f.flag as 'featured' | 'bestseller' | 'new' | undefined,
          sort: (query.sort ?? 'updated') as 'name' | 'price' | 'stock' | 'updated' | 'order',
          dir: query.dir ?? 'desc',
          itemGroup: f.itemGroup,
          page: query.page ?? 1,
          pageSize: query.pageSize ?? 20,
        })
        .then((res) => ({ items: res.items, total: res.total ?? res.items.length, page: res.page ?? 1, pageSize: res.pageSize ?? 20, pageCount: res.pageCount ?? 1 }));
    }
    return mockRequest(() => runList(db.products, query, listConfig(threshold)));
  },

  /** Lightweight full list for pickers (coupons, homepage sections). Fetches in pages
   *  of 100 so it still works once the catalogue grows past a single page. */
  async all(): Promise<Product[]> {
    if (API_MODE) {
      const items: Product[] = [];
      for (let page = 1; page <= ALL_MAX_PAGES; page++) {
        const res = await productsApi.fetchProducts({ page, pageSize: ALL_PAGE_SIZE, sort: 'updated', dir: 'desc' });
        items.push(...res.items);
        if (items.length >= (res.total ?? res.items.length) || res.items.length < ALL_PAGE_SIZE) break;
      }
      return items;
    }
    return mockRequest(() => db.products, [80, 200]);
  },

  get(id: string): Promise<Product> {
    if (API_MODE) return productsApi.fetchProduct(id);
    return mockRequest(() => find(id));
  },

  create(input: ProductInput, status: ProductStatus): Promise<Product> {
    if (API_MODE) return productsApi.createProduct(input, status);
    return mockRequest(() => {
      const data = normalize(input);
      check(data, status);
      const now = nowIso();
      const product: Product = { ...data, id: `p-${data.slug}`.slice(0, 60), status, createdAt: now, updatedAt: now };
      if (db.products.some((p) => p.id === product.id)) product.id = newId('p');
      db.products.unshift(product);
      logInitialStock(product, new Set(product.variants.map((v) => v.id)));
      return product;
    }, [400, 800]);
  },

  /**
   * Saves editor changes. Stock of EXISTING variants is ignored here — it can only change through
   * inventory adjustments (which require a reason). New variants may start with initial stock.
   */
  update(id: string, input: ProductInput, status: ProductStatus): Promise<Product> {
    if (API_MODE) return productsApi.updateProduct(id, input, status);
    return mockRequest(() => {
      const current = find(id);
      const prevStock = new Map(current.variants.map((v) => [v.id, v.stock]));
      const data = normalize(input);
      data.variants = data.variants.map((v) => (prevStock.has(v.id) ? { ...v, stock: prevStock.get(v.id)! } : v));
      check(data, status, id);
      const updated: Product = { ...current, ...data, status, updatedAt: nowIso() };
      db.products = db.products.map((p) => (p.id === id ? updated : p));
      logInitialStock(updated, new Set(updated.variants.filter((v) => !prevStock.has(v.id)).map((v) => v.id)));
      return updated;
    }, [400, 800]);
  },

  duplicate(id: string): Promise<Product> {
    // H17: live mode duplicates on the server (fresh slug/SKUs, draft copy); the old
    // mock-only path navigated to an id that 404s in live mode.
    if (API_MODE) return productsApi.duplicateProduct(id);
    return mockRequest(() => {
      const src = find(id);
      const slugs = new Set(db.products.map((p) => p.slug));
      let slug = `${src.slug}-copy`;
      for (let n = 2; slugs.has(slug); n++) slug = `${src.slug}-copy-${n}`;
      const skus = new Set(db.products.flatMap((p) => p.variants.map((v) => v.sku)));
      const uniqueSku = (sku: string) => {
        let candidate = `${sku}-COPY`.slice(0, 40);
        for (let n = 2; skus.has(candidate); n++) candidate = `${sku}-C${n}`.slice(0, 40);
        skus.add(candidate);
        return candidate;
      };
      const now = nowIso();
      const newIdBase = newId('p');
      const copy: Product = {
        ...structuredClone(src),
        id: newIdBase,
        slug,
        status: 'draft',
        name: { en: `${src.name.en} (copy)` },
        variants: src.variants.map((v) => ({ ...v, id: `${newIdBase}--${v.id.split('--')[1] ?? 'default'}`, sku: uniqueSku(v.sku), stock: 0 })),
        isFeatured: false,
        isBestseller: false,
        createdAt: now,
        updatedAt: now,
      };
      db.products.unshift(copy);
      return copy;
    });
  },

  /** H7: with a query only the filtered set is deleted. Inventory history is kept
   *  (audit trail, like the server); media files are kept too. */
  deleteAll(query?: ListQuery): Promise<{ ok: boolean; deleted: number }> {
    if (API_MODE) {
      const f = query?.filters ?? {};
      return productsApi.deleteAllProducts({
        q: query?.q || undefined,
        status: f.status as ProductStatus | undefined,
        category: f.category,
        stock: f.stock as 'in' | 'low' | 'out' | undefined,
        flag: f.flag as 'featured' | 'bestseller' | 'new' | undefined,
        itemGroup: f.itemGroup,
      });
    }
    return mockRequest(() => {
      if (!query) {
        const deleted = db.products.length;
        db.products = [];
        return { ok: true, deleted };
      }
      const { items } = runList(db.products, query, listConfig(db.settings.store.lowStockThreshold));
      const ids = new Set(items.map((p) => p.id));
      db.products = db.products.filter((p) => !ids.has(p.id));
      return { ok: true, deleted: ids.size };
    });
  },

  /** Bulk status change. Activation re-validates each product; failures are reported, not thrown. */
  setStatus(ids: string[], status: ProductStatus, names: Record<string, string> = {}): Promise<{ updated: string[]; failed: Array<{ id: string; name: string; reason: string }> }> {
    if (API_MODE) {
      return Promise.all(
        ids.map((id) =>
          productsApi
            .updateProductStatus(id, status)
            .then(() => ({ ok: true as const, id }))
            .catch((e: unknown) => ({ ok: false as const, id, reason: e instanceof ApiError ? (e.issues[0]?.message ?? e.message) : 'Could not update.' })),
        ),
      ).then((results) => ({
        updated: results.filter((r) => r.ok).map((r) => r.id),
        // L-P1: a failed product is named by its product name, not its id — the
        // caller passes the names it already has from the list; fall back to the
        // id only when no name is known.
        failed: results.filter((r) => !r.ok).map((r) => ({ id: r.id, name: names[r.id] ?? r.id, reason: (r as { reason: string }).reason })),
      }));
    }
    return mockRequest(() => {
      const updated: string[] = [];
      const failed: Array<{ id: string; name: string; reason: string }> = [];
      for (const id of ids) {
        const p = db.products.find((x) => x.id === id);
        if (!p) continue;
        if (status === 'active') {
          const { id: _i, status: _s, createdAt: _c, updatedAt: _u, ...input } = p;
          const issues = validateProduct(input, { intent: 'active', others: db.products.filter((x) => x.id !== id), categories: db.categories });
          if (issues.length) {
            failed.push({ id, name: p.name.en, reason: issues[0].message });
            continue;
          }
        }
        p.status = status;
        p.updatedAt = nowIso();
        updated.push(id);
      }
      return { updated, failed };
    }, [300, 700]);
  },
};
