import { beforeEach, describe, expect, it } from 'vitest';
import type { ProductInput } from '@/types';
import { toUsd } from '@/utils/money';
import { wasPaid } from '@/utils/orderRules';
import { ApiError } from './api';
import { categoryService, inventoryService } from './catalogServices';
import { contentService, mediaService } from './contentServices';
import { db, resetDb } from './db';
import { productService } from './productService';
import { couponService, customerService, orderService } from './salesServices';
import { dashboardService, settingsService } from './settingsService';

const NOW = new Date('2026-10-30T12:00:00');

function inputOf(id: string): ProductInput {
  const { id: _i, status: _s, createdAt: _c, updatedAt: _u, ...rest } = structuredClone(db.products.find((p) => p.id === id)!);
  return rest;
}

async function expectApiError(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toBeInstanceOf(ApiError);
  await p.catch((e: ApiError) => expect(e.code).toBe(code));
}

beforeEach(() => resetDb(NOW));

describe('seed data', () => {
  it('reuses storefront ids and is internally consistent', () => {
    expect(db.products.filter((p) => p.status === 'active')).toHaveLength(20);
    expect(db.products.find((p) => p.id === 'p-mug')?.variants.map((v) => v.sku)).toEqual(['YS-MUG-SAND', 'YS-MUG-SAGE', 'YS-MUG-BLUSH', 'YS-MUG-CHARCOAL']);
    expect(db.categories.map((c) => c.id)).toEqual(['ceramics', 'bags', 'jewellery', 'home-decor', 'gift-sets']);
    for (const o of db.orders) {
      expect(o.lines.reduce((s, l) => s + l.lineTotal, 0)).toBe(o.subtotal);
      expect(o.total).toBe(o.subtotal - o.discount + o.shipping + o.tax);
      expect(o.refundedTotal).toBeLessThanOrEqual(o.total);
      expect(o.events.every((e) => new Date(e.at) <= NOW)).toBe(true);
      if (o.fulfilment.status === 'shipped' || o.fulfilment.status === 'delivered') expect(o.fulfilment.trackingNumber).toBeTruthy();
      if (!wasPaid(o.payment.status)) expect(['unfulfilled', 'cancelled']).toContain(o.fulfilment.status);
    }
    expect(new Set(db.orders.map((o) => o.number)).size).toBe(db.orders.length);
    expect(db.coupons.find((c) => c.code === 'WELCOME10')!.timesUsed).toBe(db.orders.filter((o) => o.couponCode === 'WELCOME10' && o.payment.status !== 'failed').length);
    // Adjustment history chains to today's stock level.
    const sand = db.adjustments.filter((a) => a.variantId === 'p-mug--sand');
    expect(sand[0].after).toBe(24);
  });
});

describe('products', () => {
  it('creates, rejects duplicate slugs/SKUs, and protects existing stock', async () => {
    const dup = { ...inputOf('p-vase'), name: { en: 'Copy', hi: '' } };
    await expect(productService.create(dup, 'draft')).rejects.toMatchObject({ code: 'validation' });

    const fresh = { ...inputOf('p-vase'), slug: 'new-vase', variants: [{ ...inputOf('p-vase').variants[0], id: 'nv', sku: 'YS-NEW-VASE', stock: 9 }] };
    const created = await productService.create(fresh, 'active');
    expect(created.status).toBe('active');
    expect(db.adjustments[0]).toMatchObject({ variantId: 'nv', after: 9, reason: 'restock' });

    const edit = inputOf('p-mug');
    edit.variants[0].stock = 999; // must be ignored — stock only changes through adjustments
    edit.name.en = 'Renamed mug';
    const updated = await productService.update('p-mug', edit, 'active');
    expect(updated.variants[0].stock).toBe(24);
    expect(updated.name.en).toBe('Renamed mug');
  });

  it('duplicates as a draft with unique slug and SKUs, and bulk activation validates each product', async () => {
    const copy = await productService.duplicate('p-mug');
    expect(copy).toMatchObject({ status: 'draft', slug: 'everyday-speckled-mug-copy' });
    expect(copy.variants.every((v) => v.sku.endsWith('-COPY') && v.stock === 0)).toBe(true);
    const res = await productService.setStatus(['p-table-runner', copy.id], 'active');
    expect(res.failed.map((f) => f.id)).toEqual(['p-table-runner']); // no image yet
    expect(res.updated).toEqual([copy.id]);
  });
});

describe('categories and inventory', () => {
  it('blocks deleting a category with products unless they are reassigned', async () => {
    await expectApiError(categoryService.remove('ceramics'), 'in_use');
    const res = await categoryService.remove('ceramics', 'home-decor');
    expect(res.moved).toBe(6);
    expect(db.products.some((p) => p.categoryId === 'ceramics')).toBe(false);
    await expect(categoryService.remove('gift-sets')).resolves.toEqual({ moved: 0 });
  });

  it('records stock adjustments with reasons and rejects negative stock', async () => {
    await expect(inventoryService.adjust({ variantId: 'p-vase--default', mode: 'remove', quantity: 10, reason: 'damaged', note: '' })).rejects.toMatchObject({ code: 'validation' });
    await expect(inventoryService.adjust({ variantId: 'p-vase--default', mode: 'add', quantity: 2, reason: 'other', note: '' })).rejects.toMatchObject({ code: 'validation' });
    const adj = await inventoryService.adjust({ variantId: 'p-vase--default', mode: 'add', quantity: 6, reason: 'restock', note: 'Batch 7' });
    expect(adj).toMatchObject({ before: 4, after: 10, delta: 6 });
    expect(db.products.find((p) => p.id === 'p-vase')!.variants[0].stock).toBe(10);
    const list = await inventoryService.list({ filters: { stock: 'out' } });
    expect(list.items.every((r) => r.stock <= 0)).toBe(true);
  });
});

describe('orders', () => {
  it('cancels with restock + simulated refund and keeps the original currency snapshot', async () => {
    const target = db.orders.find((o) => o.payment.status === 'paid' && o.fulfilment.status === 'unfulfilled')!;
    const line = target.lines[0];
    const before = db.products.find((p) => p.id === line.productId)!.variants.find((v) => v.id === line.variantId)!.stock;
    const snapshot = structuredClone(target.rateSnapshot);
    const unitPrice = line.unitPrice;
    // Changing current settings/prices must not alter the order.
    db.settings.currencies.currencies.forEach((c) => (c.rate = c.rate * 2 || 1));
    const after = await orderService.cancel(target.id, { restock: true, refund: true, reason: 'Customer request' });
    expect(after.fulfilment.status).toBe('cancelled');
    expect(after.payment.status).toBe('refunded');
    expect(after.refundedTotal).toBe(after.total);
    expect(after.rateSnapshot).toEqual(snapshot);
    expect(after.lines[0].unitPrice).toBe(unitPrice);
    const stockNow = db.products.find((p) => p.id === line.productId)!.variants.find((v) => v.id === line.variantId)!.stock;
    expect(stockNow).toBe(before + target.lines.filter((l) => l.variantId === line.variantId).reduce((s, l) => s + l.quantity, 0));
    await expectApiError(orderService.cancel(target.id, { restock: true, refund: true, reason: 'again' }), 'conflict');
  });

  it('follows the fulfilment lifecycle and validates tracking', async () => {
    const o = db.orders.find((x) => x.payment.status === 'paid' && x.fulfilment.status === 'unfulfilled')!;
    await expectApiError(orderService.advance(o.id, 'shipped'), 'conflict');
    await orderService.advance(o.id, 'processing');
    await expect(orderService.advance(o.id, 'shipped', { carrier: 'Demo', trackingNumber: '!', trackingUrl: 'nope' })).rejects.toMatchObject({ code: 'validation' });
    const shipped = await orderService.advance(o.id, 'shipped', { carrier: 'Demo Post', trackingNumber: 'DP55555', trackingUrl: 'https://tracking.example.com/DP55555' });
    expect(shipped.fulfilment).toMatchObject({ status: 'shipped', trackingNumber: 'DP55555' });
    await expectApiError(orderService.cancel(o.id, { restock: true, refund: true, reason: 'late' }), 'conflict');
    const partial = await orderService.refund(o.id, { amount: 100, reason: 'Goodwill' });
    expect(partial.payment.status).toBe('partially_refunded');
    const unpaid = db.orders.find((x) => x.payment.status === 'unpaid');
    if (unpaid) await expectApiError(orderService.advance(unpaid.id, 'processing'), 'conflict');
  });
});

describe('customers, coupons, content, media, settings, dashboard', () => {
  it('does not merge guest orders into an account with the same email', async () => {
    const list = await customerService.list({ pageSize: 100 });
    const olivia = list.items.filter((c) => c.email === 'olivia.hughes@example.com');
    expect(olivia.map((c) => c.kind).sort()).toEqual(['account', 'guest']);
    const guest = await customerService.get('guest:olivia.hughes@example.com');
    expect(guest.orders.every((o) => o.customer.kind === 'guest')).toBe(true);
    expect(guest.summary.spentUsd).toBe(guest.orders.reduce((s, o) => s + (['paid', 'partially_refunded', 'refunded'].includes(o.payment.status) ? toUsd(o.total - o.refundedTotal, o.rateSnapshot.rate) : 0), 0));
  });

  it('validates coupons and protects used ones', async () => {
    const base = { ...db.coupons.find((c) => c.code === 'SUMMER20')! };
    const { id: _i, timesUsed: _t, createdAt: _c, updatedAt: _u, ...input } = base;
    await expect(couponService.create({ ...input, code: 'welcome10' })).rejects.toMatchObject({ code: 'validation' });
    const created = await couponService.create({ ...input, code: 'new15', value: 15 });
    expect(created.code).toBe('NEW15');
    await expectApiError(couponService.remove('cpn_welcome10'), 'in_use');
  });

  it('keeps homepage drafts separate from the published copy', async () => {
    const home = await contentService.getHomepage();
    const draft = { ...home.draft, hero: { ...home.draft.hero, title: { en: 'New hero', hi: '' } } };
    await contentService.saveHomepageDraft(draft);
    expect(db.homepage.published!.hero.title.en).not.toBe('New hero');
    await contentService.publishHomepage();
    expect(db.homepage.published!.hero.title.en).toBe('New hero');
    db.products.find((p) => p.id === 'p-mug')!.status = 'draft';
    await expect(contentService.publishHomepage()).rejects.toMatchObject({ code: 'validation' });
  });

  it('warns before deleting referenced media and detaches references when forced', async () => {
    await expectApiError(mediaService.remove('m_hero'), 'in_use');
    await mediaService.remove('m_hero', true);
    expect(db.homepage.draft.hero.imageId).toBeNull();
    await expect(mediaService.add([{ url: 'blob:x', fileName: 'a.bmp', mimeType: 'image/bmp', sizeBytes: 10, width: 1, height: 1, alt: { en: '', hi: '' } }])).rejects.toMatchObject({ code: 'validation' });
  });

  it('validates settings and recomputes the dashboard with the new threshold', async () => {
    const cur = structuredClone(db.settings.currencies);
    cur.currencies[1].rate = -5;
    await expect(settingsService.updateCurrencies(cur)).rejects.toMatchObject({ code: 'validation' });
    const before = await dashboardService.metrics({ from: '2026-07-01', to: '2026-10-30' });
    await settingsService.setLowStockThreshold(15);
    const after = await dashboardService.metrics({ from: '2026-07-01', to: '2026-10-30' });
    expect(after.lowStockVariants).toBeGreaterThan(before.lowStockVariants);
    await expect(dashboardService.metrics({ from: '2026-10-30', to: '2026-10-01' })).rejects.toMatchObject({ code: 'validation' });
  });
});
